/**
 * Unit tests for api/services/insightEditor.js — the salience + voice layer.
 * Contract:
 *   - violatesVoice rejects the exact failure modes we saw in prod (chores,
 *     stat-weapons, agent-speak, >2 sentences, emoji) and passes mirror voice.
 *   - editInsights collapses semantic duplicates (the six identical email nags
 *     become 0-1), respects the Editor's "surface nothing", vetoes any rewrite
 *     that still yaps, and returns at most one insight with an embedding.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.NODE_ENV = 'test';

const completeMock = vi.fn();
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_EXTRACTION: 'extraction',
}));

const embeddingsMock = vi.fn();
const embeddingMock = vi.fn();
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbeddings: (...a) => embeddingsMock(...a),
  generateEmbedding: (...a) => embeddingMock(...a),
}));

const historyQueue = [];
vi.mock('../../../api/services/database.js', () => {
  function builder() {
    const b = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'lt', 'not', 'order', 'limit']) b[m] = vi.fn(() => b);
    b.then = (resolve, reject) => {
      const next = historyQueue.length ? historyQueue.shift() : { data: [], error: null };
      return Promise.resolve(next).then(resolve, reject);
    };
    return b;
  }
  return { supabaseAdmin: { from: vi.fn(() => builder()) } };
});

const {
  violatesVoice,
  cosineSim,
  editInsights,
  DEDUP_COSINE,
} = await import('../../../api/services/insightEditor.js');

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const editorSays = (obj) => completeMock.mockResolvedValue({ content: JSON.stringify(obj) });

beforeEach(() => {
  vi.clearAllMocks();
  historyQueue.length = 0;
  embeddingMock.mockResolvedValue([0, 1, 0]);
});

// ── violatesVoice (pure) ─────────────────────────────────────────────────────
describe('violatesVoice', () => {
  it('passes a clean mirror line', () => {
    expect(violatesVoice("You're sleeping better, but your bedtimes are all over the place. Rough week?")).toBeNull();
    expect(violatesVoice('Your inbox is a place you have quietly given up on.')).toBeNull();
  });

  it('rejects the real prod nags', () => {
    expect(violatesVoice('You only read 8% of your email — archive everything tonight.')).toBeTruthy();
    expect(violatesVoice('You have 39437 unread messages.')).toBe('stat_weapon_bignum');
    expect(violatesVoice('Your email is 45% dev and 30% work.')).toBe('stat_weapon_percent');
    expect(violatesVoice('Your communications department should archive everything.')).toBeTruthy();
    expect(violatesVoice('Lock in a 10:30 PM bedtime tonight to cement the trend.')).toBe('imperative_chore');
  });

  it('rejects more than two sentences', () => {
    expect(violatesVoice('One thing. Two thing. Three thing.')).toBe('too_many_sentences');
  });

  it('rejects emoji', () => {
    expect(violatesVoice('You seem stressed 😬')).toBe('emoji');
  });

  it('allows a single feeling-bearing percentage', () => {
    expect(violatesVoice('Your recovery climbed to 62% — you can feel it, can\'t you?')).toBeNull();
  });
});

describe('cosineSim', () => {
  it('is 1 for identical and 0 for orthogonal', () => {
    expect(cosineSim([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSim([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });
  it('threshold sanity: near-identical clears the dedup bar', () => {
    expect(cosineSim([1, 0, 0], [0.99, 0.05, 0])).toBeGreaterThan(DEDUP_COSINE);
  });
});

// ── editInsights ─────────────────────────────────────────────────────────────
describe('editInsights', () => {
  it('returns null for no candidates', async () => {
    expect(await editInsights(USER, [])).toBeNull();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('collapses a repeat against history (the six-nag fix) — never reaches the Editor', async () => {
    // History already surfaced the email nag (vector [1,0,0]).
    historyQueue.push({ data: [{ insight: 'Your inbox is a black hole.', embedding: [1, 0, 0] }], error: null });
    // New run proposes the same nag again — near-identical vector.
    embeddingsMock.mockResolvedValue([[1, 0, 0]]);
    const out = await editInsights(USER, [{ insight: 'You only read 8% of your email, 40k unread.', category: 'concern' }]);
    expect(out).toBeNull();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('dedupes within a single batch before the Editor sees them', async () => {
    historyQueue.push({ data: [], error: null });
    embeddingsMock.mockResolvedValue([[1, 0, 0], [1, 0, 0], [1, 0, 0]]); // all the same
    editorSays({ surface: true, insight: 'You keep circling the same worry about your inbox.', urgency: 'low', category: 'concern' });
    await editInsights(USER, [
      { insight: 'nag a' }, { insight: 'nag b' }, { insight: 'nag c' },
    ]);
    const prompt = completeMock.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('1. nag a');
    expect(prompt).not.toContain('2.'); // only one survivor reached the Editor
  });

  it('returns the single rewritten insight + embedding on a clean surface', async () => {
    historyQueue.push({ data: [], error: null });
    embeddingsMock.mockResolvedValue([[0, 1, 0]]);
    editorSays({ surface: true, insight: 'You are sleeping better, but your bedtimes are all over the place. Rough week?', urgency: 'medium', category: 'trend' });
    const out = await editInsights(USER, [{ insight: 'whoop recovery up, bedtime variance high' }]);
    expect(out).not.toBeNull();
    expect(out.insight).toMatch(/bedtimes are all over the place/);
    expect(out.urgency).toBe('medium');
    expect(out.embedding).toEqual([0, 1, 0]);
  });

  it('honors the Editor choosing to surface nothing', async () => {
    historyQueue.push({ data: [], error: null });
    embeddingsMock.mockResolvedValue([[0, 1, 0]]);
    editorSays({ surface: false, insight: null, urgency: 'low', category: null, reason: 'just logistics' });
    expect(await editInsights(USER, [{ insight: 'you have meetings tomorrow' }])).toBeNull();
  });

  it('vetoes an Editor rewrite that still yaps', async () => {
    historyQueue.push({ data: [], error: null });
    embeddingsMock.mockResolvedValue([[0, 1, 0]]);
    editorSays({ surface: true, insight: 'Archive everything in your inbox tonight.', urgency: 'high', category: 'concern' });
    expect(await editInsights(USER, [{ insight: 'inbox backlog' }])).toBeNull();
  });
});
