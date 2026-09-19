/**
 * The loop's first stage reads answers the way the owner asked: a refusal is a 200, so it
 * is read from the finish reason and the refusal field, and a verdict that is not JSON is
 * "no attention", never a guess.
 */
import { describe, expect, it } from 'vitest';
import { isRefusal, parseVerdict, buildTriagePrompt, MAX_OUTPUT_TOKENS } from '../../scripts/agentic/loop.mjs';

describe('the loop reads a model honestly', () => {
  it('sees a refusal inside a 200', () => {
    expect(isRefusal({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] })).toBe(false);
    expect(isRefusal({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] })).toBe(true);
    expect(isRefusal({ choices: [{ finish_reason: 'stop', message: { content: '', refusal: 'I cannot help with that.' } }] })).toBe(true);
    expect(isRefusal({ choices: [{ native_finish_reason: 'refusal', message: {} }] })).toBe(true);
    expect(isRefusal({})).toBe(true);
  });
  it('parses a fenced or bare verdict, and never guesses from prose', () => {
    expect(parseVerdict('```json\n{"attention": true, "reason": "canary red", "tasks": [{"title": "Fix", "files": ["a.js"], "acceptance": "test passes"}]}\n```'))
      .toMatchObject({ attention: true, reason: 'canary red', tasks: [{ title: 'Fix', files: ['a.js'] }], parsed: true });
    expect(parseVerdict('Sure! {"attention": false, "reason": "quiet night"}')).toMatchObject({ attention: false, parsed: true });
    expect(parseVerdict('Everything looks fine today.')).toMatchObject({ attention: false, parsed: false });
    expect(parseVerdict('{"attention": true, broken')).toMatchObject({ attention: false, parsed: false });
    expect(parseVerdict(JSON.stringify({ attention: true, tasks: Array.from({ length: 9 }, () => ({ title: 't' })) })).tasks).toHaveLength(5);
  });
  it('asks a conservative question and forbids the money tables', () => {
    const p = buildTriagePrompt({ log: 'abc fix', grades: [], issues: '' });
    expect(p).toMatch(/most days the answer is no/);
    expect(p).toMatch(/Never propose touching money_\* tables/);
    expect(MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(2000);
  });
});
