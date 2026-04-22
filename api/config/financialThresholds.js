/**
 * Financial-Emotional Twin — centralized numerical thresholds
 *
 * Why this file exists:
 *   - Audit 2026-04-22 flagged 0.6 and 0.65 scattered across 5 files with
 *     no comment explaining the difference. They encode distinct product
 *     decisions — surfacing them here documents the intent + lets product
 *     tune without hunting through code.
 *
 * Two semantic bands on computed_stress_score (range 0-1, null if no signals):
 *
 *   STRESS_HIGH — "retrospective: this spend was during stress"
 *     Used in: summary outflow counter, weekly report emotional-spend ratio,
 *              pattern detector (category × stress band), emotion tagger
 *              for flagging is_stress_shop_candidate.
 *     Threshold: 0.6 (conservative — 3 in 10 "stressed" days capture roughly
 *              the top 30% of user stress events in our early dataset).
 *
 *   NUDGE_TRIGGER — "real-time: interrupt the user with a push notification"
 *     Used in: /stress-shop-score endpoint that the browser extension polls
 *              at checkout.
 *     Threshold: 0.65 (stricter — false positives cost trust; user is about
 *              to spend money and a wrong nudge is annoying).
 *
 *   STRESS_LOW — "lowband for pattern comparison"
 *     Used in: spending pattern detector to split "low stress day" cohort.
 *     Threshold: < 0.4 (symmetric to 0.6, leaves 0.4-0.6 as "moderate" gap).
 *
 * Stress-shop candidate guards (emotion tagger):
 *   MIN_CANDIDATE_AMOUNT = 20 (R$) — ignore micro-transactions (coffee)
 *   MAX_CANDIDATE_AMOUNT = 2000 — ignore likely-planned large purchases
 *
 * If you change any of these, update the `detail/semantics` section of
 * tasks/vercelignore-bisect-backlog.md so the rationale doesn't drift.
 */
export const STRESS_HIGH = 0.6;
export const NUDGE_TRIGGER = 0.65;
export const STRESS_LOW = 0.4;
export const MIN_CANDIDATE_AMOUNT = 20;
export const MAX_CANDIDATE_AMOUNT = 2000;

/**
 * Default currency fallback — used whenever a transaction or summary lacks
 * an explicit currency code. TwinMe is Brazilian-first; Pluggy imports fill
 * this reliably, CSV/OFX from non-BR banks may not. Parsers for specific
 * BR banks (nubankCsvParser, ofxParser) legitimately hardcode 'BRL' inside
 * the parser — that's product-correct, not using this fallback.
 *
 * Override at runtime via env var DEFAULT_CURRENCY (e.g. 'EUR' for an
 * EU-hosted instance).
 */
export const DEFAULT_CURRENCY = (process.env.DEFAULT_CURRENCY || 'BRL').toUpperCase();
