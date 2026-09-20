#!/usr/bin/env node
/**
 * The loop, stage one: does anything need attention today?
 *
 * Agentic OS phase 2 (docs/roadmap/PROGRESS.md, M2-6). It runs from GitHub Actions after the
 * nightly canaries (decision D4: no machine has to be awake, the run history is the report
 * card, nothing lands on the Vercel bill). Stages:
 *
 *   1. triage    a cheap model reads what changed since the last run and the report card,
 *                and answers one question: does anything need attention, and what.
 *   2. manager   only if so: a stronger model writes the plan -- files, acceptance, risk --
 *                and does not edit anything.
 *   3. implement  (slice 2, 2026-09-20) a second job runs Claude Code headless on the plan, on a
 *                branch, with edits and tests only; the shadow rule (guard.mjs) refuses any
 *                change to the ledger's tables, the feed or the schema; it opens a PR, never merges.
 *   4. inspect    a fresh model reads the diff against the plan and leaves its verdict on the PR.
 *
 * The plan is opened (or appended) as a GitHub issue for a person or the harness to take.
 * Three rules the owner named: a refusal comes back as HTTP 200, so the answer is checked
 * for its finish reason and refusal field, never its status alone; output is capped; and
 * nothing here ever touches money_* tables, the bank, or a branch.
 *
 *   OPENROUTER_API_KEY   required for the model calls; without it the loop reports and exits 0
 *   GH_TOKEN + GITHUB_REPOSITORY   for the report card and the issue
 *   LOOP_TRIAGE_MODEL    default deepseek/deepseek-v3.2 (the house cheap model)
 *   LOOP_MANAGER_MODEL   default anthropic/claude-sonnet-4.5
 *   LOOP_DRY_RUN=1       print what would be asked, ask nothing, open nothing
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { gradeRuns, renderSummary } from '../ci/reportCard.mjs';

export const MAX_OUTPUT_TOKENS = 1200;
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

/** A 200 that is not an answer: the model declined, or the provider cut it off. */
export function isRefusal(completion) {
  const choice = completion?.choices?.[0];
  if (!choice) return true;
  const finish = String(choice.finish_reason || choice.native_finish_reason || '').toLowerCase();
  if (finish === 'content_filter' || finish === 'refusal') return true;
  if (choice.message?.refusal) return true;
  return false;
}

