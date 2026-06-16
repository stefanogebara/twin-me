/**
 * Regression for _parseInsightsJSON — the generator's LLM sometimes returns
 * the array then a second fenced copy ("[]\n```json\n[]```"). Strategy 3's
 * last-`]` spanned both arrays and threw, silently dropping real insights
 * before the Editor ever saw them. The balanced-first-array strategy fixes it.
 */
import { describe, it, expect } from 'vitest';
import { _parseInsightsJSON } from '../../../api/services/proactiveInsights.js';

describe('_parseInsightsJSON — doubled / fenced arrays', () => {
  it('parses a clean array', () => {
    expect(_parseInsightsJSON('[{"insight":"a"}]')).toEqual([{ insight: 'a' }]);
  });
  it('parses a fenced array', () => {
    expect(_parseInsightsJSON('```json\n[{"insight":"a"}]\n```')).toEqual([{ insight: 'a' }]);
  });
  it('the prod bug: empty array then a fenced empty copy -> []', () => {
    expect(_parseInsightsJSON('[]\n```json\n[]\n```')).toEqual([]);
  });
  it('the dangerous case: real array then a fenced duplicate -> first array, not dropped', () => {
    const out = _parseInsightsJSON('[{"insight":"real one"}]\n```json\n[{"insight":"real one"}]\n```');
    expect(out).toEqual([{ insight: 'real one' }]);
  });
  it('does not split brackets inside string values', () => {
    const out = _parseInsightsJSON('[{"insight":"you spend [a lot] on this"}]');
    expect(out[0].insight).toBe('you spend [a lot] on this');
  });
  it('still handles a single object response', () => {
    expect(_parseInsightsJSON('{"insight":"solo"}')).toEqual([{ insight: 'solo' }]);
  });
});
