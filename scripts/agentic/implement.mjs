#!/usr/bin/env node
/**
 * The implement stage: Claude Code, headless, on the plan, on a branch (M2-6 slice 2).
 *
 *   1. read loop-plan.json (written by the triage job)
 *   2. claude -p with the plan, the repo's own rules (CLAUDE.md is read by the CLI), edits and
 *      tests only, a dollar cap, no git and no network
 *   3. refuse the result if any changed path is forbidden (guard.mjs) or nothing changed
 *   4. commit on loop/<date>, push, open a PR labelled loop, linking the issue
 *
 * It never merges; the inspect stage and a person do the reading. ANTHROPIC_API_KEY comes from
 * the repository's secrets; without it the stage says so and exits 0.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { forbiddenPaths, IMPLEMENT_TOOLS } from './guard.mjs';

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim();
const say = (s) => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n`); };

export function buildPrompt(plan) {
  return [
    'You are the implement stage of a nightly maintenance loop for this repository. Read CLAUDE.md first and follow it.',
    'Do exactly the plan below and nothing more: small, complete, with a test that fails without the change. No emojis anywhere. Do not touch database/, the money ledger services (ledger, ingestion, store, the feeds), the cron routes, the workflows, or .env files. Do not run git.',
    'When done, run the tests you touched with `npx vitest run <files>` and stop.',
    '', '## Why', plan.reason, '', '## Plan', plan.plan, '', '## Tasks', JSON.stringify(plan.tasks, null, 2),
  ].join('\n');
}

async function main() {
  if (!fs.existsSync('loop-plan.json')) { say('No plan from triage: nothing to implement.'); return; }
  if (!process.env.ANTHROPIC_API_KEY) { say('ANTHROPIC_API_KEY is not set: the implement stage did not run.'); return; }
  const plan = JSON.parse(fs.readFileSync('loop-plan.json', 'utf8'));
  const date = new Date().toISOString().slice(0, 10);
  const branch = `loop/${date}`;
  sh('git', ['checkout', '-B', branch]);
  const out = sh('claude', ['-p', buildPrompt(plan), '--model', process.env.LOOP_IMPLEMENT_MODEL || 'claude-sonnet-5', '--allowedTools', ...IMPLEMENT_TOOLS, '--max-budget-usd', process.env.LOOP_IMPLEMENT_BUDGET_USD || '5', '--output-format', 'text'], { maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync('loop-implement.log', out);
  /* The stage's own files travel as artifacts, never as part of the change. */
  const OWN = new Set(['loop-plan.json', 'loop-implement.log', 'loop-pr.txt']);
  const changed = sh('git', ['status', '--porcelain']).split('\n').filter(Boolean).map((l) => l.slice(3).trim()).filter((p) => !OWN.has(p));
  if (!changed.length) { say('The implement stage changed nothing.'); return; }
  const forbidden = forbiddenPaths(changed);
  if (forbidden.length) { sh('git', ['checkout', '--', '.']); sh('git', ['clean', '-fdq']); say(`REFUSED: the change touched ${forbidden.join(', ')}; the shadow rule stands. Nothing was committed.`); process.exitCode = 1; return; }
  sh('git', ['config', 'user.name', 'twinme-loop']); sh('git', ['config', 'user.email', 'loop@twinme.me']);
  sh('git', ['add', '--', ...changed]);
  sh('git', ['commit', '-q', '-m', `loop: ${plan.tasks?.[0]?.title || plan.reason}`.slice(0, 72) + `\n\nWritten by the loop's implement stage from the plan in ${plan.issue || 'the triage issue'}.\nInspect stage and a person read before anything merges.`]);
  sh('git', ['push', '-q', '--force-with-lease', '-u', 'origin', branch]);
  const body = `From the loop's triage (${plan.issue || 'issue'}):\n\n${plan.reason}\n\n## Plan\n${plan.plan}\n\n_Opened by the implement stage; the inspect stage leaves its verdict below. Never merged by the loop._`;
  let pr;
  try { pr = sh('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', `Loop: ${(plan.tasks?.[0]?.title || plan.reason).slice(0, 60)}`, '--body', body, '--label', 'loop']); }
  catch { pr = sh('gh', ['pr', 'view', branch, '--json', 'url', '--jq', '.url']); }
  fs.writeFileSync('loop-pr.txt', pr);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `pr=${pr}\nbranch=${branch}\n`);
  say(`Implemented on ${branch}: ${changed.length} files; ${pr}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main().catch((e) => { console.error(e.message); process.exit(1); });
