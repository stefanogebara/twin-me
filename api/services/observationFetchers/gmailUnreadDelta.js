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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Describe the window between two counter readings, in the coarsest unit that
 * actually elapsed.
 *
 * These observations land in the memory stream and get quoted back by the twin
 * as fact, so the marker must never claim more time than passed. The previous
 * implementation floored the window to `Math.max(1, Math.round(elapsed /
 * DAY_MS))` days — but gmail.js rewrites `snapshot_at` on EVERY ingestion run
 * and the cron fires every 30 minutes, so the real window is normally half an
 * hour and was being labelled "since yesterday", overstating it ~48x.
 *
 * Every unit truncates (never rounds up) for the same reason. Returns '' when
 * the window is unusable (clock skew / future snapshot), in which case the
 * caller emits the delta with no time marker at all — silence beats a
 * fabricated one.
 */
function formatElapsedWindow(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '';
  if (elapsedMs < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(elapsedMs / MINUTE_MS));
    return `in the last ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  if (elapsedMs < DAY_MS) {
    const hours = Math.floor(elapsedMs / HOUR_MS);
    return `in the last ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.floor(elapsedMs / DAY_MS);
  return days === 1 ? 'since yesterday' : `over the past ${days} days`;
}

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

  // `prevAt` is the previous READING's timestamp (nextGmailCounters stamps it
  // only when a reading actually succeeded), so this is the true window.
  const since = formatElapsedWindow(now.getTime() - prevAt);
  const suffix = since ? ` ${since}` : '';
  const content = delta > 0
    ? `Inbox grew by ${delta} unread email${delta === 1 ? '' : 's'}${suffix}`
    : `Cleared ${-delta} unread email${delta === -1 ? '' : 's'} from the inbox${suffix}`;
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
