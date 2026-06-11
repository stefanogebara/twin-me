/**
 * Category-Level Insight Suppression
 * ===================================
 * replan-2026-06-10 Track A item 3: generateProactiveInsights() read ZERO
 * engagement signals by construction — the user ignored 20/20 nudges and the
 * system kept mandating one per batch. This module is the pure decision half
 * of the fix: given the per-category engaged/shown rows the table already
 * collects (same query shape as GET /insights/proactive/engagement-stats),
 * decide which categories to stop generating and which to warn the LLM about.
 *
 * Pure functions only — no DB, no LLM — so the policy is unit-testable and
 * the generation path stays cheap (one indexed query per run, done by the
 * caller).
 */

// A category is HARD-suppressed (skipped at insert time) once the user has
// been shown this many of them in 30 days without engaging once.
export const SUPPRESS_MIN_SHOWN = 8;

// Below the hard threshold, a category with zero engagement is soft-flagged:
// listed in the prompt as "avoid unless genuinely urgent".
export const AVOID_MIN_SHOWN = 4;

/**
 * Classify categories by engagement.
 *
 * @param {Array<{category: string|null, engaged: boolean, delivered: boolean}>} statRows
 *   Rows from proactive_insights (last 30 days). Only delivered rows count as
 *   "shown" — generated-but-never-delivered insights are not a user verdict.
 * @returns {{ suppressed: string[], avoid: string[], byCategory: Record<string, {shown: number, engaged: number}> }}
 */
export function computeCategorySuppression(statRows) {
  const byCategory = {};
  for (const row of statRows || []) {
    if (!row?.category) continue;
    if (!byCategory[row.category]) byCategory[row.category] = { shown: 0, engaged: 0 };
    if (row.delivered) byCategory[row.category].shown++;
    if (row.engaged) byCategory[row.category].engaged++;
  }

  const suppressed = [];
  const avoid = [];
  for (const [category, stats] of Object.entries(byCategory)) {
    if (stats.engaged > 0) continue; // any engagement keeps the category alive
    if (stats.shown >= SUPPRESS_MIN_SHOWN) suppressed.push(category);
    else if (stats.shown >= AVOID_MIN_SHOWN) avoid.push(category);
  }

  return { suppressed, avoid, byCategory };
}

/**
 * Render the suppression decision as a prompt section appended to the insight
 * generation prompt. Empty string when there is nothing to say — the prompt
 * must not grow a permanent boilerplate block.
 */
export function buildSuppressionPromptSection({ suppressed = [], avoid = [] } = {}) {
  const ignored = [...suppressed, ...avoid];
  if (ignored.length === 0) return '';
  return `\n\nENGAGEMENT FEEDBACK:\nThe user consistently ignores insights in these categories: ${ignored.join(', ')}.\nAvoid these categories unless something genuinely urgent demands one.`;
}
