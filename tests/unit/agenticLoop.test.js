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

describe('a rehearsal plan', () => {
  it('goes straight to the implement stage, marked as a rehearsal', async () => {
    const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-')); const cwd = process.cwd(); process.chdir(dir);
    const out = path.join(dir, 'out.txt'); fs.writeFileSync(out, '');
    process.env.LOOP_REHEARSAL_PLAN = 'add a unit test for words.ts cap()'; process.env.GITHUB_OUTPUT = out;
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('node', [path.join(cwd, 'scripts/agentic/loop.mjs')], { env: { ...process.env }, encoding: 'utf8' });
      const plan = JSON.parse(fs.readFileSync('loop-plan.json', 'utf8'));
      expect(plan.rehearsal).toBe(true); expect(plan.tasks[0].title).toBe('add a unit test for words.ts cap()');
      expect(fs.readFileSync(out, 'utf8')).toMatch(/attention=true/);
    } finally { process.chdir(cwd); delete process.env.LOOP_REHEARSAL_PLAN; delete process.env.GITHUB_OUTPUT; }
  });
});
