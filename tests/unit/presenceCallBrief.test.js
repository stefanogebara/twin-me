/**
 * compileCallBrief, with presenceStore mocked at its boundary. The brief is all
 * her call knows about her. A failed read of the family map, the facts (which
 * carry the family's boundaries) or the queued notes fails the call: without
 * them it could speak of someone who has died as living, cross a line the family
 * drew, or let /complete mark notes delivered that were never read to her. The
 * cloned voice and recent conversations only enrich the call, so a failed read
 * of either is logged and the call starts without it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const PRESENCE = { id: '11111111-1111-4111-8111-111111111111', cared_for_name: 'Lurdes', caller_name: 'Ana', tone: '' };

const ok = (data) => ({ data, error: null });
const fail = (message) => ({ data: null, error: { message } });

const { store, log } = vi.hoisted(() => ({
  store: { getCallBriefSources: vi.fn() },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../api/services/presenceStore.js', () => store);
vi.mock('../../api/services/logger.js', () => ({ createLogger: () => log }));
vi.mock('../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: () => {
      throw new Error('presenceCallBrief must read through presenceStore');
    },
  },
}));

const { compileCallBrief } = await import('../../api/services/presenceCallBrief.js');

/** What getCallBriefSources resolves to: one response per query plus the first error. */
function sources(overrides = {}) {
  const responses = {
    people: ok([{ name: 'Teresa', relation: 'sister', called_by: 'Tete' }]),
    facts: ok([{ kind: 'boundary', question: 'From the family', answer: 'Never mention the hospital', confidence: 'committed' }]),
    notes: ok([{ id: 'n-1', body: 'Ana will call on Sunday.' }]),
    voice: ok({ status: 'ready', elevenlabs_voice_id: 'voice-1' }),
    conversations: ok([{ started_at: '2026-09-10T10:00:00Z', summary: 'She talked about the beach house.' }]),
    ...overrides,
  };
  return { ...responses, error: Object.values(responses).find((r) => r.error)?.error ?? null };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.getCallBriefSources.mockResolvedValue(sources());
});

describe('compileCallBrief', () => {
  it('compiles the brief from what the store reads', async () => {
    const brief = await compileCallBrief(PRESENCE);

    expect(store.getCallBriefSources).toHaveBeenCalledWith(PRESENCE.id);
    expect(brief.prompt).toContain('Teresa (sister)');
    expect(brief.prompt).toContain('Never mention the hospital');
    expect(brief.prompt).toContain('Ana will call on Sunday.');
    expect(brief.prompt).toContain('She talked about the beach house.');
    expect(brief.voiceId).toBe('voice-1');
    expect(brief.queuedNoteIds).toEqual(['n-1']);
  });

  it.each(['people', 'facts', 'notes'])('fails when the %s cannot be read', async (source) => {
    store.getCallBriefSources.mockResolvedValue(sources({ [source]: fail('statement timeout') }));

    await expect(compileCallBrief(PRESENCE)).rejects.toMatchObject({ message: 'statement timeout' });
  });

  it('starts with the standard voice, and logs, when the voice cannot be read', async () => {
    store.getCallBriefSources.mockResolvedValue(sources({ voice: fail('statement timeout') }));

    const brief = await compileCallBrief(PRESENCE);

    expect(brief.voiceId).toBeNull();
    expect(brief.prompt).toContain('Teresa (sister)');
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ presenceId: PRESENCE.id, error: 'statement timeout' }),
    );
  });

  it('starts without recent conversations, and logs, when they cannot be read', async () => {
    store.getCallBriefSources.mockResolvedValue(sources({ conversations: fail('statement timeout') }));

    const brief = await compileCallBrief(PRESENCE);

    expect(brief.prompt).not.toContain('WHAT YOU REMEMBER FROM RECENT CONVERSATIONS');
    expect(brief.prompt).toContain('Teresa (sister)');
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ presenceId: PRESENCE.id, error: 'statement timeout' }),
    );
  });
});
