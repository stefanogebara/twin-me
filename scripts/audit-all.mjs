#!/usr/bin/env node
/**
 * Master Audit Runner
 * ===================
 *
 * Runs every opt-in audit suite in sequence, captures pass/fail + duration,
 * prints a master summary, and drops a JSON report to audit-results/.
 *
 * Exits 0 if every audit passes. Exits 1 if any audit fails. Exits 2 if
 * the runner itself errors (server down, missing playwright, etc.).
 *
 * Usage:
 *   npm run audit:all
 *   npm run audit:all -- --only=money,chat       # run a subset
 *   npm run audit:all -- --skip=a11y,console     # skip certain ones
 *   npm run audit:all -- --bail                  # stop on first failure
 *
 * Prereqs:
 *   - Frontend dev server running on http://localhost:8086
 *   - Backend dev server running on http://localhost:3004
 *   - .env populated with JWT_SECRET (used by helpers to mint tokens)
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const REPORT_DIR = join(ROOT, 'audit-results');

// ─────────────────────────────────────────────────────────────────────────────
// Audit definitions — id, env var, spec path, description
// ─────────────────────────────────────────────────────────────────────────────

const AUDITS = [
  {
    id: 'design',
    name: 'Design consistency (18 routes)',
    spec: 'tests/e2e/design-consistency-audit.spec.ts',
    env: 'TWINME_RUN_DESIGN_AUDIT',
  },
  {
    id: 'console',
    name: 'Console error sweep (18 routes)',
    spec: 'tests/e2e/console-error-sweep.spec.ts',
    env: 'TWINME_RUN_CONSOLE_SWEEP',
  },
  {
    id: 'money',
    name: '/money page comprehensive (8 specs)',
    spec: 'tests/e2e/money-page-comprehensive.spec.ts',
    env: 'TWINME_RUN_MONEY_AUDIT',
  },
  {
    id: 'chat',
    name: '/talk-to-twin comprehensive (7 specs)',
    spec: 'tests/e2e/talk-to-twin-comprehensive.spec.ts',
    env: 'TWINME_RUN_CHAT_AUDIT',
  },
  {
    id: 'identity',
    name: '/identity comprehensive (7 specs)',
    spec: 'tests/e2e/identity-page-comprehensive.spec.ts',
    env: 'TWINME_RUN_IDENTITY_AUDIT',
  },
  {
    id: 'pluggy',
    name: '/pluggy/register contract (5 specs)',
    spec: 'tests/e2e/pluggy-register-endpoint.spec.ts',
    env: 'TWINME_RUN_PLUGGY_REGISTER_AUDIT',
  },
  {
    id: 'a11y',
    name: 'Accessibility sweep (18 routes, axe-core)',
    spec: 'tests/e2e/accessibility-sweep.spec.ts',
    env: 'TWINME_RUN_A11Y_AUDIT',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Arg parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { only: null, skip: [], bail: false };
  for (const arg of argv) {
    if (arg.startsWith('--only=')) {
      opts.only = arg.slice('--only='.length).split(',').map((s) => s.trim());
    } else if (arg.startsWith('--skip=')) {
      opts.skip = arg.slice('--skip='.length).split(',').map((s) => s.trim());
    } else if (arg === '--bail') {
      opts.bail = true;
    }
  }
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight: verify servers reachable
// ─────────────────────────────────────────────────────────────────────────────

async function pingServer(url, label) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return true;
  } catch (err) {
    console.error(`[audit-all] ${label} unreachable at ${url}: ${err.message}`);
    return false;
  }
}

async function preflight() {
  const [front, back] = await Promise.all([
    pingServer('http://localhost:8086/', 'frontend'),
    pingServer('http://localhost:3004/api/health', 'backend'),
  ]);
  if (!front || !back) {
    console.error('\n[audit-all] Both servers must be running before audit:all.');
    console.error('  Frontend: npm run dev');
    console.error('  Backend:  npm run server:dev');
    process.exit(2);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run a single audit — spawn playwright with its env var set
// ─────────────────────────────────────────────────────────────────────────────

function runAudit(audit) {
  return new Promise((resolve) => {
    const start = Date.now();
    if (!existsSync(join(ROOT, audit.spec))) {
      resolve({ ...audit, status: 'missing', durationMs: 0, output: `Spec not found: ${audit.spec}` });
      return;
    }
    const env = { ...process.env, [audit.env]: 'true' };
    // --workers=1 serializes tests within a spec. Parallel workers cause
    // shared-resource contention (dev server module cache, backend
    // rate-limits, mock state) and flake tests that pass in isolation.
    // Wall-time cost is small; determinism matters more for a master gate.
    // shell:true so npx resolves npx.cmd on Windows; safe on POSIX too.
    const child = spawn(
      'npx',
      ['playwright', 'test', audit.spec, '--project=chromium', '--reporter=line', '--workers=1'],
      { cwd: ROOT, env, shell: true },
    );

    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('close', (code) => {
      const output = Buffer.concat(chunks).toString('utf8');
      // Parse the playwright tail for passed/failed counts
      const passMatch = output.match(/(\d+)\s+passed/);
      const failMatch = output.match(/(\d+)\s+failed/);
      const skipMatch = output.match(/(\d+)\s+skipped/);
      resolve({
        ...audit,
        status: code === 0 ? 'pass' : 'fail',
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
        passed: passMatch ? parseInt(passMatch[1], 10) : 0,
        failed: failMatch ? parseInt(failMatch[1], 10) : 0,
        skipped: skipMatch ? parseInt(skipMatch[1], 10) : 0,
        output: output.slice(-3000),  // last 3 KB tail for context if failed
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pretty-print summary table
// ─────────────────────────────────────────────────────────────────────────────

function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function printSummary(results) {
  console.log('\n' + '═'.repeat(78));
  console.log('  MASTER AUDIT REPORT');
  console.log('═'.repeat(78));
  const idLen = Math.max(...results.map((r) => r.id.length), 8);
  const nameLen = Math.max(...results.map((r) => r.name.length), 28);
  for (const r of results) {
    const tag =
      r.status === 'pass' ? '\x1b[32mPASS\x1b[0m' :
      r.status === 'fail' ? '\x1b[31mFAIL\x1b[0m' :
      r.status === 'skipped' ? '\x1b[90mSKIP\x1b[0m' :
      '\x1b[33mMISS\x1b[0m';
    const counts = r.status === 'pass' || r.status === 'fail'
      ? `(${r.passed} passed${r.failed ? `, ${r.failed} failed` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''})`
      : '';
    console.log(`  ${tag}  ${r.id.padEnd(idLen)}  ${r.name.padEnd(nameLen)}  ${fmtDuration(r.durationMs).padStart(7)}  ${counts}`);
  }
  console.log('═'.repeat(78));
  const totalDur = results.reduce((s, r) => s + r.durationMs, 0);
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const missing = results.filter((r) => r.status === 'missing').length;
  console.log(`  ${passed} pass / ${failed} fail${missing ? ` / ${missing} missing` : ''}    total ${fmtDuration(totalDur)}`);
  console.log('═'.repeat(78));

  if (failed > 0) {
    console.log('\nFailure tails:');
    for (const r of results) {
      if (r.status !== 'fail') continue;
      console.log(`\n--- ${r.id} (exit ${r.exitCode}) ---`);
      console.log(r.output);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await preflight();
  await mkdir(REPORT_DIR, { recursive: true });

  let toRun = AUDITS;
  if (opts.only) toRun = toRun.filter((a) => opts.only.includes(a.id));
  if (opts.skip.length) toRun = toRun.filter((a) => !opts.skip.includes(a.id));

  if (toRun.length === 0) {
    console.error('[audit-all] No audits selected — check --only / --skip filters.');
    process.exit(2);
  }

  console.log(`[audit-all] Running ${toRun.length} audit${toRun.length === 1 ? '' : 's'}: ${toRun.map((a) => a.id).join(', ')}`);

  const results = [];
  const startedAt = new Date().toISOString();
  for (let i = 0; i < toRun.length; i++) {
    const audit = toRun[i];
    // Settle delay between audits — Vite's dev module cache thrashes when
    // playwright sessions tear down and restart back-to-back, causing the
    // next spec's lazy chunks (MoneyPage.tsx, TalkToTwin.tsx) to fail
    // dynamic-import with "Failed to fetch". 4s gives Vite room to flush.
    if (i > 0) await new Promise((r) => setTimeout(r, 4000));
    process.stdout.write(`\n[audit-all] ▶ ${audit.id}: ${audit.name}\n`);
    const r = await runAudit(audit);
    const symbol = r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '·';
    process.stdout.write(`[audit-all] ${symbol} ${audit.id}: ${r.status} in ${fmtDuration(r.durationMs)}\n`);
    results.push(r);
    if (opts.bail && r.status === 'fail') {
      console.log('\n[audit-all] --bail: stopping after first failure.');
      break;
    }
  }

  printSummary(results);

  const reportPath = join(REPORT_DIR, 'master-report.json');
  await writeFile(
    reportPath,
    JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(`\nReport: ${reportPath}`);

  const anyFailed = results.some((r) => r.status === 'fail');
  const anyMissing = results.some((r) => r.status === 'missing');
  process.exit(anyFailed || anyMissing ? 1 : 0);
}

main().catch((err) => {
  console.error('[audit-all] Runner crashed:', err);
  process.exit(2);
});
