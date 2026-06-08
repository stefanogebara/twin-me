/**
 * reflectionStore — confidence label<->numeric mapping
 * ====================================================
 * Regression for the cache-write failure that broke insights caching:
 * `reflection_history.confidence` is NUMERIC but reflections carry a label
 * ('high'|'medium'|'low'). Writing the label raw failed with
 * "invalid input syntax for type numeric: high", so nothing ever cached and
 * every insights load re-ran the LLM. The store layer now maps label<->numeric.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/config/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

const { formatResponse, toConfidenceLabel } = await import('../../../api/services/reflections/reflectionStore.js');

describe('toConfidenceLabel', () => {
  it('maps numeric confidence back to a label', () => {
    expect(toConfidenceLabel(0.9)).toBe('high');
    expect(toConfidenceLabel(0.6)).toBe('medium');
    expect(toConfidenceLabel(0.3)).toBe('low');
  });

  it('passes through an existing string label', () => {
    expect(toConfidenceLabel('high')).toBe('high');
    expect(toConfidenceLabel('low')).toBe('low');
  });

  it('defaults to medium when missing', () => {
    expect(toConfidenceLabel(undefined)).toBe('medium');
    expect(toConfidenceLabel(null)).toBe('medium');
  });
});

describe('formatResponse confidence normalization', () => {
  it('a cached (numeric) reflection is surfaced to the API as a label', () => {
    const stored = {
      id: 'r1',
      reflection_text: 'You debug feelings like code.',
      generated_at: '2026-06-06T00:00:00Z',
      expires_at: '2026-06-06T04:00:00Z',
      confidence: 0.9, // numeric, as stored in the DB
      themes: [],
      data_snapshot: { patterns: [], evidence: [] },
    };
    const res = formatResponse(stored, []);
    expect(res.success).toBe(true);
    expect(res.reflection.confidence).toBe('high'); // not the raw number
  });

  it('a freshly generated (label) reflection keeps its label', () => {
    const fresh = { text: 'Fresh reflection', confidence: 'low', themes: [], patterns: [], evidence: [] };
    const res = formatResponse(fresh, []);
    expect(res.reflection.confidence).toBe('low');
  });
});
