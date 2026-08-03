/**
 * Fidelity Battery Service (R4 — test-retest normalized evaluation)
 * ==================================================================
 * The second of TwinMe's two fidelity methods:
 *
 *  - twinFidelityService.js  — behavioral probes from past conversations
 *    (embedding similarity; method 'behavioral_probe'). No human ceiling.
 *  - THIS module              — fixed 20-item battery answered by the user
 *    in waves AND by the twin from memory; twin accuracy is normalized by
 *    the user's own wave-to-wave consistency. The Park et al. 2024
 *    measurement design: fidelity has an honest human ceiling.
 *
 *   normalized fidelity = twin accuracy ÷ user self-consistency
 *
 * Scoring per the paper: Likert = 1 - |diff| / range (partial credit),
 * categorical = exact match. Missing answers are excluded, not zeroed.
 * Waves live in twin_fidelity_checks; wave 1 has no ceiling — the
 * normalized metric appears from wave 2 on.
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { FIDELITY_BATTERY, BATTERY_VERSION } from '../config/fidelityBattery.js';
import { supabaseAdmin } from './database.js';
import { retrieveDiverseMemories } from './memoryStreamService.js';
import { getTwinSummary } from './twinSummaryService.js';
// Call-time-only circular import (fidelityCalibration imports scoreItem
// back from this module) — safe in ESM, both uses are inside functions.
import { calibrationFromPairs, batteryCalibrationPairs } from './fidelityCalibration.js';
import { createLogger } from './logger.js';

const log = createLogger('FidelityBattery');

// ====================================================================
// Scoring (pure)
// ====================================================================

/**
 * Score one item between two answer sets. Returns 1..0 credit, or null
 * when either side is missing/invalid (excluded from averages).
 */
export function scoreItem(item, answerA, answerB) {
  if (answerA === undefined || answerA === null) return null;
  if (answerB === undefined || answerB === null) return null;

  if (item.type === 'likert') {
    const a = Number(answerA);
    const b = Number(answerB);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const range = item.scale.max - item.scale.min;
    return 1 - Math.min(range, Math.abs(a - b)) / range;
  }
  return answerA === answerB ? 1 : 0;
}

/**
 * Score two full answer sets over the battery.
 * Returns { overall, likert, categorical, itemsScored }.
 */
export function scoreAnswers(battery, answersA, answersB) {
  const byType = { likert: [], categorical: [] };
  for (const item of battery) {
    const credit = scoreItem(item, answersA?.[item.id], answersB?.[item.id]);
    if (credit !== null) byType[item.type].push(credit);
  }
  const avg = arr => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const all = [...byType.likert, ...byType.categorical];
  return {
    overall: avg(all),
    likert: avg(byType.likert),
    categorical: avg(byType.categorical),
    itemsScored: all.length,
  };
}

/**
 * The paper's headline metric: twin accuracy divided by the user's own
 * test-retest consistency. Null when the ceiling is unavailable or zero.
 */
export function normalizedFidelity(twinAccuracy, selfConsistency) {
  if (twinAccuracy === null || twinAccuracy === undefined) return null;
  if (!selfConsistency || selfConsistency <= 0) return null;
  return twinAccuracy / selfConsistency;
}

// ====================================================================
// Twin answering (LLM)
// ====================================================================

/**
 * Per-fetch budget for battery context. Generous against the healthy path
 * (summary + retrieval measure 5-8s together) while cutting off the
 * pathological cold path well inside Vercel's 60s function ceiling.
 */
const CONTEXT_BUDGET_MS = 12000;

/**
 * Race a context fetch against a budget, degrading to `fallback` on
 * timeout OR rejection. The losing promise is left pending — it cannot be
 * cancelled, but it no longer blocks the response.
 */
function withBudget(start, ms, fallback, label, userId) {
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      log.warn('Battery context fetch exceeded budget — degrading', { userId, label, ms });
      resolve(fallback);
    }, ms);
  });
  let promise;
  try {
    promise = Promise.resolve(start());
  } catch (err) {
    clearTimeout(timer);
    log.warn('Battery context fetch threw synchronously', { userId, label, error: err?.message });
    return Promise.resolve(fallback);
  }
  return Promise.race([
    promise.then(
      value => { clearTimeout(timer); return value ?? fallback; },
      err => {
        clearTimeout(timer);
        log.warn('Battery context fetch failed — degrading', { userId, label, error: err?.message });
        return fallback;
      }
    ),
    timeout,
  ]);
}

