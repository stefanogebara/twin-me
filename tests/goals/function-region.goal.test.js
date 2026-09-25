/**
 * The function sits beside its database.
 * ======================================
 * vercel.json set no region, so the function ran in iad1, Washington DC, while Supabase is
 * eu-west-3, Paris, and the people using it are in Spain. Every query crossed the Atlantic
 * and came back. Measured on production 2026-09-25, against the same warm function:
 *
 *   /api/health        no database          237, 268 ms
 *   /api/health/deep   one round trip       902, 1863 ms
 *
 * So one round trip cost 650-1600 ms, and a page read that makes several in sequence paid it
 * each time: /money/page took 7249 ms on a first load. It was read as a cold start and was
 * not one -- a cold /api/health answered in 629 ms against 307 ms warm, so starting the
 * function costs a few hundred milliseconds and the ocean cost the rest.
 *
 * cdg1 is Paris, the same city as eu-west-3. If the database ever moves, this moves with it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));

/* Supabase's own names for the regions its projects sit in, mapped to the Vercel region in
   the same city or as near as one gets. Extend this when the database moves. */
const BESIDE = { 'eu-west-3': ['cdg1'], 'eu-central-1': ['fra1'], 'eu-west-1': ['dub1'], 'sa-east-1': ['gru1'], 'us-east-1': ['iad1'] };
const DATABASE_REGION = 'eu-west-3';

describe('where the function runs', () => {
  it('names a region rather than taking the default, which is an ocean away', () => {
    expect(Array.isArray(config.regions)).toBe(true);
    expect(config.regions.length).toBeGreaterThan(0);
  });

  it('runs in the city the database is in', () => {
    expect(config.regions).toEqual(BESIDE[DATABASE_REGION]);
  });

  it('carries no key Vercel would refuse the deploy over', () => {
    /* A comment key in vercel.json is not a comment: the schema rejects unknown properties
       and the deploy fails, so the reasoning lives in the tracker and this file instead. */
    for (const key of Object.keys(config)) expect(key.startsWith('_')).toBe(false);
  });
});
