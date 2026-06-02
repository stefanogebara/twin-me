/**
 * Barrel re-export for the Whoop analytics tools.
 *
 * `twinContextBuilder.js` (step 4 of the integration) imports from here so
 * the underlying file paths can change without touching the caller.
 */

export { getTrend } from './getTrend.js';
export { comparePeriods } from './comparePeriods.js';
export { getWeeklySummary } from './getWeeklySummary.js';
