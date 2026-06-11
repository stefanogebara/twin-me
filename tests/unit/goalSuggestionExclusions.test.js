/**
 * Unit tests for the goal-suggestion exclusion-list builder.
 *
 * replan-2026-06-10 Track A item 4: generateGoalSuggestions previously built
 * its duplicate-exclusion list from ['active','suggested'] goals only, so a
 * goal the user explicitly dismissed (status='abandoned') could be
 * re-suggested by the twin. `buildSuggestionExclusions` is the pure helper
 * that folds recently declined goals into both the prompt text and the
 * hard metric_type duplicate filter.
 */
import { describe, it, expect, vi } from 'vitest';

// goalTrackingService imports Supabase + LLM gateway at module load; mock the
// side-effectful modules so the pure helper can be imported in isolation.
vi.mock('../../api/services/database.js', () => ({
  supabaseAdmin: {},
}));
vi.mock('../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../api/services/memoryStreamService.js', () => ({
  getRecentMemories: vi.fn(),
  retrieveMemories: vi.fn(),
}));

const { buildSuggestionExclusions } = await import('../../api/services/goalTrackingService.js');

const activeGoal = { title: 'Sleep 7+ hours for 2 weeks', metric_type: 'sleep_hours' };
const declinedGoal = { title: 'Cap meetings at 4 per day', metric_type: 'meeting_count' };

describe('buildSuggestionExclusions', () => {
  it('returns "None" and an empty metric set when there are no goals', () => {
    const { existingGoalText, excludedMetricTypes } = buildSuggestionExclusions([], []);
    expect(existingGoalText).toBe('None');
    expect(excludedMetricTypes.size).toBe(0);
  });

  it('lists active goals without the declined label', () => {
    const { existingGoalText } = buildSuggestionExclusions([activeGoal], []);
    expect(existingGoalText).toContain('Sleep 7+ hours for 2 weeks (sleep_hours)');
    expect(existingGoalText).not.toContain('previously declined');
  });

  it('labels declined goals as previously declined in the prompt text', () => {
    const { existingGoalText } = buildSuggestionExclusions([activeGoal], [declinedGoal]);
    expect(existingGoalText).toContain(
      'Cap meetings at 4 per day (meeting_count) [previously declined — do not re-suggest]'
    );
  });

  it('includes declined metric types in the hard duplicate filter', () => {
    const { excludedMetricTypes } = buildSuggestionExclusions([activeGoal], [declinedGoal]);
    expect(excludedMetricTypes.has('sleep_hours')).toBe(true);
    expect(excludedMetricTypes.has('meeting_count')).toBe(true);
    expect(excludedMetricTypes.has('focus_time')).toBe(false);
  });

  it('ignores goals with missing metric_type in the filter set', () => {
    const { excludedMetricTypes } = buildSuggestionExclusions(
      [{ title: 'No metric', metric_type: null }],
      []
    );
    expect(excludedMetricTypes.size).toBe(0);
  });
});
