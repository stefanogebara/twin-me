/**
 * getPersonalityProfile must fall back to user_personality_profiles,
 * not the dead personality_scores table.
 *
 * Prod incident 2026-08-24: UserContextAggregator logged
 * "personality_scores fetch error: Could not find the table
 * 'public.personality_scores' in the schema cache" on every warmup.
 * The table only ever existed in the archive migration tree
 * (database/supabase/migrations/20250124_soul_signature_schema.sql) and was
 * never applied to the current Supabase project. The live behavioral OCEAN
 * store is user_personality_profiles (Soul Signature Voting Layer), so the
 * fallback read belongs there — scaled from its 0-1 range to the 0-100
 * percentile range the assessment path returns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queriedTables = [];
const results = new Map();

function makeChain(table) {
  queriedTables.push(table);
  const chain = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const result = results.get(table) ?? { data: null, error: null };
          const promise = Promise.resolve(result);
          return promise.then.bind(promise);
        }
        return () => chain;
      },
    }
  );
  return chain;
}

vi.mock('../../api/services/database.js', () => ({
  supabaseAdmin: { from: (table) => makeChain(table) },
}));
vi.mock('../../api/services/encryption.js', () => ({
  decryptToken: vi.fn(),
}));
vi.mock('../../api/services/tokenRefreshService.js', () => ({
  ensureFreshToken: vi.fn(),
}));
vi.mock('../../api/services/lifeEventInferenceService.js', () => ({
  lifeEventInferenceService: {},
}));
vi.mock('../../api/services/nangoService.js', () => ({
  whoop: {},
  getConnection: vi.fn(),
}));

const userContextAggregator = (await import('../../api/services/userContextAggregator.js')).default;

describe('getPersonalityProfile behavioral fallback', () => {
  beforeEach(() => {
    queriedTables.length = 0;
    results.clear();
    // No 60-question assessment for this user.
    results.set('personality_estimates', {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });
    // The table that does not exist in prod — reading it must not happen.
    results.set('personality_scores', {
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.personality_scores' in the schema cache" },
    });
    // The live Voting Layer profile (0-1 OCEAN scale).
    results.set('user_personality_profiles', {
      data: {
        user_id: 'user-1',
        openness: 0.8,
        conscientiousness: 0.3,
        extraversion: 0.6,
        agreeableness: 0.5,
        neuroticism: 0.2,
        confidence: 0.7,
      },
      error: null,
    });
  });

  it('reads user_personality_profiles and returns 0-100 OCEAN scores', async () => {
    const profile = await userContextAggregator.getPersonalityProfile('user-1');

    expect(queriedTables).not.toContain('personality_scores');
    expect(queriedTables).toContain('user_personality_profiles');

    expect(profile).toMatchObject({
      source: 'behavioral',
      openness: 80,
      conscientiousness: 30,
      extraversion: 60,
      agreeableness: 50,
      neuroticism: 20,
    });
    expect(profile.dominantTraits).toEqual(['openness', 'extraversion']);
    expect(profile.confidence).toBe(70);
  });

  it('returns null when no behavioral profile exists either', async () => {
    results.set('user_personality_profiles', {
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });

    const profile = await userContextAggregator.getPersonalityProfile('user-1');
    expect(profile).toBeNull();
  });
});
