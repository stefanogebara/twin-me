/**
 * Briefing Insight Editorial Filter (pure)
 * ========================================
 * replan-2026-06-10 Track B: the morning briefing re-dumped raw
 * proactive_insights rows of ANY category — meeting_prep headlines, reauth
 * notices, email_triage drafts — and re-delivered yesterday's rows verbatim
 * every day. This module is the editorial gate every briefing consumer must
 * pass candidate rows through:
 *
 *   1. Category whitelist: nudge / celebration / trend / concern only.
 *      Operational categories never reach a briefing.
 *   2. No re-delivery: rows already shown in a previous briefing carry
 *      metadata.delivered_in_briefing = true and are excluded. (The
 *      `delivered` column is NOT reused — it means "sent via chat or a
 *      messaging channel" and gates cron-deliver-insights.)
 *   3. Hard cap of 3 items, applied AFTER filtering.
 *
 * Pure functions only — no DB, no LLM — so the gate is unit-testable.
 */

export const BRIEFING_CATEGORY_WHITELIST = ['nudge', 'celebration', 'trend', 'concern'];

export const BRIEFING_MAX_INSIGHTS = 3;

/**
 * Filter candidate proactive_insights rows down to what a briefing may show.
 *
 * @param {Array<{category?: string, metadata?: object|null}>} rows
 * @param {{limit?: number}} [options]
 * @returns {Array} filtered rows, input order preserved, capped at limit
 */
export function filterBriefingInsights(rows, { limit = BRIEFING_MAX_INSIGHTS } = {}) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter(r => r && typeof r === 'object' && BRIEFING_CATEGORY_WHITELIST.includes(r.category))
    .filter(r => !r.metadata?.delivered_in_briefing)
    .slice(0, limit);
}
