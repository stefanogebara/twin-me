/**
 * Attention Gravity — where your attention actually pools (2026-06-16)
 * ===================================================================
 * The first self-revelation built on a FIRST-PARTY, always-on source: the
 * browser extension's page observations. No OAuth, no third-party API, no
 * platform to connect — it works for anyone who installed the extension.
 *
 * The tell: the site you OPEN most is rarely where your attention actually
 * goes. You bounce through search/dashboards in quick checks, but your real
 * reading time quietly sinks into a few places. This surfaces that gap — what
 * you click vs where your minutes pool — measured by dwell time.
 *
 * Reads user_platform_data (web page visits) straight from our own DB. Pure
 * tested core; same gather -> core -> candidate -> salience Editor shape as the
 * calendar correlations. Timezone-free (no hour bucketing). Privacy: this is
 * the user's own browsing, surfaced only back to them; we name domains, never
 * URLs or page content.
 */
import { supabaseAdmin } from './database.js';
import { editInsights } from './insightEditor.js';
import { vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('AttentionGravity');

export const WINDOW_DAYS = 28;
const MIN_DOMAINS = 8;            // need a real spread of sites
const MIN_TOTAL_DWELL_S = 1800;  // 30 min of measured attention
const MIN_TOP_DWELL_S = 300;     // the top site must hold >= 5 min
const DWELL_SHARE_FLOOR = 0.12;  // and >= 12% of total — else too scattered to name one
const MAX_ROWS = 3000;

// ── PURE core ────────────────────────────────────────────────────────────────
/** PURE. domain.com -> "Domain" (best-effort registrable label, title-cased). */
export function friendlyDomain(domain) {
  if (!domain || typeof domain !== 'string') return null;
  const host = domain.replace(/^www\./i, '').toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (!parts.length) return null;
  const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Aggregate page visits by domain and find where attention pools (by dwell),
 * contrasting with where the user clicks most (by visit count).
 * @param {Array<{domain:string, dwellS:number}>} events
 * @returns {object|null}
 */
export function computeAttentionGravity(events, {
  minDomains = MIN_DOMAINS,
  minTotalDwell = MIN_TOTAL_DWELL_S,
  minTopDwell = MIN_TOP_DWELL_S,
  dwellShareFloor = DWELL_SHARE_FLOOR,
} = {}) {
  if (!Array.isArray(events)) return null;
  const agg = new Map(); // domain -> { dwell, visits }
  for (const e of events) {
    if (!e || !e.domain) continue;
    const cur = agg.get(e.domain) || { dwell: 0, visits: 0 };
    cur.dwell += typeof e.dwellS === 'number' && e.dwellS > 0 ? e.dwellS : 0;
    cur.visits += 1;
    agg.set(e.domain, cur);
  }
  const domains = [...agg.entries()].map(([domain, v]) => ({ domain, dwellS: v.dwell, visits: v.visits }));
  if (domains.length < minDomains) return null;

  const totalDwell = domains.reduce((s, d) => s + d.dwellS, 0);
  if (totalDwell < minTotalDwell) return null;

  const byDwell = [...domains].sort((a, b) => b.dwellS - a.dwellS);
  const top = byDwell[0];
  if (top.dwellS < minTopDwell) return null;

  const dwellShare = top.dwellS / totalDwell;
  if (dwellShare < dwellShareFloor) return null;

  const byVisits = [...domains].sort((a, b) => b.visits - a.visits);
  const topVisit = byVisits[0];
  const diverges = topVisit.domain !== top.domain && topVisit.visits > top.visits;

  return {
    topDomain: top.domain,
    topDwellMin: Math.round(top.dwellS / 60),
    dwellSharePct: Math.round(dwellShare * 100),
    topVisitDomain: topVisit.domain,
    diverges,
    nDomains: domains.length,
  };
}

/** PURE. Candidate text (Editor voices it). Friendly names, no raw percentages. */
export function buildAttentionGravityCandidate(g) {
  if (!g) return null;
  const place = friendlyDomain(g.topDomain);
  if (!place) return null;
  if (g.diverges) {
    const clicked = friendlyDomain(g.topVisitDomain);
    if (clicked && clicked !== place) {
      return `You open ${clicked} more than anywhere else, but your attention actually pools on ${place} — that's where your reading time quietly goes, even though you visit it less.`;
    }
  }
  return `Across ${g.nDomains} sites this month, your attention keeps pooling in one place: ${place} holds more of your real reading time than anywhere else.`;
}

// ── gather (I/O, first-party DB — no external API) ───────────────────────────
export async function gatherBrowsingDwell(userId) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data')
    .eq('user_id', userId)
    .eq('platform', 'web')
    .eq('data_type', 'extension_page_visit')
    .gte('extracted_at', since)
    .limit(MAX_ROWS);
  if (error) {
    log.warn('browsing dwell fetch failed', { userId, error: error.message });
    return [];
  }
  const events = [];
  for (const row of data || []) {
    const r = row.raw_data || {};
    const domain = r.domain || null;
    if (!domain) continue; // page_summary rows carry no domain — skip
    const dwellS = Number(r.engagement?.timeOnPage ?? r.timeSpent ?? r.readingTime ?? 0) || 0;
    events.push({ domain, dwellS });
  }
  return events;
}

// ── orchestrator ─────────────────────────────────────────────────────────────
export async function generateAttentionGravityInsight(userId, { logOnly = false } = {}) {
  const events = await gatherBrowsingDwell(userId);
  const gravity = computeAttentionGravity(events);
  const candidate = buildAttentionGravityCandidate(gravity);
  log.info('attention gravity computed', {
    userId, events: events.length,
    gravity: gravity ? { top: gravity.topDomain, sharePct: gravity.dwellSharePct, diverges: gravity.diverges } : null,
  });
  if (!candidate) return null;

  log.info('attention gravity candidate', { userId, candidate });
  if (logOnly) return null;

  const chosen = await editInsights(userId, [{ insight: candidate, urgency: 'low', category: 'trend' }]);
  if (!chosen) return null;

  const insertData = {
    user_id: userId,
    insight: chosen.insight,
    urgency: chosen.urgency,
    category: chosen.category || 'trend',
    surfaced_at: new Date().toISOString(),
    sources: ['web'],
  };
  if (chosen.embedding) insertData.embedding = vectorToString(chosen.embedding);
  const { error } = await supabaseAdmin.from('proactive_insights').insert(insertData);
  if (error) { log.warn('failed to store attention gravity insight', { userId, error: error.message }); return null; }
  log.info('attention gravity insight stored', { userId });
  return chosen;
}
