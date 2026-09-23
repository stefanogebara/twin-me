/**
 * Fidelity Calibration (R4 — accuracy-by-confidence-bucket + Brier)
 * ==================================================================
 * One pure calibration core, two consumers:
 *
 *  - BATTERY: the twin emits per-item confidence with its battery answers
 *    (GUM's prompted-confidence bet); each scored item yields a
 *    (confidence, graded credit) pair.
 *  - CHAT (closes the R2 loop): every assistant message stores
 *    metadata.evidence_confidence; thumbs feedback provides the outcome.
 *    chat_message_feedback.message_id is client-generated and does NOT
 *    join twin_messages.id, so pairs join via conversation_id + content.
 *
 * Brier = mean (confidence - credit)^2 over scorable pairs. 0 is perfect;
 * 0.25 is what always answering 0.5 earns. Bucket accuracies vs mean
 * confidence show the direction of miscalibration (GUM's own reporting).
 */

import { supabaseAdmin } from './database.js';
import { scoreItem } from './fidelityBatteryService.js';
import { createLogger } from './logger.js';

const log = createLogger('FidelityCalibration');

/** Bucket lower bounds: >= high => 'high', >= medium => 'medium', else 'low'. */
export const CONFIDENCE_BUCKETS = { medium: 0.5, high: 0.75 };

function bucketOf(confidence) {
  if (confidence >= CONFIDENCE_BUCKETS.high) return 'high';
  if (confidence >= CONFIDENCE_BUCKETS.medium) return 'medium';
  return 'low';
}

/**
 * The shared pure core. pairs: [{ confidence: 0-1, credit: 0-1, ... }].
 * Invalid pairs are dropped. Returns { count, brier, buckets } where each
 * bucket is { count, accuracy, meanConfidence } (nulls when empty).
 */
export function calibrationFromPairs(pairs) {
  const valid = (pairs || []).filter(
    p =>
      typeof p?.confidence === 'number' && Number.isFinite(p.confidence) &&
      typeof p?.credit === 'number' && Number.isFinite(p.credit)
  );

  const emptyBucket = () => ({ count: 0, accuracy: null, meanConfidence: null });
  const buckets = { low: emptyBucket(), medium: emptyBucket(), high: emptyBucket() };
  if (valid.length === 0) {
    return { count: 0, brier: null, buckets };
  }

  const sums = { low: { credit: 0, conf: 0 }, medium: { credit: 0, conf: 0 }, high: { credit: 0, conf: 0 } };
  let brierSum = 0;
  for (const pair of valid) {
    brierSum += (pair.confidence - pair.credit) ** 2;
    const bucket = bucketOf(pair.confidence);
    buckets[bucket].count += 1;
    sums[bucket].credit += pair.credit;
    sums[bucket].conf += pair.confidence;
  }
  for (const name of ['low', 'medium', 'high']) {
    if (buckets[name].count > 0) {
      buckets[name].accuracy = sums[name].credit / buckets[name].count;
      buckets[name].meanConfidence = sums[name].conf / buckets[name].count;
    }
  }

  return {
    count: valid.length,
    brier: brierSum / valid.length,
    buckets,
  };
}

/**
 * Battery consumer: pair the twin's per-item confidence with the graded
 * credit its answer earned against the user's answers. Items missing an
 * answer, a confidence value, or a scorable user answer are skipped.
 */
export function batteryCalibrationPairs(battery, twinAnswers, twinConfidence, userAnswers) {
  if (!twinConfidence || typeof twinConfidence !== 'object') return [];
  const pairs = [];
  for (const item of battery) {
    const confidence = twinConfidence[item.id];
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) continue;
    const credit = scoreItem(item, twinAnswers?.[item.id], userAnswers?.[item.id]);
    if (credit === null) continue;
    pairs.push({ itemId: item.id, confidence, credit });
  }
  return pairs;
}

/**
 * Chat consumer (R2 loop): evidence_confidence scores vs thumbs outcomes.
 * Join path: feedback rows carry conversation_id + the rated message
 * content; assistant twin_messages rows in those conversations carry
 * metadata.evidence_confidence. Content-prefix match pairs them.
 */
export async function computeChatCalibration(userId, { limit = 300 } = {}) {
  try {
    const { data: feedback, error: fbError } = await supabaseAdmin
      .from('chat_message_feedback')
      .select('conversation_id, rating, message_content')
      .eq('user_id', userId)
      .not('conversation_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fbError || !feedback || feedback.length === 0) {
      if (fbError) log.warn('Chat calibration feedback fetch failed', { userId, error: fbError.message });
      return { ...calibrationFromPairs([]), pairsJoined: 0, feedbackRows: feedback?.length || 0 };
    }

    const conversationIds = [...new Set(feedback.map(f => f.conversation_id))];
    const { data: messages, error: msgError } = await supabaseAdmin
      .from('twin_messages')
      .select('conversation_id, content, metadata')
      .in('conversation_id', conversationIds)
      .eq('role', 'assistant')
      .not('metadata->evidence_confidence', 'is', null);
    if (msgError || !messages) {
      if (msgError) log.warn('Chat calibration messages fetch failed', { userId, error: msgError.message });
      return { ...calibrationFromPairs([]), pairsJoined: 0, feedbackRows: feedback.length };
    }

    const pairs = [];
    for (const fb of feedback) {
      const match = messages.find(
        m =>
          m.conversation_id === fb.conversation_id &&
          typeof m.content === 'string' &&
          typeof fb.message_content === 'string' &&
          m.content.substring(0, 500) === fb.message_content.substring(0, 500)
      );
      const score = match?.metadata?.evidence_confidence?.score;
      if (typeof score !== 'number') continue;
      pairs.push({ confidence: score, credit: fb.rating === 1 ? 1 : 0 });
    }

    return { ...calibrationFromPairs(pairs), pairsJoined: pairs.length, feedbackRows: feedback.length };
  } catch (err) {
    log.warn('Chat calibration failed (non-fatal)', { userId, error: err?.message });
    return { ...calibrationFromPairs([]), pairsJoined: 0, feedbackRows: 0 };
  }
}