/**
 * Parse the twin's battery reply into { answers, confidence } — R4
 * calibration extension. `confidence` is a per-item 0-1 map (clamped) or
 * null when absent (legacy replies). Returns null overall when there are
 * no usable answers.
 */
export function parseTwinAnswers(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return null;
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const answers = parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : null;
    if (!answers || Object.keys(answers).length === 0) return null;

    let confidence = null;
    if (parsed.confidence && typeof parsed.confidence === 'object') {
      confidence = {};
      for (const [itemId, value] of Object.entries(parsed.confidence)) {
        const n = Number(value);
        if (Number.isFinite(n)) confidence[itemId] = Math.max(0, Math.min(1, n));
      }
      if (Object.keys(confidence).length === 0) confidence = null;
    }

    return { answers, confidence };
  } catch (err) {
    log.warn('Twin answers parse failed', { preview: rawContent.substring(0, 120), error: err.message });
    return null;
  }
}

function formatBatteryForPrompt(battery) {
  return battery
    .map(item => {
      if (item.type === 'likert') {
        return `- ${item.id} (answer 1-5, 1=disagree strongly, 5=agree strongly): "${item.text}"`;
      }
      return `- ${item.id} (answer with EXACTLY one option string): "${item.text}" Options: ${item.options.map(o => `"${o}"`).join(' | ')}`;
    })
    .join('\n');
}

/**
 * Have the twin answer the full battery in ONE ANALYSIS call, grounded in
 * the twin summary + identity-weighted memory retrieval, using the 4-step
 * CoT scaffold from the 1,000-people paper (interpret options -> weigh ->
 * reason -> answer with system-1 instinct).
 *
 * Returns { itemId: answer } or null on failure.
 */
export async function answerBatteryAsTwin(userId, { contextBudgetMs = CONTEXT_BUDGET_MS } = {}) {
  // Cold-path guard. getTwinSummary does a SYNCHRONOUS full regeneration
  // (5 retrieval queries + an LLM call) once the cached summary ages past
  // its stale-serve window — that, plus cold retrieval, is what took the
  // wave-1 submission to 79s and a 504 against Vercel's 60s ceiling.
  // Neither fetch may hold the battery hostage: each races its own budget
  // and degrades to the prompt's existing "Limited ..." fallback. Budgeted
  // independently so a slow summary doesn't cost us real evidence.
  const [summary, memories] = await Promise.all([
    withBudget(
      () => getTwinSummary(userId),
      contextBudgetMs, '', 'twin summary', userId
    ),
    withBudget(
      () => retrieveDiverseMemories(
        userId,
        'personality values daily routines preferences social style stress coping decisions',
        { reflections: 12, facts: 10, platformData: 6, conversations: 6 },
        'identity'
      ),
      contextBudgetMs, [], 'memory retrieval', userId
    ),
  ]);

  const memoryLines = (memories || [])
    .map(m => `- ${(m.content || '').substring(0, 200)}`)
    .join('\n');

  const system = `You are this person's digital twin, answering a personality and behavior battery EXACTLY as they would answer it about themselves.

WHO THEY ARE (twin summary):
${summary || 'Limited summary available.'}

EVIDENCE FROM THEIR MEMORY STREAM:
${memoryLines || 'Limited evidence available.'}

METHOD — for each item, silently follow four steps:
1. Option Interpretation: what kind of person each answer describes.
2. Option Choice: which answers the evidence supports for THIS person.
3. Reasoning: pick the single answer that best predicts their response.
4. Response: commit. Ultimately, DON'T overthink it — use system 1 (fast, intuitive) thinking about who they are.

Answer every item. Likert items: an integer 1-5. Categorical items: copy ONE option string exactly.

5. Confidence: for each item, also estimate 0.0-1.0 how confident you are that this is what THEY would actually answer. 0.9+ only when direct evidence supports it; 0.5 means an informed guess; be honest — calibration is measured against their real answers.

Return ONLY this JSON:
{ "answers": { "<item_id>": <value>, ... }, "confidence": { "<item_id>": <0.0-1.0>, ... } }`;

  // Latency: one 20-item call emitting answers + per-item confidence ran
  // ~1200 output tokens and measured 35s warm / 79s cold — over Vercel's
  // 60s maxDuration, so cold submissions 504'd. Two parallel half-batteries
  // roughly halve wall-clock at identical total token cost. Both halves
  // carry the same grounding, so neither is answering blind.
  const half = Math.ceil(FIDELITY_BATTERY.length / 2);
  const chunks = [FIDELITY_BATTERY.slice(0, half), FIDELITY_BATTERY.slice(half)];

  const settled = await Promise.allSettled(
    chunks.map((chunk, i) =>
      complete({
        tier: TIER_ANALYSIS,
        system,
        messages: [{ role: 'user', content: `THE BATTERY:\n${formatBatteryForPrompt(chunk)}` }],
        maxTokens: 700,
        temperature: 0.3,
        userId,
        serviceName: `twin-fidelity-battery-${i + 1}`,
      })
    )
  );

  // Merge halves. A failed or unparseable half is dropped, not fatal —
  // scoreAnswers excludes missing items rather than zeroing them, so a
  // partial battery still yields an honest (smaller-n) wave.
  const answers = {};
  const confidence = {};
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === 'rejected') {
      log.warn('Twin battery half failed', { userId, half: i + 1, error: outcome.reason?.message });
      continue;
    }
    const parsed = parseTwinAnswers(outcome.value?.content);
    if (!parsed) {
      log.warn('Twin battery half unparseable', { userId, half: i + 1 });
      continue;
    }
    Object.assign(answers, parsed.answers);
    if (parsed.confidence) Object.assign(confidence, parsed.confidence);
  }

  if (Object.keys(answers).length === 0) {
    log.warn('Twin battery answering failed — no usable halves', { userId });
    return null;
  }
  if (Object.keys(answers).length < FIDELITY_BATTERY.length) {
    log.warn('Twin battery partially answered', {
      userId, answered: Object.keys(answers).length, total: FIDELITY_BATTERY.length,
    });
  }
  return { answers, confidence: Object.keys(confidence).length > 0 ? confidence : null };
}

