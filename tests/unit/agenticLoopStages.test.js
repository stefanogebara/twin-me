/** The loop's implement and inspect stages: the shadow rule as code, the tools they may use, the verdict read honestly. */
import { describe, expect, it } from 'vitest';
import { forbiddenPaths, IMPLEMENT_TOOLS, INSPECT_TOOLS } from '../../scripts/agentic/guard.mjs';
import { parseInspection, buildPrompt as inspectPrompt } from '../../scripts/agentic/inspect.mjs';
import { buildPrompt as implementPrompt } from '../../scripts/agentic/implement.mjs';

describe('the shadow rule', () => {
  it('refuses the ledger, the feed, the schema, the crons, the workflows and the env', () => {
    expect(forbiddenPaths(['database/migrations/x.sql', 'api/_app/services/money/ledger.js', 'api/_app/services/money/feeds/enableBanking.js', 'api/_app/routes/cron-money-pull.js', '.github/workflows/ci.yml', '.env.example', 'scripts/money/merge-duplicate-payments.mjs']).length).toBe(7);
    expect(forbiddenPaths(['src/pages/money/words.ts', 'api/_app/services/money/words.js', 'tests/unit/x.test.js', 'api/_app/services/money/calibration.js'])).toEqual([]);
  });
  it('gives the stages edits and tests, never git or the network', () => {
    for (const tools of [IMPLEMENT_TOOLS, INSPECT_TOOLS]) {
      expect(tools.some((t) => /^Bash\(git (push|commit|checkout)/.test(t))).toBe(false);
      expect(tools.some((t) => /WebFetch|WebSearch|Bash\(curl|Bash\(gh /.test(t))).toBe(false);
    }
    expect(IMPLEMENT_TOOLS).toContain('Edit');
    expect(INSPECT_TOOLS).not.toContain('Edit');
  });
});

describe('the inspect verdict', () => {
  it('approves only an explicit true, and never guesses from prose', () => {
    expect(parseInspection('```json\n{"approve": true, "summary": "does the plan", "findings": []}\n```')).toMatchObject({ approve: true, summary: 'does the plan' });
    expect(parseInspection('{"approve": "yes", "summary": "x"}').approve).toBe(false);
    expect(parseInspection('Looks good to me!').approve).toBe(false);
    expect(parseInspection('{"approve": true, "findings": ' + JSON.stringify(Array.from({ length: 20 }, (_, i) => `f${i}`)) + '}').findings).toHaveLength(10);
  });
  it('tells both stages the rule in their own prompts', () => {
    const plan = { reason: 'r', plan: 'p', tasks: [{ title: 't' }] };
    expect(implementPrompt(plan)).toMatch(/Do not touch database\//);
    expect(implementPrompt(plan)).toMatch(/No emojis/);
    expect(inspectPrompt(plan, 'loop/2026-09-20')).toMatch(/You did not write this change/);
  });
});

describe('the implement stage and its own files', () => {
  it('never commits the plan, the log or the PR note, and .gitignore agrees', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../scripts/agentic/implement.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/OWN = new Set\(\['loop-plan\.json', 'loop-implement\.log', 'loop-pr\.txt'\]\)/);
    const ignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
    for (const f of ['loop-plan.json', 'loop-implement.log', 'loop-pr.txt']) expect(ignore).toMatch(new RegExp(`^${f.replace('.', '\\.')}$`, 'm'));
  });
});

describe('the implement stage checks before it pushes', () => {
  it('runs the unit suite without retries, the strict money typecheck and eslint, and refuses on failure', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../scripts/agentic/implement.mjs', import.meta.url), 'utf8');
    const checks = src.indexOf('const checks = ['); const push = src.indexOf("['push',");
    expect(checks).toBeGreaterThan(0); expect(push).toBeGreaterThan(checks);
    expect(src).toMatch(/'vitest', 'run', '--retry=0'/);
    expect(src).toMatch(/'tsc', '-p', 'tsconfig\.money\.json'/);
    expect(src).toMatch(/REFUSED: /);
    expect(src).toMatch(/select\(\.conclusion=="action_required"\)/);
    expect(src).toMatch(/--squash --auto --delete-branch/);
  });
});
