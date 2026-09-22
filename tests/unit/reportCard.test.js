/**
 * The report card grades each kind of work by its last twenty nights.
 * Twenty at 95% earns unattended runs; under 90% loses them; money never qualifies.
 */
import { describe, expect, it } from 'vitest';
import { gradeRuns, renderSummary, WINDOW } from '../../scripts/ci/reportCard.mjs';

const night = (i, conclusions) => ({ sha: `sha${i}`, url: `https://x/${i}`, jobs: Object.entries(conclusions).map(([name, conclusion]) => ({ name, conclusion })) });

describe('the report card', () => {
  it('grades every job it has seen, by name', () => {
    const runs = [night(1, { 'Feature canaries': 'success', 'Money canaries': 'failure' }), night(2, { 'Feature canaries': 'success' })];
    const g = gradeRuns(runs);
    expect(g.map((x) => x.task_type)).toEqual(['Feature canaries', 'Money canaries']);
    expect(g[0]).toMatchObject({ runs: 2, pass_rate: 1, review_eligible: false, needs_attention: false });
    expect(g[1]).toMatchObject({ runs: 1, pass_rate: 0, needs_attention: true });
  });
  it('earns unattended runs only after twenty nights at 95 percent', () => {
    const nineteen = Array.from({ length: 19 }, (_, i) => night(i, { A: 'success' }));
    expect(gradeRuns(nineteen)[0].review_eligible).toBe(false);
    const twenty = nineteen.concat([night(19, { A: 'success' })]);
    expect(gradeRuns(twenty)[0].review_eligible).toBe(true);
    const oneMiss = twenty.map((n, i) => (i === 3 ? night(i, { A: 'failure' }) : n));
    expect(gradeRuns(oneMiss)[0]).toMatchObject({ pass_rate: 0.95, review_eligible: true });
    const twoMisses = oneMiss.map((n, i) => (i === 7 ? night(i, { A: 'failure' }) : n));
    expect(gradeRuns(twoMisses)[0]).toMatchObject({ pass_rate: 0.9, review_eligible: false, needs_attention: false });
    const threeMisses = twoMisses.map((n, i) => (i === 11 ? night(i, { A: 'timed_out' }) : n));
    expect(gradeRuns(threeMisses)[0].needs_attention).toBe(true);
  });
  it('looks only at the last twenty, newest first, and ignores nights that did not run', () => {
    const runs = Array.from({ length: 25 }, (_, i) => night(i, { A: i >= WINDOW ? 'failure' : 'success' }));
    expect(gradeRuns(runs)[0]).toMatchObject({ runs: 20, pass_rate: 1 });
    const cancelled = [night(0, { A: 'cancelled' }), night(1, { A: 'skipped' }), night(2, { A: 'success' })];
    expect(gradeRuns(cancelled)[0]).toMatchObject({ runs: 1, pass_rate: 1 });
  });
  it('never grants writes to money, whatever the grade', () => {
    const perfect = Array.from({ length: 40 }, (_, i) => night(i, { 'Money canaries': 'success' }));
    expect(gradeRuns(perfect)[0].autonomous_writes).toBe(false);
    expect(renderSummary(gradeRuns(perfect))).toMatch(/Automatic financial writes remain disabled/);
  });
});

describe('the streak', () => {
  const run = (...conclusions) => conclusions.map((conclusion, i) => ({ sha: `s${i}`, url: `u${i}`, jobs: [{ name: 'Unit suite, no retries', conclusion }] }));
  it('counts the passes since the last failure, newest first', () => {
    expect(gradeRuns(run('success', 'success', 'success')).at(0).streak).toBe(3);
    expect(gradeRuns(run('success', 'failure', 'success')).at(0).streak).toBe(1);
    expect(gradeRuns(run('failure', 'success', 'success')).at(0).streak).toBe(0);
    expect(gradeRuns([]).length).toBe(0);
  });
  it('says the streak in the summary, so a ten-night gate reads itself', () => {
    const line = renderSummary(gradeRuns(run('success', 'success')));
    expect(line).toContain('2 in a row');
    expect(renderSummary(gradeRuns(run('failure')))).not.toContain('in a row');
  });
});

