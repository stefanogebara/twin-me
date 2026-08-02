/**
 * Evidence Confidence (R2 — Simile deep-dive, evidence-density honesty)
 * =====================================================================
 * Scores the evidence actually injected into a twin-chat turn
 * (memoriesInContext) so the twin can hedge honestly when its grounding
 * is thin, instead of fabricating specifics. Simile's production insight
 * applied at N=1: every simulation output carries a predicted-accuracy
 * tag derived from the amount and relevance of supporting evidence.
 *
 * Pure computation — no LLM, no DB. Heuristic v1 (per the roadmap:
 * "start heuristic, upgrade to learned later"). The score is persisted
 * with each assistant message (twin_messages.metadata.evidence_confidence)
 * so thumbs feedback can calibrate the thresholds over time.
 *
 * Named evidenceConfidence throughout — the chat route already carries
 * six unrelated `confidence` fields (neuropil, expert routing, task
 * intent, neurotransmitter mode, personality, per-memory confidence).
 */

// Type-default stability (days) — mirrors DECAY_RATE_BY_TYPE in
// memoryStreamService.js; duplicated as a fallback table only so this
// module stays import-light and pure (no memory-stream module graph).
const TYPE_STABILITY_DAYS = {
  conversation: 14,
  platform_data: 7,
  observation: 7,
  fact: 30,
  reflection: 90,
};

/** Composite thresholds: score >= high => 'high', >= medium => 'medium'. */
export const EVIDENCE_LEVELS = { high: 0.6, medium: 0.35 };

/** Signal weights — exported for tuning/calibration visibility. */
export const EVIDENCE_WEIGHTS = { volume: 0.35, quality: 0.25, diversity: 0.2, recency: 0.2 };

/** Evidence items at/above this count saturate the volume signal. */
const VOLUME_SATURATION = 8;
/** Distinct source buckets at/above this count saturate diversity. */
const DIVERSITY_SATURATION = 3;
/** Typical per-memory strength (confidence x importance/10) treated as full quality. */
const QUALITY_SATURATION = 0.55;

function sourceBucket(memory) {
  const platform = memory?.metadata?.platform || memory?.metadata?.source;
  if (platform) return String(platform);
  return String(memory?.memory_type || 'unknown');
}

function ageDays(memory, now) {
  const ts = memory?.last_accessed_at || memory?.created_at;
  if (!ts) return Infinity;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (now.getTime() - t) / (24 * 60 * 60 * 1000));
}

/**
 * Score an evidence set on four signals, each normalized to [0, 1]:
 *  - volume: item count with diminishing returns
 *  - quality: mean of (confidence ?? 0.7) x (importance/10)
 *  - diversity: distinct source buckets (platform/source, else type)
 *  - recency: share of items younger than their own stability window —
 *    R5a's per-memory decay_rate (days), falling back to type defaults
 *
 * Returns { score, level: 'high'|'medium'|'low', signals }.
 * Tolerates the heterogeneous shapes retrieveDiverseMemories produces
 * (direct-table legs lack score/confidence/retrieval_count).
 */
export function computeEvidenceConfidence(memories, { now = new Date() } = {}) {
  const items = Array.isArray(memories) ? memories.filter(Boolean) : [];
  if (items.length === 0) {
    return {
      score: 0,
      level: 'low',
      signals: { count: 0, volume: 0, quality: 0, diversity: 0, recency: 0 },
    };
  }

  const volume = Math.min(1, items.length / VOLUME_SATURATION);

  const strengths = items.map(m => {
    const confidence = typeof m.confidence === 'number' ? m.confidence : 0.7;
    const importance = (typeof m.importance_score === 'number' ? m.importance_score : 5) / 10;
    return confidence * importance;
  });
  const quality = Math.min(
    1,
    (strengths.reduce((a, b) => a + b, 0) / strengths.length) / QUALITY_SATURATION
  );

  const buckets = new Set(items.map(sourceBucket));
  const diversity = Math.min(1, buckets.size / DIVERSITY_SATURATION);

  const freshCount = items.filter(m => {
    const stability =
      typeof m.decay_rate === 'number' && m.decay_rate > 0
        ? m.decay_rate
        : TYPE_STABILITY_DAYS[m.memory_type] ?? 7;
    return ageDays(m, now) <= stability;
  }).length;
  const recency = freshCount / items.length;

  const score =
    EVIDENCE_WEIGHTS.volume * volume +
    EVIDENCE_WEIGHTS.quality * quality +
    EVIDENCE_WEIGHTS.diversity * diversity +
    EVIDENCE_WEIGHTS.recency * recency;

  const level = score >= EVIDENCE_LEVELS.high ? 'high'
    : score >= EVIDENCE_LEVELS.medium ? 'medium'
    : 'low';

  return {
    score: Math.round(score * 1000) / 1000,
    level,
    signals: {
      count: items.length,
      volume: Math.round(volume * 1000) / 1000,
      quality: Math.round(quality * 1000) / 1000,
      diversity: Math.round(diversity * 1000) / 1000,
      recency: Math.round(recency * 1000) / 1000,
    },
  };
}

/**
 * The per-response hedge instruction. Only LOW evidence gets a block —
 * medium/high add no prompt noise; the per-memory "(less certain)"
 * suffix (computeAlpha) still handles individually weak memories.
 */
export function buildEvidenceHedgeBlock(evidenceConfidence) {
  if (!evidenceConfidence || evidenceConfidence.level !== 'low') return '';
  return `EVIDENCE CONFIDENCE: LOW
The retrieved context for this message is thin — few, stale, or single-source memories. Be honest about that limit: qualify specifics you are not grounded in, say plainly when you do not have enough signal to answer well, and never invent details to fill the gap. Suggesting how to give you more signal (connecting a platform, a Story chapter) is welcome when it fits naturally.`;
}
