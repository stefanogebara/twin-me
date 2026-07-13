/**
 * GOAL: every Inngest function stays within the plan's concurrency cap.
 * ======================================================================
 * Live incident (2026-06-20 -> 2026-07-13): userObservationIngestion declared
 * a global concurrency limit of 6, one over the Inngest plan cap of 5. Inngest
 * cloud REJECTS the entire app sync for a single over-cap function - all 12
 * functions unregistered, every fan-out event silently dropped - while the
 * cron logged success ("inngest-fanout, enqueued: 4") every 30 minutes.
 * Observation ingestion was dead for three weeks with zero red signals.
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
