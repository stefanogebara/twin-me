/**
 * R2 — twin evidence confidence (Simile deep-dive
 * .claude/plans/2026-08-01-simile-research R2: evidence-density honesty).
 *
 * computeEvidenceConfidence scores the evidence actually injected into a
 * chat turn (memoriesInContext) on four signals: volume (diminishing
 * returns), quality (per-memory confidence x importance), source
 * diversity, and recency — where "fresh" reuses R5a's per-memory
 * decay_rate stability window. Low composite => a hedging instruction is
 * prefixed to the additional context so the twin says "I don't have
 * enough signal" instead of fabricating.
 *
 * Deliberately named evidenceConfidence: the chat route already carries
 * six unrelated `confidence` fields (neuropil, expert routing, task
 * intent, neurotransmitter, personality, per-memory).
 */
import { describe, it, expect } from 'vitest';

process.env.NODE_ENV = 'test';

const {
  computeEvidenceConfidence,
  buildEvidenceHedgeBlock,
  EVIDENCE_LEVELS,
} = await import('../../../api/services/evidenceConfidenceService.js');
const { buildAdditionalContext } = await import(
  '../../../api/services/twinAdditionalContext.js'
);

const NOW = new Date('2026-08-02T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

/** Strong evidence item: fresh, confident, important, distinct sources via overrides. */
const mem = (overrides = {}) => ({
  id: Math.random().toString(36).slice(2),
  content: 'They train jiu jitsu three times a week.',
  memory_type: 'fact',
  created_at: ago(2),
  confidence: 0.9,
  importance_score: 8,
  retrieval_count: 3,
  decay_rate: 30,
  metadata: { source: 'life_story' },
  ...overrides,
});

describe('computeEvidenceConfidence — composite scoring', () => {
  it('returns zero-confidence low for empty or missing evidence', () => {
    for (const input of [[], null, undefined]) {
      const result = computeEvidenceConfidence(input, { now: NOW });
      expect(result.level).toBe('low');
      expect(result.score).toBe(0);
      expect(result.signals.count).toBe(0);
    }
  });

  it('scores a rich, diverse, fresh evidence set as high', () => {
    const memories = [
      mem({ metadata: { platform: 'spotify' }, memory_type: 'platform_data', decay_rate: 7, created_at: ago(1) }),
      mem({ metadata: { platform: 'whoop' }, memory_type: 'platform_data', decay_rate: 7, created_at: ago(2) }),
      mem({ metadata: { source: 'life_story' } }),
      mem({ memory_type: 'reflection', decay_rate: 90, created_at: ago(10), metadata: {} }),
      mem({ metadata: { platform: 'github' }, memory_type: 'platform_data', decay_rate: 7, created_at: ago(3) }),
      mem({ memory_type: 'fact', metadata: { source: 'gdpr_import' } }),
      mem(),
      mem(),
    ];
    const result = computeEvidenceConfidence(memories, { now: NOW });
    expect(result.level).toBe('high');
    expect(result.score).toBeGreaterThanOrEqual(0.6);
    expect(result.signals.count).toBe(8);
    expect(result.signals.diversity).toBe(1); // >= 3 distinct source buckets
  });

  it('scores a single stale low-importance memory as low', () => {
    const memories = [
      mem({
        created_at: ago(120),
        decay_rate: 7,
        confidence: 0.4,
        importance_score: 3,
        retrieval_count: 0,
        metadata: {},
        memory_type: 'platform_data',
      }),
    ];
    const result = computeEvidenceConfidence(memories, { now: NOW });
    expect(result.level).toBe('low');
    expect(result.score).toBeLessThan(EVIDENCE_LEVELS.medium);
  });

  it('recency uses the R5a per-memory decay_rate stability window', () => {
    // Same age; only decay_rate differs => only the durable one counts as fresh.
    const stale = computeEvidenceConfidence(
      [mem({ created_at: ago(20), decay_rate: 7 })], { now: NOW });
    const fresh = computeEvidenceConfidence(
      [mem({ created_at: ago(20), decay_rate: 60 })], { now: NOW });
    expect(fresh.signals.recency).toBeGreaterThan(stale.signals.recency);
  });

  it('falls back to type-default stability when decay_rate is missing (legacy rows)', () => {
    // fact default is 30d: a 10-day-old fact without decay_rate is fresh.
    const result = computeEvidenceConfidence(
      [mem({ created_at: ago(10), decay_rate: undefined })], { now: NOW });
    expect(result.signals.recency).toBe(1);
  });

  it('tolerates direct-table rows missing score/confidence/retrieval_count', () => {
    const bare = {
      id: 'x', content: 'bare row', memory_type: 'fact',
      importance_score: 7, created_at: ago(5), metadata: {},
    };
    const result = computeEvidenceConfidence([bare, bare, bare], { now: NOW });
    expect(result.score).toBeGreaterThan(0);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it('diversity counts distinct source buckets, not raw items', () => {
    const sameSource = computeEvidenceConfidence(
      [mem(), mem(), mem(), mem()], { now: NOW });
    const mixed = computeEvidenceConfidence(
      [
        mem({ metadata: { platform: 'spotify' } }),
        mem({ metadata: { platform: 'whoop' } }),
        mem({ metadata: { source: 'life_story' } }),
        mem({ memory_type: 'reflection', metadata: {} }),
      ],
      { now: NOW });
    expect(mixed.signals.diversity).toBeGreaterThan(sameSource.signals.diversity);
  });
});

describe('buildEvidenceHedgeBlock', () => {
  it('emits a hedge instruction only for low confidence', () => {
    const low = buildEvidenceHedgeBlock({ level: 'low', score: 0.2 });
    expect(low.length).toBeGreaterThan(40);
    expect(low.toLowerCase()).toContain('enough');
    expect(/\p{Extended_Pictographic}/u.test(low)).toBe(false);
    expect(buildEvidenceHedgeBlock({ level: 'medium', score: 0.5 })).toBe('');
    expect(buildEvidenceHedgeBlock({ level: 'high', score: 0.9 })).toBe('');
  });
});

describe('buildAdditionalContext — evidence confidence wiring', () => {
  it('returns evidenceConfidence computed from the injected evidence', () => {
    const result = buildAdditionalContext({
      memories: [mem(), mem({ metadata: { platform: 'spotify' } })],
      maxChars: 20000,
      now: NOW,
    });
    expect(result.evidenceConfidence).toBeDefined();
    expect(['low', 'medium', 'high']).toContain(result.evidenceConfidence.level);
    expect(result.evidenceConfidence.signals.count).toBeGreaterThan(0);
  });

  it('prefixes the hedge block when evidence is thin, so tail truncation cannot drop it', () => {
    const result = buildAdditionalContext({
      memories: [],
      enrichmentContext: 'Some profile text.',
      maxChars: 20000,
      now: NOW,
    });
    expect(result.evidenceConfidence.level).toBe('low');
    const hedgeIdx = result.additionalContext.indexOf('EVIDENCE CONFIDENCE');
    expect(hedgeIdx).toBeGreaterThanOrEqual(0);
    expect(hedgeIdx).toBeLessThan(result.additionalContext.indexOf('Some profile text'));
  });

  it('adds no hedge block when evidence is solid', () => {
    const memories = [
      mem({ metadata: { platform: 'spotify' }, memory_type: 'platform_data', decay_rate: 7, created_at: ago(1) }),
      mem({ metadata: { platform: 'whoop' }, memory_type: 'platform_data', decay_rate: 7, created_at: ago(2) }),
      mem(), mem(), mem(),
      mem({ memory_type: 'reflection', decay_rate: 90, metadata: {} }),
      mem({ metadata: { source: 'gdpr_import' } }),
      mem(),
    ];
    const result = buildAdditionalContext({ memories, maxChars: 20000, now: NOW });
    expect(result.additionalContext).not.toContain('EVIDENCE CONFIDENCE');
  });
});
