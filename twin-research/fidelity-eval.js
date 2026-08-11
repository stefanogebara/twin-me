/**
 * TwinMe Fidelity Eval — flag-vs-baseline A/B against measured ground truth
 * =========================================================================
 * Phase 3 of product-truth-review 2026-08-09: fidelity is the eval harness.
 * A candidate context feature ships only if it moves measured twin_accuracy.
 *
 * Method:
 *   1. Load the user's latest fidelity wave (their REAL battery answers —
 *      the ground truth). Read-only: this script never writes a wave.
 *   2. For each config, have the twin answer the battery N times through the
 *      PRODUCTION answering function (answerBatteryAsTwin), so the eval
 *      measures exactly what shipping would ship:
 *        - baseline : production grounding as-is
 *        - spine    : production grounding + the temporal-spine block
 *                     (renderSpine — the same text chat injection would use)
 *   3. Score each trial against the wave's user_answers with the PRODUCTION
 *      scoring function (scoreAnswers). Report mean/min/max per config and
 *      per-item flips.
 *
 * LLM calls run at the battery's production temperature (0.3), so trials
 * vary; N >= 3 recommended. Results append to fidelity-results.tsv.
 *
 * Usage:
 *   node twin-research/fidelity-eval.js [--user-id UUID] [--trials N] [--configs baseline,spine]
 *
 * ── Verdict log ─────────────────────────────────────────────────────────────
 * 2026-08-11 spine vs baseline, wave 1, 5 trials/arm, cache-busted:
 *   baseline mean 0.8375 (n=4, one trial failed to parse)
 *   spine    mean 0.8025 (n=5, incl. one 0.4875 outlier and one half-battery)
 *   -> NO detectable effect; spine stays dark (does not ship). Caveats: spine
 *      coverage was 5/16 blocks (~1.1k chars), and this battery asks
 *      personality items — it does not exercise temporal recall, which is the
 *      spine's target failure. Re-adjudicate with temporal items in
 *      BATTERY_VERSION 2 before deleting the spine outright.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFileSync, existsSync, writeFileSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { supabaseAdmin } = await import('../api/services/database.js');
const { answerBatteryAsTwin, scoreAnswers } = await import('../api/services/fidelityBatteryService.js');
const { FIDELITY_BATTERY } = await import('../api/config/fidelityBattery.js');
const { renderSpine } = await import('../api/services/memoryTimelineService.js');
const { getTwinSummary } = await import('../api/services/twinSummaryService.js');

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DEFAULT_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d'; // stefanogebara@gmail.com
const userId = argValue('--user-id', process.env.TEST_TWIN_USER_ID || DEFAULT_USER);
const trials = Math.max(1, parseInt(argValue('--trials', '3'), 10));
const configNames = argValue('--configs', 'baseline,spine').split(',').map(s => s.trim());

// ─── Configs: name -> async () => extraContext|null ─────────────────────────
const CONFIGS = {
  baseline: async () => null,
  spine: async () => {
    const { data: prof } = await supabaseAdmin
      .from('users').select('timezone').eq('id', userId).maybeSingle();
    const spine = await renderSpine(userId, {
      supabase: supabaseAdmin,
      timeZone: prof?.timezone || undefined,
    });
    if (!spine.text) {
      throw new Error(
        `Spine rendered empty (blocks=${spine.blocks}, covered=${spine.covered}). ` +
        'Build timeline nodes first (buildPendingNodes) or the A arm equals the B arm.'
      );
    }
    console.log(`  spine: ${spine.covered}/${spine.blocks} blocks covered, ${spine.text.length} chars`);
    return spine.text;
  },
};

// ─── Ground truth ────────────────────────────────────────────────────────────
const { data: wave, error } = await supabaseAdmin
  .from('twin_fidelity_checks')
  .select('wave, user_answers, twin_accuracy, created_at')
  .eq('user_id', userId)
  .not('user_answers', 'is', null)
  .order('wave', { ascending: false })
  .limit(1)
  .maybeSingle();

if (error || !wave) {
  console.error('No fidelity wave with user_answers for this user — take the battery at /fidelity first.');
  process.exit(1);
}
console.log(`Ground truth: wave ${wave.wave} (${wave.created_at}), stored twin_accuracy=${wave.twin_accuracy}`);
console.log(`Configs: ${configNames.join(', ')} · trials per config: ${trials}\n`);

// Pre-warm the twin summary ONCE so every trial in every arm grounds on the
// same cached summary — run 1 showed a stale summary regenerating mid-run,
// giving one arm fresher grounding than the other (confound).
await getTwinSummary(userId);

// ─── Run ─────────────────────────────────────────────────────────────────────
const results = {}; // name -> { scores: number[], answersPerTrial: object[] }

for (const name of configNames) {
  if (!CONFIGS[name]) {
    console.error(`Unknown config "${name}" — known: ${Object.keys(CONFIGS).join(', ')}`);
    process.exit(1);
  }
  console.log(`── config: ${name} ──`);
  const extraContext = await CONFIGS[name]();
  const scores = [];
  const answersPerTrial = [];

  for (let t = 1; t <= trials; t++) {
    const started = Date.now();
    const result = await answerBatteryAsTwin(userId, { extraContext, skipLlmCache: true });
    if (!result?.answers) {
      console.log(`  trial ${t}: FAILED (no usable answers)`);
      continue;
    }
    const { overall, itemsScored } = scoreAnswers(FIDELITY_BATTERY, result.answers, wave.user_answers);
    scores.push(overall);
    answersPerTrial.push(result.answers);
    console.log(`  trial ${t}: accuracy=${overall?.toFixed(4)} (items=${itemsScored}, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  results[name] = { scores, answersPerTrial };
}

// ─── Report ──────────────────────────────────────────────────────────────────
const stats = (xs) => {
  if (!xs.length) return { mean: null, min: null, max: null };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean, min: Math.min(...xs), max: Math.max(...xs) };
};

console.log('\n=== RESULTS ===');
const summary = {};
for (const name of configNames) {
  const s = stats(results[name].scores);
  summary[name] = s;
  console.log(
    `${name.padEnd(10)} mean=${s.mean?.toFixed(4) ?? 'n/a'}  min=${s.min?.toFixed(4) ?? '-'}  max=${s.max?.toFixed(4) ?? '-'}  (n=${results[name].scores.length})`
  );
}

if (configNames.length === 2 && summary[configNames[0]].mean != null && summary[configNames[1]].mean != null) {
  const [a, b] = configNames;
  const delta = summary[b].mean - summary[a].mean;
  console.log(`\ndelta (${b} - ${a}): ${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`);

  // Per-item flips: items where the modal answer differs between configs.
  const modal = (answersList, itemId) => {
    const counts = {};
    for (const ans of answersList) {
      const v = String(ans[itemId]);
      counts[v] = (counts[v] || 0) + 1;
    }
    return Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0];
  };
  const flips = [];
  for (const item of FIDELITY_BATTERY) {
    const va = modal(results[a].answersPerTrial, item.id);
    const vb = modal(results[b].answersPerTrial, item.id);
    if (va !== undefined && vb !== undefined && va !== vb) {
      const truth = String(wave.user_answers[item.id]);
      flips.push(`  ${item.id}: ${va} -> ${vb} (truth: ${truth})`);
    }
  }
  if (flips.length) {
    console.log(`\nModal-answer flips (${flips.length}):`);
    console.log(flips.join('\n'));
  } else {
    console.log('\nNo modal-answer flips between configs.');
  }
}

// ─── Persist ────────────────────────────────────────────────────────────────
const TSV = join(__dirname, 'fidelity-results.tsv');
if (!existsSync(TSV)) {
  writeFileSync(TSV, 'timestamp\tuser_id\twave\tconfig\ttrials\tmean\tmin\tmax\tscores\n');
}
for (const name of configNames) {
  const s = summary[name];
  appendFileSync(
    TSV,
    [
      new Date().toISOString(), userId, wave.wave, name,
      results[name].scores.length,
      s.mean?.toFixed(4) ?? '', s.min?.toFixed(4) ?? '', s.max?.toFixed(4) ?? '',
      results[name].scores.map(x => x.toFixed(4)).join(','),
    ].join('\t') + '\n'
  );
}
console.log(`\nAppended to ${TSV}`);
process.exit(0);
