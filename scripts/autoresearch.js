#!/usr/bin/env node
/**
 * Autoresearch CLI -- Karpathy-style hill-climbing prompt optimizer for TwinMe.
 *
 * Usage:
 *   node scripts/autoresearch.js --target twin-chat --rounds 10
 *   node scripts/autoresearch.js --target reflections --expert 0 --rounds 20
 *   node scripts/autoresearch.js --target twin-chat --dry-run
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
dotenv.config({ path: resolve(ROOT, '.env') });

import { TARGETS, DEFAULTS } from './autoresearch/config.js';
import { extractPrompt } from './autoresearch/promptExtractor.js';
import { buildTestInputs } from './autoresearch/testInputBuilder.js';
import { scorePrompt } from './autoresearch/scorer.js';
import { mutatePrompt } from './autoresearch/mutator.js';
import { generateDashboard } from './autoresearch/dashboardGenerator.js';

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}
const hasFlag = (name) => args.includes(`--${name}`);

const targetId = getArg('target', null);
const rounds = parseInt(getArg('rounds', DEFAULTS.rounds), 10);
const threshold = parseFloat(getArg('threshold', DEFAULTS.threshold));
const expertIndex = parseInt(getArg('expert', '0'), 10);
const dryRun = hasFlag('dry-run');

if (!targetId || !TARGETS[targetId]) {
  console.error('Usage: node scripts/autoresearch.js --target <twin-chat|onboarding|reflections|insights> [--rounds N] [--dry-run]');
  console.error('Available targets:', Object.keys(TARGETS).join(', '));
  process.exit(1);
}

const target = { ...TARGETS[targetId] };
if (targetId === 'reflections') target.expertIndex = expertIndex;

// Lazy-load LLM gateway and database
async function loadDeps() {
  const { complete } = await import('../api/services/llmGateway.js');
  const { supabaseAdmin } = await import('../api/services/database.js');
  return { complete, supabaseAdmin };
}

async function main() {
  console.log(`\n  AUTORESEARCH -- ${target.name}`);
  console.log(`  Rounds: ${rounds} | Threshold: ${Math.round(threshold * 100)}% | Dry run: ${dryRun}\n`);

  // Step 1: Extract current prompt
  console.log('  [1/4] Extracting prompt...');
  let currentPrompt;
  try {
    currentPrompt = extractPrompt(target);
    console.log(`        Extracted ${currentPrompt.length} chars from ${target.sourceFile}`);
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Show criteria
  console.log(`\n  [2/4] Scoring criteria (${target.criteria.length}):`);
  for (const c of target.criteria) {
    console.log(`        ${c.id}. ${c.text}`);
  }

  if (dryRun) {
    console.log('\n  DRY RUN -- prompt extracted, criteria shown. No LLM calls made.');
    console.log(`\n  Prompt preview (first 300 chars):\n  ${currentPrompt.slice(0, 300)}...`);
    process.exit(0);
  }

  // Step 3: Setup
  console.log('\n  [3/4] Loading dependencies...');
  const { complete, supabaseAdmin } = await loadDeps();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = resolve(ROOT, 'scripts', 'autoresearch-results', targetId, `run-${timestamp}`);
  mkdirSync(outputDir, { recursive: true });

  // Save original
  writeFileSync(resolve(outputDir, 'prompt-v0.txt'), currentPrompt);

  // Build test inputs
  console.log('        Building test inputs...');
  const testData = await buildTestInputs(target, supabaseAdmin, outputDir);
  console.log(`        ${testData.testInputs.length} test inputs ready`);

  // Step 4: Run loop
  console.log('\n  [4/4] Starting optimization loop...\n');

  const scores = [];
  const changelog = [];
  let bestPrompt = currentPrompt;
  let bestScore = 0;
  let totalCost = 0;

  // Baseline
  console.log('  Round 0 (baseline)...');
  const baseline = await scorePrompt(target, currentPrompt, testData, complete);
  bestScore = baseline.score;
  totalCost += baseline.cost;
  scores.push({
    round: 0,
    score: baseline.score,
    criterionPassRates: baseline.criterionPassRates,
    cost: baseline.cost,
    kept: true,
  });
  console.log(`  Baseline: ${Math.round(baseline.score * 100)}% (${baseline.totalPassing}/${baseline.totalChecks})`);
  printCriterionRates(baseline.criterionPassRates, target.criteria);

  // Optimization rounds
  for (let round = 1; round <= rounds; round++) {
    console.log(`\n  Round ${round}/${rounds}...`);

    // Early exit
    if (bestScore >= threshold) {
      console.log(`  Threshold ${Math.round(threshold * 100)}% reached! Stopping.`);
      break;
    }

    // Get latest score results for failing criteria
    const latestScore = scores[scores.length - 1];
    const failingCriteria = target.criteria
      .map(c => ({ ...c, passRate: latestScore.criterionPassRates?.[c.id] || 0 }))
      .filter(c => c.passRate < 1)
      .sort((a, b) => a.passRate - b.passRate);

    if (failingCriteria.length === 0) {
      console.log('  All criteria passing! Stopping.');
      break;
    }

    // Mutate
    const mutation = await mutatePrompt(currentPrompt, failingCriteria, { results: baseline.results }, complete);
    totalCost += mutation.cost || 0;

    if (!mutation.changed) {
      console.log(`  Mutation skipped: ${mutation.change}`);
      changelog.push({ round, change: mutation.change, kept: false, scoreBefore: bestScore, scoreAfter: bestScore });
      scores.push({ round, score: bestScore, criterionPassRates: latestScore.criterionPassRates, cost: 0, kept: false });
      continue;
    }

    // Score the mutated prompt
    const newScoreResult = await scorePrompt(target, mutation.prompt, testData, complete);
    totalCost += newScoreResult.cost;

    const improved = newScoreResult.score > bestScore;

    if (improved) {
      currentPrompt = mutation.prompt;
      bestPrompt = mutation.prompt;
      bestScore = newScoreResult.score;
      writeFileSync(resolve(outputDir, `prompt-v${round}.txt`), mutation.prompt);
      console.log(`  KEPT: ${Math.round(newScoreResult.score * 100)}% (+${Math.round((newScoreResult.score - scores[scores.length - 1].score) * 100)}%) -- ${mutation.change.slice(0, 80)}`);
    } else {
      console.log(`  REVERTED: ${Math.round(newScoreResult.score * 100)}% (no improvement) -- ${mutation.change.slice(0, 80)}`);
    }

    changelog.push({
      round,
      change: mutation.change,
      kept: improved,
      scoreBefore: scores[scores.length - 1].score,
      scoreAfter: newScoreResult.score,
      targetCriterion: mutation.targetCriterion?.text,
    });

    scores.push({
      round,
      score: improved ? newScoreResult.score : bestScore,
      criterionPassRates: improved ? newScoreResult.criterionPassRates : latestScore.criterionPassRates,
      cost: newScoreResult.cost + (mutation.cost || 0),
      kept: improved,
    });

    printCriterionRates(
      improved ? newScoreResult.criterionPassRates : latestScore.criterionPassRates,
      target.criteria
    );
  }

  // Save results
  writeFileSync(resolve(outputDir, 'prompt-best.txt'), bestPrompt);
  writeFileSync(resolve(outputDir, 'scores.json'), JSON.stringify(scores, null, 2));
  writeFileSync(resolve(outputDir, 'changelog.json'), JSON.stringify(changelog, null, 2));

  const html = generateDashboard(target.name, scores, changelog, currentPrompt, bestPrompt);
  writeFileSync(resolve(outputDir, 'dashboard.html'), html);

  // Summary
  const baselineScore = Math.round((scores[0]?.score || 0) * 100);
  const finalScore = Math.round(bestScore * 100);
  console.log(`\n  =======================================`);
  console.log(`  DONE: ${baselineScore}% -> ${finalScore}% (+${finalScore - baselineScore}%)`);
  console.log(`  Rounds: ${scores.length - 1} | Cost: ~$${totalCost.toFixed(3)}`);
  console.log(`  Results: ${outputDir}`);
  console.log(`  Dashboard: ${resolve(outputDir, 'dashboard.html')}`);
  console.log(`  =======================================\n`);

  process.exit(0);
}

function printCriterionRates(rates, criteria) {
  if (!rates) return;
  for (const c of criteria) {
    const rate = rates[c.id] ?? 0;
    const icon = rate >= 1 ? ' PASS' : rate >= 0.5 ? ' PARTIAL' : ' FAIL';
    console.log(`        C${c.id}: ${Math.round(rate * 100)}%${icon}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
