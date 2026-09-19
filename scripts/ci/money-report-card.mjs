/**
 * Grade every nightly job from its own run history and write the report card down.
 * The rules live in reportCard.mjs; this only reads the Actions API and writes files.
 * Shadow grades only: a test streak never grants permission to mutate financial data.
 */
import fs from 'node:fs';
import { gradeRuns, renderSummary } from './reportCard.mjs';

const repo = process.env.GITHUB_REPOSITORY;
if (!repo || !process.env.GH_TOKEN) throw new Error('GitHub repository and read token required');
const api = async (path) => {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Cannot read report-card history (${response.status})`);
  return response.json();
};
const { workflow_runs: runs } = await api('actions/workflows/goals-nightly.yml/runs?branch=main&status=completed&per_page=20');
const histories = await Promise.all(runs.map(async (run) => ({ sha: run.head_sha, url: run.html_url, ...await api(`actions/runs/${run.id}/jobs?per_page=100`) })));
const grades = gradeRuns(histories);
const report = { generated_at: new Date().toISOString(), mode: 'shadow', grades };
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/report-card.json', JSON.stringify(report, null, 2) + '\n');
/* The old name, kept for anything still reading it. */
fs.writeFileSync('test-results/money-report-card.json', JSON.stringify(report, null, 2) + '\n');
const summary = renderSummary(grades);
process.stdout.write(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Report card\n\n${summary}`);
