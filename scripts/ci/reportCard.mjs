/**
 * The report card: what the nightly runs say each kind of work can be trusted with.
 *
 * Every job in goals-nightly.yml is a task type. Its grade is the pass rate over the last
 * twenty completed nights; twenty passes at 95% or better make it eligible for unattended
 * runs, and a rate below 90% takes that away and says so. Pure: runs in, grades out. The
 * shadow rule stands whatever the grade: nothing that touches money_* tables or the bank is
 * ever automated on a test streak (autonomous_writes is false and is not a parameter).
 *
 * @param {Array<{sha: string, url: string, jobs: Array<{name: string, conclusion: string|null}>}>} runs
 *   completed workflow runs, newest first, each with its jobs
 */
export const WINDOW = 20;
export const ELIGIBLE_AT = 0.95;
export const ATTENTION_BELOW = 0.9;
const COUNTED = new Set(['success', 'failure', 'timed_out']);

export function gradeRuns(runs = []) {
  const names = [...new Set(runs.flatMap((r) => (r.jobs || []).map((j) => j.name)))].sort();
  return names.map((name) => {
    const observations = runs
      .flatMap((run) => (run.jobs || []).filter((j) => j.name === name && COUNTED.has(j.conclusion))
        .map((j) => ({ passed: j.conclusion === 'success', sha: run.sha, url: run.url })))
      .slice(0, WINDOW);
    const rate = observations.length ? observations.filter((o) => o.passed).length / observations.length : null;
    return {
      task_type: name,
      runs: observations.length,
      pass_rate: rate === null ? null : Math.round(rate * 1000) / 1000,
      review_eligible: observations.length >= WINDOW && rate >= ELIGIBLE_AT,
      needs_attention: rate !== null && rate < ATTENTION_BELOW,
      autonomous_writes: false,
      observations,
    };
  });
}

/** One line per task type, for a step summary or an issue. */
export function renderSummary(grades = []) {
  if (!grades.length) return 'No completed nightly runs yet.\n';
  return grades.map((g) => {
    const rate = g.pass_rate === null ? 'unrated' : `${Math.round(g.pass_rate * 100)}% passed`;
    const standing = g.review_eligible ? 'eligible for unattended runs' : g.needs_attention ? 'NEEDS ATTENTION' : `not yet eligible (${g.runs}/${WINDOW} nights)`;
    return `${g.task_type}: ${g.runs} completed nights, ${rate}; ${standing}.`;
  }).join('\n') + '\nAutomatic financial writes remain disabled whatever the grade.\n';
}
