/**
 * GOAL: every Inngest function stays within the plan's concurrency cap.
 * ======================================================================
 * CORRECTED 2026-08-26. This canary was written to explain the 2026-06-20 ->
 * 2026-07-13 ingestion outage: userObservationIngestion declared a global
 * concurrency limit of 6, one over the plan cap of 5, and Inngest cloud does
 * reject an app sync over that cap. That much is real, and worth guarding.
 *
 * But it was NOT why ingestion was dead, and lowering 6 -> 5 did not fix it.
 * Every function in this app was registered with `triggers: []` and an object
 * where its handler belongs, because all 13 call sites used the v3
 * createFunction signature against inngest v4 (PR #270). No event could match
 * any function, and no run could execute if one had. Inngest ran nothing at
 * all here until 2026-08-26; ingestion survived only on the cron's inline
 * starvation fallback, which is why the "fix" appeared to work.
 *
 * Keep this test: the plan cap is a genuine constraint and an over-cap limit
 * would break a sync. Just do not read it as the cause of that outage.
 *
 * This canary statically scans every Inngest function for concurrency limits
 * above the plan cap, so the failure mode becomes a red PR check instead of a
 * silent production outage. If the plan is upgraded, raise PLAN_CONCURRENCY_CAP
 * deliberately in the same PR that raises a limit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const PLAN_CONCURRENCY_CAP = 5;
const FUNCTIONS_DIR = resolve(process.cwd(), 'api/inngest/functions');

describe('goal: Inngest functions within plan limits', () => {
  it(`no function declares a concurrency limit above ${PLAN_CONCURRENCY_CAP}`, () => {
    const offenders = [];
    for (const file of readdirSync(FUNCTIONS_DIR).filter(f => f.endsWith('.js'))) {
      const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8');
      for (const m of src.matchAll(/limit:\s*(\d+)/g)) {
        const limit = Number(m[1]);
        if (limit > PLAN_CONCURRENCY_CAP) offenders.push({ file, limit });
      }
    }
    expect(offenders, `Inngest cloud rejects the WHOLE app sync when any function exceeds the plan cap (${PLAN_CONCURRENCY_CAP}): ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it('the functions directory is where we think it is (guard against silent renames)', () => {
    const files = readdirSync(FUNCTIONS_DIR).filter(f => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('userObservationIngestion.js');
  });
});
