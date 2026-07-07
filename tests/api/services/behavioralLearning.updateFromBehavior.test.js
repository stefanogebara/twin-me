/**
 * Regression test for updateFromBehavior (api/services/behavioralLearningService.js).
 *
 * Bug (lint audit 2026-07-02, no-undef): commit aef72993 ("full OCEAN removal")
 * deleted `const archetype = mapToArchetype(...)` but left `archetype` in the
 * returned object — so EVERY successful update threw
 * `ReferenceError: archetype is not defined` on the return path.
 * Fix: return the updated estimate without the removed archetype field
 * (no live caller reads `.archetype` from this return — the only caller is
 * processAllPlatformData, which passes the result through untouched).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { singleResults: [] },
}));

vi.mock('../../../api/config/supabase.js', () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    insert: () => builder,
    single: () => Promise.resolve(state.singleResults.shift()),
  };
  return {
    supabase: {},
    supabaseAdmin: { from: () => builder },
    default: {},
  };
});

const { updateFromBehavior } = await import('../../../api/services/behavioralLearningService.js');

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

const currentEstimate = {
  user_id: USER_ID,
  openness: 50,
  conscientiousness: 50,
  extraversion: 50,
  agreeableness: 50,
  neuroticism: 50,
  behavioral_score_weight: 0.05,
  total_behavioral_signals: 3,
};

describe('updateFromBehavior', () => {
  beforeEach(() => {
    state.singleResults = [];
  });

  it('resolves with the updated estimate instead of throwing ReferenceError', async () => {
    const updatedRow = {
      ...currentEstimate,
      behavioral_score_weight: 0.06,
      total_behavioral_signals: 4,
    };
    state.singleResults = [
      { data: currentEstimate, error: null }, // select current estimate
      { data: updatedRow, error: null }, // update result
    ];

    const result = await updateFromBehavior(USER_ID, 'spotify', { discovery_rate: 0.8 });

    expect(result).toEqual(updatedRow);
    // archetype was removed with OCEAN (aef72993) — it must not resurface
    expect(result).not.toHaveProperty('archetype');
  });

  it('propagates DB errors from the update step', async () => {
    state.singleResults = [
      { data: currentEstimate, error: null },
      { data: null, error: new Error('update failed') },
    ];

    await expect(
      updateFromBehavior(USER_ID, 'spotify', { discovery_rate: 0.8 }),
    ).rejects.toThrow('update failed');
  });
});