// ====================================================================
// Wave submission
// ====================================================================

function validateSubmission(answers) {
  const missing = [];
  for (const item of FIDELITY_BATTERY) {
    const value = answers?.[item.id];
    if (item.type === 'likert') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < item.scale.min || n > item.scale.max) missing.push(item.id);
    } else if (!item.options.includes(value)) {
      missing.push(item.id);
    }
  }
  return missing;
}

/**
 * PHASE 1 — store the user's wave. Fast and LLM-free by design: two DB
 * reads plus one insert.
 *
 * The user's 20 answers are the scarce, irreplaceable input; the twin's
 * are reproducible at any time. Answering the battery inline used to put
 * a variable-latency LLM call between the user pressing submit and their
 * answers being durable, so a timeout lost the whole submission and they
 * had to re-answer. Storing first makes that impossible. Twin answering
 * is phase 2 (completeFidelityWave), retryable against this row.
 *
 * Returns { id, wave, selfConsistency, twinStatus: 'pending' }.
 */
export async function submitFidelityWave(userId, userAnswers) {
  const missing = validateSubmission(userAnswers);
  if (missing.length > 0) {
    throw new Error(`Incomplete battery: missing or invalid answers for ${missing.length} items`);
  }

  const { data: priorWaves, error: priorError } = await supabaseAdmin
    .from('twin_fidelity_checks')
    .select('wave, user_answers')
    .eq('user_id', userId)
    .eq('battery_version', BATTERY_VERSION)
    .order('wave', { ascending: false })
    .limit(1);
  if (priorError) {
    log.warn('Prior wave lookup failed', { userId, error: priorError.message });
  }
  const prior = Array.isArray(priorWaves) ? priorWaves[0] : null;
  const wave = (prior?.wave || 0) + 1;

  // Self-consistency ceiling: this wave's answers vs the previous wave's.
  // Computed here because it depends only on user data, and storing it
  // lets phase 2 derive the normalized metric without re-reading history.
  const selfConsistency = prior
    ? scoreAnswers(FIDELITY_BATTERY, userAnswers, prior.user_answers).overall
    : null;

  const { data: created, error: insertError } = await supabaseAdmin
    .from('twin_fidelity_checks')
    .insert({
      user_id: userId,
      battery_version: BATTERY_VERSION,
      wave,
      user_answers: userAnswers,
      self_consistency: selfConsistency,
    })
    .select('id')
    .single();
  if (insertError || !created) {
    throw new Error(`Failed to store fidelity wave: ${insertError?.message || 'no row returned'}`);
  }

  log.info('Fidelity wave stored (phase 1)', { userId, wave, selfConsistency });
  return { id: created.id, wave, selfConsistency, twinStatus: 'pending' };
}

