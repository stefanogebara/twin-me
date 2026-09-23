/**
 * A read that may fail without failing the whole, with its failure named.
 *
 * Twenty-six places in the money code (then 76 more across everything the product reaches, M1-D) caught an error and handed back an empty value
 * (`.catch(() => [])`), so a facts read that failed looked like a person with no facts and
 * nobody could tell from the logs (audit M1-3, 2026-09-19). Each of those now says its
 * name: the failure is logged with it, counted under it, and the same fallback returned.
 *
 *   listFacts(userId).catch(quietly('facts-for-forecast', () => []))
 *
 * The counts are read by the health canaries and reset by tests; they are per process.
 */
import { createLogger } from './logger.js';

const log = createLogger('money-quiet');
const counts = new Map();

/**
 * @param {string} name what was being read, as a stable slug
 * @param {unknown | (() => unknown)} fallback the value to hand back, or a function that makes a fresh one
 */
export function quietly(name, fallback = null) {
  if (typeof name !== 'string' || !name) throw new Error('quietly needs a name');
  return (error) => {
    counts.set(name, (counts.get(name) || 0) + 1);
    log.warn(`quiet failure: ${name}`, { error: error?.message || String(error) });
    return typeof fallback === 'function' ? fallback() : fallback;
  };
}

/** Every quiet failure so far, by name. */
export function quietFailures() {
  return Object.fromEntries(counts);
}

export function resetQuietFailures() {
  counts.clear();
}
