/**
 * GOAL: every Inngest function belonging to the legacy twin registers through
 * createTwinFunction, never through inngest.createFunction directly (set 2026-09-22).
 *
 * The crons that emit these events are already gated behind LEGACY_TWIN_ENABLED via
 * legacyTwinGate, so this canary changes nothing today. It covers the path that isn't
 * gated: a manual invoke from the Inngest dashboard, a restored cron, or a new caller
 * sending one of these events directly would run a twin handler with the twin parked.
 * On 2026-09-22 that shape produced 29 failed WhatsApp briefing sends to a number whose
 * 24-hour window had been shut since August. createTwinFunction (api/inngest/twinFunction.js)
 * is the wrapper that closes that gap; this test makes "forgot to use the wrapper" a red
 * PR check instead of a silent production outage.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const FUNCTIONS_DIR = resolve(process.cwd(), 'api/inngest/functions');

describe('goal: every Inngest twin function is gated by createTwinFunction', () => {
  const files = readdirSync(FUNCTIONS_DIR).filter(f => f.endsWith('.js'));

  it('the functions directory is non-empty (so this test cannot pass by finding nothing)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every function file registers through createTwinFunction(', () => {
    const offenders = [];
    for (const file of files) {
      const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8');
      if (!/createTwinFunction\(/.test(src)) offenders.push(file);
    }
    expect(offenders, `these files never call createTwinFunction(): ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it('no function file calls inngest.createFunction( directly any more', () => {
    const offenders = [];
    for (const file of files) {
      const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8');
      if (/inngest\.createFunction\(/.test(src)) offenders.push(file);
    }
    expect(offenders, `these files bypass the twin gate by calling inngest.createFunction() directly: ${JSON.stringify(offenders)}`).toEqual([]);
  });
});