/**
 * PHASE 2 — have the twin answer a stored wave, score it, and update the
 * row. Slow (variable-latency LLM) but safe: the user's answers are
 * already durable, so this is freely retryable and idempotent.
 *
 * Returns null when the wave doesn't exist or isn't this user's (404).
 * On answering failure it returns twinStatus 'pending' and writes
 * nothing, leaving the wave retryable.
 */
export async function completeFidelityWave(userId, waveId) {
  const { data: row, error: loadError } = await supabaseAdmin
    .from('twin_fidelity_checks')
    .select('id, user_id, wave, user_answers, twin_answers, twin_accuracy, self_consistency, normalized_fidelity, calibration')
    .eq('id', waveId)
    .eq('user_id', userId)
    .maybeSingle();
  if (loadError) {
    log.warn('Fidelity wave load failed', { userId, waveId, error: loadError.message });
  }
  if (!row) return null;

  // Idempotent: an already-answered wave is returned as-is, never re-billed.
  if (row.twin_answers) {
    return {
      id: row.id,
      wave: row.wave,
      twinStatus: 'complete',
      twinAccuracy: row.twin_accuracy,
      selfConsistency: row.self_consistency,
      normalizedFidelity: row.normalized_fidelity,
      calibration: row.calibration ?? null,
    };
  }

  const twinResult = await answerBatteryAsTwin(userId);
  const twinAnswers = twinResult?.answers ?? null;
  const twinConfidence = twinResult?.confidence ?? null;
  if (!twinAnswers) {
    log.warn('Twin answering failed — wave left pending and retryable', { userId, waveId });
    return {
      id: row.id,
      wave: row.wave,
      twinStatus: 'pending',
      twinAccuracy: null,
      selfConsistency: row.self_consistency,
      normalizedFidelity: null,
      calibration: null,
    };
  }

  const twinScore = scoreAnswers(FIDELITY_BATTERY, twinAnswers, row.user_answers);
  const twinAccuracy = twinScore.overall;
  const normalized = normalizedFidelity(twinAccuracy, row.self_consistency);

  // R4 calibration: Brier + accuracy-by-confidence-bucket for this wave.
  const calibration = twinConfidence
    ? calibrationFromPairs(
        batteryCalibrationPairs(FIDELITY_BATTERY, twinAnswers, twinConfidence, row.user_answers)
      )
    : null;

  const { error: updateError } = await supabaseAdmin
    .from('twin_fidelity_checks')
    .update({
      twin_answers: twinAnswers,
      twin_confidence: twinConfidence,
      calibration,
      twin_accuracy: twinAccuracy,
      normalized_fidelity: normalized,
    })
    .eq('id', row.id);
  if (updateError) {
    log.warn('Fidelity wave update failed (metrics returned anyway)', { userId, waveId, error: updateError.message });
  }

  log.info('Fidelity wave completed (phase 2)', {
    userId, wave: row.wave, twinAccuracy, brier: calibration?.brier ?? null,
  });
  return {
    id: row.id,
    wave: row.wave,
    twinStatus: 'complete',
    twinAccuracy,
    selfConsistency: row.self_consistency,
    normalizedFidelity: normalized,
    likert: twinScore.likert,
    categorical: twinScore.categorical,
    calibration,
  };
}

/**
 * All waves for a user (for the results view), newest first.
 */
export async function getFidelityResults(userId) {
  const { data, error } = await supabaseAdmin
    .from('twin_fidelity_checks')
    .select('wave, battery_version, twin_accuracy, self_consistency, normalized_fidelity, calibration, created_at')
    .eq('user_id', userId)
    .order('wave', { ascending: false });
  if (error) {
    log.warn('Fidelity results fetch failed', { userId, error: error.message });
    return [];
  }
  return data || [];
}
