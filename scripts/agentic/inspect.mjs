#!/usr/bin/env node
/**
 * The inspect stage: a fresh model reads the diff against the plan and says whether it does
 * what was asked, nothing more, with tests (M2-6 slice 2). The verdict is a comment on the
 * PR and a label; a person merges, or not. Without ANTHROPIC_API_KEY it says so and exits 0.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { INSPECT_TOOLS } from './guard.mjs';

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim();
const say = (s) => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n`); };

/** The verdict from the model's text: JSON, fenced or bare; anything else is "not approved". */
export function parseInspection(text) {
  const raw = String(text || '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const a = body.indexOf('{'); const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) return { approve: false, summary: 'no verdict in the answer', findings: [] };
  try {
    const v = JSON.parse(body.slice(a, b + 1));
    return { approve: v.approve === true, summary: String(v.summary || '').slice(0, 600), findings: Array.isArray(v.findings) ? v.findings.slice(0, 10).map(String) : [] };
  } catch { return { approve: false, summary: 'the verdict was not JSON', findings: [] }; }
}

export function buildPrompt(plan, branch) {
  return [
    'You are the inspect stage of a nightly maintenance loop. You did not write this change. Read the plan, then `git diff main...HEAD`, then the tests it touched, and answer honestly.',
    'Approve only if the change does exactly what the plan asked, no more, with a test that fails without it, and touches nothing under database/, the money ledger services, the crons, the workflows or .env.',
    'Reply with JSON only: {"approve": boolean, "summary": string, "findings": [string]}.',
    '', `## Branch`, branch, '', '## Plan', plan.reason, '', plan.plan,
  ].join('\n');
}

async function main() {
  if (!fs.existsSync('loop-plan.json') || !fs.existsSync('loop-pr.txt')) { say('Nothing to inspect.'); return; }
  if (!process.env.ANTHROPIC_API_KEY) { say('ANTHROPIC_API_KEY is not set: the inspect stage did not run.'); return; }
  const plan = JSON.parse(fs.readFileSync('loop-plan.json', 'utf8'));
  const pr = fs.readFileSync('loop-pr.txt', 'utf8').trim();
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const out = sh('claude', ['-p', buildPrompt(plan, branch), '--model', process.env.LOOP_INSPECT_MODEL || 'claude-opus-5', '--allowedTools', ...INSPECT_TOOLS, '--max-budget-usd', process.env.LOOP_INSPECT_BUDGET_USD || '3', '--output-format', 'text'], { maxBuffer: 16 * 1024 * 1024 });
  const verdict = parseInspection(out);
  const comment = `**Inspect stage:** ${verdict.approve ? 'approved' : 'not approved'}.\n\n${verdict.summary}${verdict.findings.length ? `\n\n${verdict.findings.map((f) => `- ${f}`).join('\n')}` : ''}\n\n_A fresh model read the diff against the plan. A person merges, or not._`;
  sh('gh', ['pr', 'comment', pr, '--body', comment]);
  sh('gh', ['pr', 'edit', pr, '--add-label', verdict.approve ? 'loop:approved' : 'loop:needs-work']);
  say(`Inspected ${pr}: ${verdict.approve ? 'approved' : 'not approved'} — ${verdict.summary}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main().catch((e) => { console.error(e.message); process.exit(1); });
