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
 *      measures exactly what shipping would ship. `baseline` is production
 *      grounding as-is; each candidate config returns the extra context
 *      block its feature would inject (see CONFIGS below).
 *   3. Score each trial against the wave's user_answers with the PRODUCTION
 *      scoring function (scoreAnswers). Report mean/min/max per config and
 *      per-item flips.
 *
 * LLM calls run at the battery's production temperature (0.3), so trials
 * vary; N >= 3 recommended. Results append to fidelity-results.tsv.
 *
 * Usage:
 *   node twin-research/fidelity-eval.js [--user-id UUID] [--trials N] [--configs baseline,candidate]
 *
 * ── Verdict log ─────────────────────────────────────────────────────────────
 * 2026-08-11 spine vs baseline, wave 1, 5 trials/arm, cache-busted:
 *   baseline mean 0.8375 (n=4, one trial failed to parse)
 *   spine    mean 0.8025 (n=5, incl. one 0.4875 outlier and one half-battery)
 *   -> NO detectable effect. VERDICT (founder call, 2026-08-11): DELETED —
 *      per the ship-only-if-it-moves-the-score rule. The spine stack
 *      (memoryTimelineService, its ingestion build, prompt injection, the
 *      'spine' config that used to live in CONFIGS below) is one revert away
 *      if a temporal-item battery (v2) later shows measurable value.
 *      memory_timeline_nodes table data retained.
 *
 * 2026-08-11 BATTERY_VERSION 2 shipped (5 temporal-recall items, `temporal:
 * true`) — the harness now reports a temporal-subset section so temporal
 * features can be adjudicated fairly. Validation run, baseline only,
 * 5 trials against the v1 wave: mean 0.8467 min 0.8250 max 0.8750 on the
 * 20 shared items (consistent with prior runs; temporal items carry no
 * truth in a v1 wave and the script warns accordingly).
 *   -> VERDICT: temporal adjudication PENDING a fresh v2 wave. The spine
 *      re-trial the 2026-08-11 entry asked for is now gated on:
 *      (1) the user takes a v2 wave at /fidelity (only source of temporal
 *          ground truth — never synthesize user_answers),
 *      (2) revert a8b3314e to restore renderSpine + a 'spine' config here,
 *      (3) rerun baseline,spine and let the temporal subset decide.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFileSync, existsSync, writeFileSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { supabaseAdmin } = await import('../api/services/database.js');
const { answerBatteryAsTwin, scoreAnswers } = await import('../api/services/fidelityBatteryService.js');
const { FIDELITY_BATTERY, BATTERY_VERSION } = await import('../api/config/fidelityBattery.js');
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
const configNames = argValue('--configs', 'baseline').split(',').map(s => s.trim());

// ─── Configs: name -> async () => extraContext|null ─────────────────────────
// Add a config per candidate feature: return the context block the feature
// would inject into the twin's grounding, or throw if its inputs are absent.
// (The 'spine' config was removed with the temporal spine — see verdict log.)
const CONFIGS = {
  baseline: async () => null,
};

// ─── Ground truth ────────────────────────────────────────────────────────────
// Latest wave regardless of battery_version (order by recency, not wave —
// wave numbering restarts per version), but report the version: a wave
// older than BATTERY_VERSION carries no ground truth for items added since.
const { data: wave, error } = await supabaseAdmin
  .from('twin_fidelity_checks')
  .select('wave, battery_version, user_answers, twin_accuracy, created_at')
  .eq('user_id', userId)
  .not('user_answers', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (error || !wave) {
  console.error('No fidelity wave with user_answers for this user — take the battery at /fidelity first.');
  process.exit(1);
}
console.log(`Ground truth: v${wave.battery_version} wave ${wave.wave} (${wave.created_at}), stored twin_accuracy=${wave.twin_accuracy}`);
const TEMPORAL_ITEMS = FIDELITY_BATTERY.filter(i => i.temporal);
const temporalTruthCount = TEMPORAL_ITEMS.filter(i => wave.user_answers[i.id] !== undefined).length;
if (wave.battery_version < BATTERY_VERSION) {
  console.warn(
    `WARNING: ground truth is a v${wave.battery_version} wave but the battery is v${BATTERY_VERSION} — ` +
    `${temporalTruthCount}/${TEMPORAL_ITEMS.length} temporal items have user truth. ` +
    'Temporal accuracy cannot be adjudicated until a fresh wave is taken at /fidelity.'
  );
}
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

/** Most frequent answer to an item across trials, or undefined when absent. */
const modal = (answersList, itemId) => {
  const counts = {};
  for (const ans of answersList) {
    if (ans[itemId] === undefined) continue;
    const v = String(ans[itemId]);
    counts[v] = (counts[v] || 0) + 1;
  }
  return Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0];
};

// ─── Temporal subset (battery v2) ───────────────────────────────────────────
// The reason v2 exists: temporal features (the spine) can only surface on
// the last-two-weeks items. Report subset accuracy when the wave carries
// truth for them, and per-item modal answers regardless — arm-to-arm flips
// here show whether the candidate context changes temporal answers at all.
if (TEMPORAL_ITEMS.length > 0) {
  console.log('\n=== TEMPORAL SUBSET (last-two-weeks items) ===');
  for (const name of configNames) {
    const subsetScores = results[name].answersPerTrial
      .map(ans => scoreAnswers(TEMPORAL_ITEMS, ans, wave.user_answers).overall)
      .filter(v => v !== null);
    const s = stats(subsetScores);
    console.log(`${name.padEnd(10)} mean=${s.mean?.toFixed(4) ?? 'n/a (no truth)'}  (n=${subsetScores.length})`);
  }
  console.log('\nPer-item modal answers:');
  for (const item of TEMPORAL_ITEMS) {
    const truth = wave.user_answers[item.id] !== undefined
      ? String(wave.user_answers[item.id])
      : `— (no truth: v${wave.battery_version} wave)`;
    console.log(`  ${item.id}`);
    for (const name of configNames) {
      console.log(`    ${name.padEnd(10)} ${modal(results[name].answersPerTrial, item.id) ?? '—'}`);
    }
    console.log(`    ${'truth'.padEnd(10)} ${truth}`);
  }
}

if (configNames.length === 2 && summary[configNames[0]].mean != null && summary[configNames[1]].mean != null) {
  const [a, b] = configNames;
  const delta = summary[b].mean - summary[a].mean;
  console.log(`\ndelta (${b} - ${a}): ${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`);

  // Per-item flips: items where the modal answer differs between configs.
  const flips = [];
  for (const item of FIDELITY_BATTERY) {
    const va = modal(results[a].answersPerTrial, item.id);
    const vb = modal(results[b].answersPerTrial, item.id);
    if (va !== undefined && vb !== undefined && va !== vb) {
      const truth = wave.user_answers[item.id] !== undefined ? String(wave.user_answers[item.id]) : '—';
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
  writeFileSync(TSV, 'timestamp\tuser_id\tbattery_version\twave\tconfig\ttrials\tmean\tmin\tmax\tscores\n');
}
for (const name of configNames) {
  const s = summary[name];
  appendFileSync(
    TSV,
    [
      new Date().toISOString(), userId, wave.battery_version, wave.wave, name,
      results[name].scores.length,
      s.mean?.toFixed(4) ?? '', s.min?.toFixed(4) ?? '', s.max?.toFixed(4) ?? '',
      results[name].scores.map(x => x.toFixed(4)).join(','),
    ].join('\t') + '\n'
  );
}
console.log(`\nAppended to ${TSV}`);
process.exit(0);
