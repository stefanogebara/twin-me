#!/usr/bin/env node
/**
 * The implement stage: Claude Code, headless, on the plan, on a branch (M2-6 slice 2).
 *
 *   1. read loop-plan.json (written by the triage job)
 *   2. claude -p with the plan, the repo's own rules (CLAUDE.md is read by the CLI), edits and
 *      tests only, a dollar cap, no git and no network
 *   3. refuse the result if any changed path is forbidden (guard.mjs) or nothing changed
 *   4. run the unit suite, the strict money typecheck and eslint on the change, refuse if any
 *      fails (the PR's own CI waits for a maintainer's approval, named in the summary)
 *   5. commit on loop/<date>, push, open a PR labelled loop, linking the issue
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
  /* A push made with GITHUB_TOKEN starts no workflow, so the loop's PR gets no CI of its own
     (seen on #444, 2026-09-20). The stage runs the checks here, before anything is pushed:
     the unit suite without retries, the strict money typecheck, and eslint on what changed. */
  const checks = [
    ['npx', ['vitest', 'run', '--retry=0', '--exclude', '**/*.integration.test.js']],
    ['npx', ['tsc', '-p', 'tsconfig.money.json']],
    ['npx', ['eslint', '--no-warn-ignored', ...changed.filter((p) => /\.(js|mjs|ts|tsx)$/.test(p))]],
  ];
  for (const [cmd, args] of checks) {
    try { sh(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }); }
    catch (error) {
      const tail = String(error.stdout || error.stderr || error.message).split('\n').slice(-25).join('\n');
      fs.writeFileSync('loop-implement.log', `${out}\n\n--- ${cmd} ${args.join(' ')} failed ---\n${tail}`);
      sh('git', ['checkout', '--', '.']); sh('git', ['clean', '-fdq']);
      say(`REFUSED: \`${cmd} ${args.slice(0, 2).join(' ')}\` failed on the change; nothing was pushed. The tail is in the log artifact.`);
      process.exitCode = 1; return;
    }
  }
  sh('git', ['config', 'user.name', 'twinme-loop']); sh('git', ['config', 'user.email', 'loop@twinme.me']);
  sh('git', ['add', '--', ...changed]);
  sh('git', ['commit', '-q', '-m', `loop: ${plan.tasks?.[0]?.title || plan.reason}`.slice(0, 72) + `\n\nWritten by the loop's implement stage from the plan in ${plan.issue || 'the triage issue'}.\nInspect stage and a person read before anything merges.`]);
  sh('git', ['push', '-q', '--force-with-lease', '-u', 'origin', branch]);
  const body = `From the loop's triage (${plan.issue || 'issue'}):\n\n${plan.reason}\n\n## Plan\n${plan.plan}\n\n_Opened by the implement stage; the inspect stage leaves its verdict below. Never merged by the loop._`;
  let pr;
  try { pr = sh('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', `Loop: ${(plan.tasks?.[0]?.title || plan.reason).slice(0, 60)}`, '--body', body, '--label', 'loop']); }
  catch { pr = sh('gh', ['pr', 'view', branch, '--json', 'url', '--jq', '.url']); }
  /* Pushed and opened with LOOP_PUSH_TOKEN (a person's fine-grained PAT, set 2026-09-22), the
     PR's CI runs like anyone's. On the app token it does start but waits for a maintainer's
     approval, because github-actions[bot] counts as a first-time contributor (seen on #448,
     2026-09-20), and a run dispatched by name does not count as the PR's checks; that path
     names the one command a person runs, which approves every waiting run and queues the merge. */
  const repo = process.env.GITHUB_REPOSITORY;
  if (process.env.LOOP_PUSH_TOKEN_SET === 'true') {
    say(`Opened with the loop's own token, so its checks run on their own. When they are green:\n  gh pr merge ${pr} --squash --delete-branch`);
  } else {
    say(`The PR's runs wait for a maintainer's approval. To release them and queue the merge:\n` +
      `  for r in $(gh run list --branch ${branch} --json databaseId,conclusion --jq '.[] | select(.conclusion=="action_required") | .databaseId'); do gh api -X POST repos/${repo}/actions/runs/$r/approve; done\n` +
      `  gh pr merge ${pr} --squash --auto --delete-branch`);
  }
  fs.writeFileSync('loop-pr.txt', pr);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `pr=${pr}\nbranch=${branch}\n`);
  say(`Implemented on ${branch}: ${changed.length} files; ${pr}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main().catch((e) => { console.error(e.message); process.exit(1); });
