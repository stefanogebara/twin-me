/**
 * Pure decision logic for Gmail unread-count observations.
 *
 * Replan 2026-06-10 (Track B): the fetcher used to emit the LIFETIME unread
 * total as a fresh daily observation, so the same "40k unread" stat echoed
 * across every surface day after day (it appeared 6+ times in 3 days). Daily
 * observations now carry the DELTA versus the previous stored snapshot; the
 * lifetime mailbox totals are mentioned at most once per week.
 *
 * All functions here are pure (no DB, no network) so the decision rules are
 * unit-testable. Persistence of the counters lives in gmail.js.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Lifetime totals (mailbox size, read-percentage) may be mentioned at most
 * once per week. Returns true when the stored last-mentioned timestamp is
 * absent, unparseable, or older than 7 days.
 */
function shouldMentionLifetimeTotal(previous, now = new Date()) {
  const last = previous?.total_last_mentioned_at;
  if (!last) return true;
  const ts = new Date(last).getTime();
  if (Number.isNaN(ts)) return true;
  return now.getTime() - ts > WEEK_MS;
}

/**
 * Build the daily unread observation from the current count and the previous
 * snapshot. Returns null when there is nothing worth saying, otherwise
 * { observation: { content, contentType }, kind } where kind is one of:
 *  - 'zero'     inbox zero (always worth celebrating)
 *  - 'baseline' first snapshot ever — absolute count emitted once
 *  - 'delta'    inbox grew or shrank since the previous snapshot
 */
function buildUnreadDeltaObservation(inboxUnread, previous, now = new Date()) {
  if (!Number.isFinite(inboxUnread)) return null;

  if (inboxUnread === 0) {
    return {
      observation: { content: 'Practices inbox zero — 0 unread emails in inbox', contentType: 'daily_summary' },
      kind: 'zero',
    };
  }

  const prevUnread = previous?.inbox_unread;
  const prevAt = previous?.snapshot_at ? new Date(previous.snapshot_at).getTime() : NaN;
  if (!Number.isFinite(prevUnread) || Number.isNaN(prevAt)) {
    // First snapshot: emit the absolute count once as a baseline.
    const urgency = inboxUnread > 50 ? 'a backlog of' : inboxUnread > 20 ? 'a moderate pile of' : '';
    return {
      observation: {
        content: `Has ${urgency ? urgency + ' ' : ''}${inboxUnread} unread emails in inbox`,
        contentType: 'daily_summary',
      },
      kind: 'baseline',
    };
  }

  const delta = inboxUnread - prevUnread;
  // Unchanged count is not an observation — it fails the "so what" bar.
  if (delta === 0) return null;

  const days = Math.max(1, Math.round((now.getTime() - prevAt) / DAY_MS));
  const since = days <= 1 ? 'since yesterday' : `over the past ${days} days`;
  const content = delta > 0
    ? `Inbox grew by ${delta} unread email${delta === 1 ? '' : 's'} ${since}`
    : `Cleared ${-delta} unread email${delta === -1 ? '' : 's'} from the inbox ${since}`;
  return {
    observation: { content, contentType: 'daily_summary' },
    kind: 'delta',
  };
}

/**
 * Compute the next counters row to persist. Keeps the previous snapshot
 * fields when the current fetch produced no reading (so a transient API
 * failure does not corrupt delta timing).
 */
function nextGmailCounters({ inboxUnread, totalMessages, previous, mentionedTotal, now = new Date() }) {
  const hasReading = Number.isFinite(inboxUnread);
  return {
    inbox_unread: hasReading ? inboxUnread : previous?.inbox_unread ?? null,
    total_messages: Number.isFinite(totalMessages) ? totalMessages : previous?.total_messages ?? null,
    snapshot_at: hasReading ? now.toISOString() : previous?.snapshot_at ?? null,
    total_last_mentioned_at: mentionedTotal ? now.toISOString() : previous?.total_last_mentioned_at ?? null,
  };
}

export { shouldMentionLifetimeTotal, buildUnreadDeltaObservation, nextGmailCounters };
