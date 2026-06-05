/**
 * Gmail behavioral analytics — extracts behavior signal from message
 * metadata WITHOUT reading bodies. The Gmail API exposes `format=
 * metadata` returning only headers (From, To, Date, Subject, etc.)
 * which is rich enough for everything the twin needs and dodges the
 * privacy concerns of body-level analysis.
 *
 * Computes five aggregates:
 *
 *   1. volume      — sent + received counts in window, sent/received
 *                    ratio (a "I drive conversation vs respond" signal)
 *   2. chronobiology — distribution of sent message hour-of-day in
 *                      UTC. Night-owl % (22:00-04:00) and early-bird %
 *                      (04:00-08:00) capture chronotype cleanly.
 *   3. correspondents — top 8 unique addresses by send volume in the
 *                       window. Excludes noreply/automated senders.
 *   4. labels      — custom label count + top 3 by use frequency.
 *                    Zero labels = inbox-chaos; many = high
 *                    organizational tendency.
 *   5. activity_days — UTC days with at least 1 sent message in window
 *                      (so "you sent emails on 21 of the last 30 days"
 *                      style breakdowns)
 *
 * The fetch strategy minimises API calls:
 *   - `messages.list` with `q=in:sent newer_than:30d` paginates 100/page
 *     up to a hard cap of 200 messages (≈2 pages typical).
 *   - For each message, a single metadata-format fetch for the small
 *     header set the analytics actually consumes (To, From, Date, Subject).
 *
 * No body content ever leaves the Gmail API.
 */

const SENT_QUERY_PAGE_SIZE = 100;
const MAX_SENT_MESSAGES = 200;
const MAX_RECEIVED_MESSAGES = 200;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const TOP_CORRESPONDENTS = 8;
const HEADERS_NEEDED = ['From', 'To', 'Date', 'Subject'];

// Regex for the "Name <email@host>" shape headers use. Captures the
// bare email. Tolerates plain "email@host" too.
const EMAIL_RE = /<([^>]+@[^>]+)>|([^\s<>"]+@[^\s<>"]+)/;
function extractEmail(headerValue) {
  if (!headerValue) return null;
  const m = headerValue.match(EMAIL_RE);
  const candidate = (m?.[1] ?? m?.[2] ?? '').toLowerCase().trim();
  return candidate || null;
}

// Common "automated sender" patterns we exclude from top-correspondent
// aggregates. Filtering these keeps the rank order useful for the
// user's actual social/work graph rather than the noisy newsletter tail.
const AUTOMATED_RE = /(^|@)(noreply|no-reply|mailer-daemon|donotreply|do-not-reply|notifications?|automated|alerts?)(@|\.|$)/i;
function isAutomated(email) {
  if (!email) return true;
  return AUTOMATED_RE.test(email);
}

function utcHour(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCHours();
}

function utcDay(iso) {
  return (iso ?? '').slice(0, 10);
}

/**
 * Pull headers from the gmail message payload — `payload.headers` is
 * an array of {name, value}. Returns a lowercase-keyed map of just the
 * subset we care about.
 */
function headerMap(message) {
  const headers = message?.payload?.headers ?? [];
  const map = {};
  for (const h of headers) {
    if (!h?.name || !h?.value) continue;
    if (HEADERS_NEEDED.includes(h.name)) {
      map[h.name.toLowerCase()] = h.value;
    }
  }
  return map;
}

async function fetchMessageIds(client, query, cap) {
  const ids = [];
  let pageToken = null;
  while (ids.length < cap) {
    const path =
      `/messages?q=${encodeURIComponent(query)}` +
      `&maxResults=${Math.min(SENT_QUERY_PAGE_SIZE, cap - ids.length)}` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    let page;
    try {
      page = await client.get(path);
    } catch {
      break;
    }
    for (const m of page?.messages ?? []) {
      if (m?.id) ids.push(m.id);
    }
    pageToken = page?.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}

async function fetchMetadataBatch(client, ids) {
  const headersParams = HEADERS_NEEDED.map((h) => `metadataHeaders=${h}`).join('&');
  // Run in batches of 10 to balance throughput vs Gmail's per-second
  // quota (~250 quota units/sec; messages.get is 5 quota units, so 10
  // parallel ≈ 50/sec sustained — well within budget).
  const BATCH = 10;
  const out = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((id) =>
        client.get(`/messages/${id}?format=metadata&${headersParams}`).catch(() => null),
      ),
    );
    for (const r of results) {
      if (r) out.push(r);
    }
  }
  return out;
}