/** The triage verdict from the model's text: fenced or bare JSON, or a refusal to guess. */
export function parseVerdict(text) {
  const raw = String(text || '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf('{'); const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return { attention: false, reason: 'no verdict in the answer', tasks: [], parsed: false };
  try {
    const v = JSON.parse(body.slice(start, end + 1));
    return {
      attention: Boolean(v.attention),
      reason: String(v.reason || '').slice(0, 600),
      tasks: Array.isArray(v.tasks) ? v.tasks.slice(0, 5).map((t) => ({ title: String(t.title || '').slice(0, 120), files: Array.isArray(t.files) ? t.files.slice(0, 8).map(String) : [], acceptance: String(t.acceptance || '').slice(0, 300) })) : [],
      parsed: true,
    };
  } catch {
    return { attention: false, reason: 'the verdict was not JSON', tasks: [], parsed: false };
  }
}

export function buildTriagePrompt({ log, grades, issues }) {
  return [
    'You are the triage step of a nightly maintenance loop for TwinMe Money, a spending ledger for students (Node/Express API, React front end, Supabase).',
    'Answer ONE question: does anything need attention today? Base it only on the evidence below. Be conservative: most days the answer is no.',
    'Reply with JSON only: {"attention": boolean, "reason": string, "tasks": [{"title": string, "files": [string], "acceptance": string}]} with at most 5 tasks. Never propose touching money_* tables, the bank feed, or secrets.',
    '', '## Commits since the last run', log || '(none)',
    '', '## Report card (last twenty nights per task type)', renderSummary(grades),
    '', '## Open tracking issues', issues || '(none)',
  ].join('\n');
}

async function ask(model, prompt, { key, maxTokens = MAX_OUTPUT_TOKENS }) {
  const res = await fetch(OPENROUTER, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://twinme.me', 'X-Title': 'TwinMe loop' },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(60000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`model call failed: HTTP ${res.status}`);
  if (isRefusal(json)) throw new Error(`model declined (${json?.choices?.[0]?.finish_reason || 'refusal'})`);
  return String(json.choices[0].message?.content || '');
}

async function github(path, init = {}) {
  const repo = process.env.GITHUB_REPOSITORY; const token = process.env.GH_TOKEN;
  if (!repo || !token) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res.json();
}

async function reportCard() {
  const runs = await github('actions/workflows/goals-nightly.yml/runs?branch=main&status=completed&per_page=20');
  if (!runs) return [];
  const histories = await Promise.all(runs.workflow_runs.map(async (run) => ({ sha: run.head_sha, url: run.html_url, ...await github(`actions/runs/${run.id}/jobs?per_page=100`) })));
  return gradeRuns(histories);
}

async function upsertIssue(title, body) {
  const found = await github(`issues?state=open&labels=loop&per_page=5`);
  const existing = (found || []).find((i) => i.title === title);
  if (existing) { await github(`issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); return existing.html_url; }
  const made = await github('issues', { method: 'POST', body: JSON.stringify({ title, body, labels: ['loop'] }) });
  return made?.html_url || null;
}

async function main() {
  const dry = process.env.LOOP_DRY_RUN === '1';
  const key = process.env.OPENROUTER_API_KEY;
  const since = process.env.LOOP_SINCE || '26 hours ago';
  const log = execSync(`git log --since="${since}" --no-merges --format='%h %s' | head -60`, { encoding: 'utf8' }).trim();
  const grades = await reportCard().catch((e) => { console.log(`report card unavailable: ${e.message}`); return []; });
  const open = await github('issues?state=open&labels=loop,goals&per_page=10').catch(() => null);
  const issues = (open || []).map((i) => `- #${i.number} ${i.title}`).join('\n');
  const prompt = buildTriagePrompt({ log, grades, issues });
  const summary = [];
  if (!key || dry) {
    summary.push(dry ? 'Dry run: nothing was asked.' : 'Triage skipped: OPENROUTER_API_KEY is not set.');
    summary.push('', '### What would have been asked', '```', prompt.slice(0, 4000), '```');
  } else {
    const verdict = parseVerdict(await ask(process.env.LOOP_TRIAGE_MODEL || 'deepseek/deepseek-v3.2', prompt, { key }));
    summary.push(`Triage: attention ${verdict.attention ? 'YES' : 'no'} — ${verdict.reason}`);
    if (verdict.attention) {
      const plan = await ask(process.env.LOOP_MANAGER_MODEL || 'anthropic/claude-sonnet-4.5',
        `You are the manager of a maintenance loop. Do not write code. From this triage, write a plan: for each task, the files, the acceptance criteria (a test that fails without the change), the risk, and the order. Under 500 words, plain prose, no emojis.\n\n${JSON.stringify(verdict, null, 2)}\n\nEvidence:\n${prompt}`,
        { key, maxTokens: 1500 });
      summary.push('', '### Plan', plan);
      const url = await upsertIssue(`Loop: attention needed (${new Date().toISOString().slice(0, 10)})`, `${verdict.reason}\n\n${plan}\n\n_The implement stage takes this from here; its PR links back._`).catch((e) => `issue not opened: ${e.message}`);
      summary.push('', `Issue: ${url}`);
      /* Handed to the implement job: the plan as a file, and the fact of it as an output. */
      fs.writeFileSync('loop-plan.json', JSON.stringify({ reason: verdict.reason, tasks: verdict.tasks, plan, issue: url }, null, 2));
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'attention=true\n');
    }
  }
  summary.push('', 'Implement and inspect run as their own jobs when attention is needed; the loop opens a PR and never merges. Money is never written to by this loop.');
  const out = summary.join('\n');
  console.log(out);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Loop\n\n${out}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
