#!/usr/bin/env node
/**
 * Probe concept-query retrieval against stefano's memory stream.
 *
 * Confirms the 2026-05-23 noise-clamp backfill (paired with the 2026-05-16
 * forward fix) lets Renan's strategic-advice facts surface in top 5 for the
 * concept queries from tasks/todo.md FOLLOW-UP.
 *
 * Pre-backfill failure mode: 20+ "Created branch twin-voice-fixes" rows at
 * importance 7-8 outranked importance-10 Renan facts on relevance because
 * the branch names literally contained query keywords.
 *
 * Run: node scripts/probe-concept-retrieval.js
 */
import 'dotenv/config';
import { retrieveMemories } from '../api/services/memoryStreamService.js';

const STEFANO = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

const QUERIES = [
  // original noise-clamp probes
  'features I should kill in TwinMe',
  'what did Renan tell me to focus on',
  // product-term retrieval (the FOLLOW-UP main worry)
  'Vibe Anything paradigm',
  'tell me about Vibe Anything',
  // judgmental angle on a heavily-described product term
  "what's Renan's view on Soul Signature",
  'should I keep the Soul Signature feature',
  // Renan-coined phrases (different vocab shapes)
  'what is the credit-card-wedge framework',
  'fazer menos não mais',
  // generic "what should I cut" — the natural twin-chat query
  'what features should I cut to ship faster',
];

const PRESETS = ['default'];

// Toggle via env: USE_HYDE=true node scripts/probe-concept-retrieval.js
const USE_HYDE = process.env.USE_HYDE === 'true';

function isRenan(mem) {
  const src = mem.metadata?.source || '';
  return src.startsWith('renan_call_') || src === 'renan_call_2026-04-20_facts';
}

function isGithubNoise(mem) {
  const c = mem.content || '';
  return (
    /^Created branch ".+" in/i.test(c) ||
    /^Your GitHub language distribution:/i.test(c) ||
    /^Your GitHub \d{4} activity:/i.test(c) ||
    /^Committed code on \d+ days/i.test(c) ||
    /^Current GitHub contribution streak:/i.test(c)
  );
}

function tag(mem) {
  if (isRenan(mem)) return 'RENAN ';
  if (isGithubNoise(mem)) return 'GHNOISE';
  return '       ';
}

function fmt(mem, rank) {
  const imp = String(mem.importance_score ?? mem.importance ?? '?').padStart(2);
  const type = (mem.memory_type || '?').padEnd(13);
  const src = (mem.metadata?.source || '').slice(0, 28).padEnd(28);
  const content = (mem.content || '').replace(/\s+/g, ' ').slice(0, 90);
  return `  ${String(rank).padStart(2)}. [${tag(mem)}] imp=${imp} ${type} src=${src} | ${content}`;
}

function rankOfFirstRenan(results) {
  for (let i = 0; i < results.length; i++) {
    if (isRenan(results[i])) return i + 1;
  }
  return -1;
}

async function probe(query, preset) {
  process.stdout.write(`\n=== query="${query}" preset=${preset} ===\n`);
  try {
    const results = await retrieveMemories(STEFANO, query, 10, preset, { skipHyDE: !USE_HYDE });
    if (!results || results.length === 0) {
      process.stdout.write('  (no results)\n');
      return { renanRank: -1, ghNoiseInTop5: 0 };
    }
    const ghNoiseInTop5 = results.slice(0, 5).filter(isGithubNoise).length;
    const renanRank = rankOfFirstRenan(results);
    results.forEach((m, i) => process.stdout.write(fmt(m, i + 1) + '\n'));
    process.stdout.write(`  -> first Renan rank: ${renanRank === -1 ? 'NOT IN TOP 10' : renanRank}\n`);
    process.stdout.write(`  -> github noise in top 5: ${ghNoiseInTop5}\n`);
    return { renanRank, ghNoiseInTop5 };
  } catch (err) {
    process.stdout.write(`  ERROR: ${err.message}\n`);
    return { renanRank: -1, ghNoiseInTop5: 0 };
  }
}

async function main() {
  const summary = [];
  for (const q of QUERIES) {
    for (const p of PRESETS) {
      const r = await probe(q, p);
      summary.push({ query: q, preset: p, ...r });
    }
  }
  process.stdout.write('\n=== SUMMARY ===\n');
  for (const s of summary) {
    const pass = s.renanRank > 0 && s.renanRank <= 5 ? 'PASS' : 'FAIL';
    process.stdout.write(
      `  [${pass}] "${s.query}" (${s.preset}) — Renan rank ${s.renanRank}, gh-noise top-5 ${s.ghNoiseInTop5}\n`
    );
  }
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`FATAL: ${err.stack || err.message}\n`);
  process.exit(1);
});