/**
 * @param {object} client  { get(path) -> Promise<any> }
 * @param {{ days?: number }} [params]
 */
export async function getEmailBehavior(client, params = {}) {
  const days = Math.min(params.days ?? DEFAULT_DAYS, MAX_DAYS);
  // Gmail's `newer_than:Nd` operator is the cleanest window syntax.
  // `in:sent` and `in:inbox` partition the windows we need.
  const sentIds = await fetchMessageIds(client, `in:sent newer_than:${days}d`, MAX_SENT_MESSAGES);
  const receivedIds = await fetchMessageIds(
    client,
    `in:inbox newer_than:${days}d`,
    MAX_RECEIVED_MESSAGES,
  );

  const [sentMsgs, receivedMsgs] = await Promise.all([
    fetchMetadataBatch(client, sentIds),
    fetchMetadataBatch(client, receivedIds),
  ]);

  // --- Chronobiology + correspondent aggregation on SENT messages ---
  const hourBuckets = new Array(24).fill(0);
  const recipientCounts = new Map();
  const sentDays = new Set();
  for (const msg of sentMsgs) {
    const headers = headerMap(msg);
    const hour = utcHour(headers.date);
    if (hour !== null) hourBuckets[hour] += 1;
    const day = utcDay(headers.date);
    if (day) sentDays.add(day);

    // `To` may be comma-separated list; take the first recipient
    // (primary addressee) for rank order, count it once.
    if (headers.to) {
      const primary = extractEmail(headers.to.split(',')[0]);
      if (primary && !isAutomated(primary)) {
        recipientCounts.set(primary, (recipientCounts.get(primary) ?? 0) + 1);
      }
    }
  }

  // --- Top senders to the user's inbox (excluding automated) ---
  const senderCounts = new Map();
  for (const msg of receivedMsgs) {
    const headers = headerMap(msg);
    const sender = extractEmail(headers.from);
    if (sender && !isAutomated(sender)) {
      senderCounts.set(sender, (senderCounts.get(sender) ?? 0) + 1);
    }
  }

  const topRecipients = [...recipientCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CORRESPONDENTS)
    .map(([email, count]) => ({ email, count }));
  const topSenders = [...senderCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CORRESPONDENTS)
    .map(([email, count]) => ({ email, count }));

  // Chronotype scoring — only meaningful when the sample is big enough.
  const totalSent = sentMsgs.length;
  const nightOwlCount = hourBuckets[22] + hourBuckets[23] + hourBuckets[0] + hourBuckets[1] + hourBuckets[2] + hourBuckets[3];
  const earlyBirdCount = hourBuckets[4] + hourBuckets[5] + hourBuckets[6] + hourBuckets[7];
  const chronotype = {
    night_owl_pct: totalSent > 0 ? Math.round((nightOwlCount / totalSent) * 100) : 0,
    early_bird_pct: totalSent > 0 ? Math.round((earlyBirdCount / totalSent) * 100) : 0,
    top_hours_utc: [...hourBuckets.entries()]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .filter((b) => b.count > 0),
  };

  // --- Custom labels — user-created labels are the organizational
  // taxonomy signal. System labels (INBOX, SENT, etc.) are excluded.
  let customLabels = [];
  try {
    const labelsResp = await client.get('/labels');
    customLabels = (labelsResp?.labels ?? [])
      .filter((l) => l.type === 'user' && l.name)
      .map((l) => ({ name: l.name, total: l.messagesTotal ?? null }))
      .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
      .slice(0, 8);
  } catch {
    customLabels = [];
  }

  return {
    period: { days },
    volume: {
      sent: sentMsgs.length,
      received: receivedMsgs.length,
      sent_to_received_ratio:
        receivedMsgs.length > 0 ? +(sentMsgs.length / receivedMsgs.length).toFixed(2) : null,
      active_days_sending: sentDays.size,
    },
    chronotype,
    top_recipients: topRecipients,
    top_senders: topSenders,
    labels: {
      custom_label_count: customLabels.length,
      top_labels: customLabels.slice(0, 5),
    },
  };
}
