#!/usr/bin/env node
/**
 * AGENTS.md is CLAUDE.md, byte for byte.
 *
 * Two agents work this repository, and each reads its own instruction file. On 2026-09-19
 * AGENTS.md was a 170-line-drifted copy that still named a design system retired a week
 * earlier, which is how a review shipped off-register. One source: edit CLAUDE.md, run this.
 *
 *   node scripts/sync-agents.mjs          write AGENTS.md from CLAUDE.md
 *   node scripts/sync-agents.mjs --check  exit 1 if they differ (CI, and the goals canary)
 */
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('CLAUDE.md', 'utf8');
if (process.argv.includes('--check')) {
  let dst = null;
  try { dst = readFileSync('AGENTS.md', 'utf8'); } catch { /* missing counts as different */ }
  if (dst !== src) { console.error('AGENTS.md differs from CLAUDE.md; run: npm run sync:agents'); process.exit(1); }
  console.log('AGENTS.md is CLAUDE.md');
} else {
  writeFileSync('AGENTS.md', src);
  console.log('AGENTS.md written from CLAUDE.md');
}
