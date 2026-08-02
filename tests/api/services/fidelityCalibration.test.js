/**
 * R4 calibration layer — accuracy-by-confidence-bucket + Brier
 * (Simile deep-dive .claude/plans/2026-08-01-simile-research R4: "feeds
 * R2 calibration"; GUM's finding that PROMPTED confidence is usably
 * calibrated is the bet being measured here).
 *
 * One pure core, two consumers:
 *  - battery waves: the twin now emits per-item confidence with its
 *    answers; each item yields (confidence, graded credit) pairs
 *  - chat turns: R2's evidence_confidence score vs thumbs feedback
 *    (outcome 1/0), joined via conversation + content because
 *    chat_message_feedback.message_id is client-generated
 *
 * Brier here is mean (confidence - credit)^2 over scored pairs — 0 is
 * perfect, 0.25 is what always-saying-0.5 earns.
 */
import { describe, it, expect } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const {
  calibrationFromPairs,
  batteryCalibrationPairs,
  CONFIDENCE_BUCKETS,
} = await import('../../../api/services/fidelityCalibration.js');
const { parseTwinAnswers } = await import('../../../api/services/fidelityBatteryService.js');

const BATTERY = [
  { id: 'l1', type: 'likert', text: 'x', scale: { min: 1, max: 5 } },
  { id: 'l2', type: 'likert', text: 'x', scale: { min: 1, max: 5 } },
  { id: 'c1', type: 'categorical', text: 'x', options: ['a', 'b', 'c'] },
];

describe('calibrationFromPairs — the shared pure core', () => {
  it('computes Brier as mean squared (confidence - credit)', () => {
    const result = calibrationFromPairs([
      { confidence: 1.0, credit: 1 },   // 0
      { confidence: 0.5, credit: 0 },   // 0.25
      { confidence: 0.8, credit: 1 },   // 0.04
    ]);
    expect(result.brier).toBeCloseTo((0 + 0.25 + 0.04) / 3, 5);
    expect(result.count).toBe(3);
  });

  it('buckets pairs and reports accuracy + mean confidence per bucket', () => {
    const result = calibrationFromPairs([
      { confidence: 0.9, credit: 1 },
      { confidence: 0.9, credit: 0 },
      { confidence: 0.3, credit: 0 },
    ]);
    expect(result.buckets.high.count).toBe(2);
    expect(result.buckets.high.accuracy).toBeCloseTo(0.5, 5);
    expect(result.buckets.high.meanConfidence).toBeCloseTo(0.9, 5);
    expect(result.buckets.low.count).toBe(1);
    expect(result.buckets.low.accuracy).toBe(0);
    expect(result.buckets.medium.count).toBe(0);
    expect(result.buckets.medium.accuracy).toBeNull();
  });

  it('drops invalid pairs and returns nulls when nothing is scorable', () => {
    const empty = calibrationFromPairs([
      { confidence: null, credit: 1 },
      { confidence: 0.5, credit: null },
      { confidence: 'high', credit: 1 },
    ]);
    expect(empty.count).toBe(0);
    expect(empty.brier).toBeNull();
  });

  it('bucket edges follow CONFIDENCE_BUCKETS thresholds', () => {
    const atMedium = calibrationFromPairs([{ confidence: CONFIDENCE_BUCKETS.medium, credit: 1 }]);
    expect(atMedium.buckets.medium.count).toBe(1);
    const atHigh = calibrationFromPairs([{ confidence: CONFIDENCE_BUCKETS.high, credit: 1 }]);
    expect(atHigh.buckets.high.count).toBe(1);
  });
});

describe('batteryCalibrationPairs — per-item (confidence, credit) extraction', () => {
  it('pairs twin confidence with graded credit against user answers', () => {
    const pairs = batteryCalibrationPairs(
      BATTERY,
      { l1: 5, l2: 3, c1: 'a' },          // twin answers
      { l1: 0.9, l2: 0.4, c1: 0.7 },      // twin confidence
      { l1: 5, l2: 1, c1: 'b' }           // user answers
    );
    // l1: credit 1, conf 0.9; l2: credit 1-2/4=0.5, conf 0.4; c1: credit 0, conf 0.7
    expect(pairs).toHaveLength(3);
    expect(pairs.find(p => p.itemId === 'l1')).toMatchObject({ confidence: 0.9, credit: 1 });
    expect(pairs.find(p => p.itemId === 'l2').credit).toBeCloseTo(0.5, 5);
    expect(pairs.find(p => p.itemId === 'c1').credit).toBe(0);
  });

  it('skips items missing an answer or a confidence value', () => {
    const pairs = batteryCalibrationPairs(
      BATTERY,
      { l1: 5, c1: 'a' },
      { l1: 0.9 },              // no confidence for c1
      { l1: 4, l2: 2, c1: 'a' }
    );
    expect(pairs.map(p => p.itemId)).toEqual(['l1']);
  });

  it('tolerates null confidence maps entirely (legacy twin answers)', () => {
    expect(batteryCalibrationPairs(BATTERY, { l1: 5 }, null, { l1: 5 })).toEqual([]);
  });
});

describe('parseTwinAnswers — extended with per-item confidence', () => {
  it('returns answers plus a confidence map when present', () => {
    const parsed = parseTwinAnswers(
      '{"answers": {"l1": 5, "c1": "a"}, "confidence": {"l1": 0.85, "c1": 1.4}}'
    );
    expect(parsed.answers).toEqual({ l1: 5, c1: 'a' });
    expect(parsed.confidence.l1).toBeCloseTo(0.85, 5);
    expect(parsed.confidence.c1).toBe(1); // clamped into [0,1]
  });

  it('returns null confidence when the block is absent (back-compat)', () => {
    const parsed = parseTwinAnswers('{"answers": {"l1": 4}}');
    expect(parsed.answers).toEqual({ l1: 4 });
    expect(parsed.confidence).toBeNull();
  });

  it('still returns null overall for unusable content', () => {
    expect(parseTwinAnswers('garbage')).toBeNull();
    expect(parseTwinAnswers('{"confidence": {"l1": 1}}')).toBeNull();
  });
});
