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
export async function answerBatteryAsTwin(userId) {
  let summary = '';
  let memories = [];
  try {
    [summary, memories] = await Promise.all([
      getTwinSummary(userId),
      retrieveDiverseMemories(
        userId,
        'personality values daily routines preferences social style stress coping decisions',
        { reflections: 12, facts: 10, platformData: 6, conversations: 6 },
        'identity'
      ),
    ]);
  } catch (err) {
    log.warn('Twin context fetch failed for fidelity battery', { userId, error: err.message });
  }

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

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system,
      messages: [{ role: 'user', content: `THE BATTERY:\n${formatBatteryForPrompt(FIDELITY_BATTERY)}` }],
      // R4 calibration: room for the per-item confidence map (was 900)
      maxTokens: 1200,
      temperature: 0.3,
      userId,
      serviceName: 'twin-fidelity-battery',
    });
    return parseTwinAnswers(result.content); // { answers, confidence } | null
  } catch (err) {
    log.warn('Twin battery answering failed', { userId, error: err.message });
    return null;
  }
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
 * Store one user wave: validate, have the twin answer, score both sides,
 * persist, and return the metrics. The wave is stored even when twin
 * answering fails (twin fields null) — the user's data is the scarce part.
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
  const selfConsistency = prior
    ? scoreAnswers(FIDELITY_BATTERY, userAnswers, prior.user_answers).overall
    : null;

  const twinResult = await answerBatteryAsTwin(userId);
  const twinAnswers = twinResult?.answers ?? null;
  const twinConfidence = twinResult?.confidence ?? null;
  const twinScore = twinAnswers ? scoreAnswers(FIDELITY_BATTERY, twinAnswers, userAnswers) : null;
  const twinAccuracy = twinScore ? twinScore.overall : null;
  const normalized = normalizedFidelity(twinAccuracy, selfConsistency);

  // R4 calibration: Brier + accuracy-by-confidence-bucket for this wave.
  const calibration = twinAnswers && twinConfidence
    ? calibrationFromPairs(batteryCalibrationPairs(FIDELITY_BATTERY, twinAnswers, twinConfidence, userAnswers))
    : null;

  const { data: created, error: insertError } = await supabaseAdmin
    .from('twin_fidelity_checks')
    .insert({
      user_id: userId,
      battery_version: BATTERY_VERSION,
      wave,
      user_answers: userAnswers,
      twin_answers: twinAnswers,
      twin_confidence: twinConfidence,
      calibration,
      twin_accuracy: twinAccuracy,
      self_consistency: selfConsistency,
      normalized_fidelity: normalized,
    })
    .select('id')
    .single();
  if (insertError || !created) {
    throw new Error(`Failed to store fidelity wave: ${insertError?.message || 'no row returned'}`);
  }

  log.info('Fidelity wave stored', { userId, wave, twinAccuracy, selfConsistency, brier: calibration?.brier ?? null });
  return {
    wave,
    twinAccuracy,
    selfConsistency,
    normalizedFidelity: normalized,
    likert: twinScore?.likert ?? null,
    categorical: twinScore?.categorical ?? null,
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
