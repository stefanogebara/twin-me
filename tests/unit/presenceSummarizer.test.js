/**
 * The summarizer, with the store and the LLM mocked. On her first phone call it
 * reads her answer back: a clear yes is recorded with the version of the script
 * she heard; a no or an unclear answer records nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const PRESENCE = { id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'user-1', cared_for_name: 'Lurdes' };
const ok = (data) => ({ data, error: null });

const { store, log, llm } = vi.hoisted(() => ({
  store: { saveConversationSummary: vi.fn(), addFacts: vi.fn(), recordElderAssent: vi.fn(), saveFact: vi.fn() },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  llm: { complete: vi.fn() },
}));

vi.mock('../../api/_app/services/presenceStore.js', () => store);
vi.mock('../../api/_app/services/logger.js', () => ({ createLogger: () => log }));
vi.mock('../../api/_app/services/llmGateway.js', () => ({ complete: llm.complete, TIER_ANALYSIS: 'analysis' }));

const { summarizeConversation, ELDER_ASSENT_CALL_VERSION, PREFERRED_NAME_QUESTION } = await import('../../api/_app/services/presenceSummarizer.js');

const transcript = [{ role: 'assistant', content: 'Oi' }, { role: 'user', content: 'Oi, tudo bem.' }];
const reply = (fields) => llm.complete.mockResolvedValue({ content: JSON.stringify({ summary: 'Ela estava bem.', her_recap: 'Falamos do seu dia.', needs_family: [], learned_facts: [], unknown_people: [], ...fields }) });

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(store)) fn.mockResolvedValue(ok(null));
  reply({});
});

describe('summarizeConversation', () => {
  it('saves the summary and returns what the relay needs', async () => {
    reply({ needs_family: ['Ela pediu remédio.'], urgency: 'high' });

    const result = await summarizeConversation('c-1', PRESENCE, transcript);

    expect(store.saveConversationSummary).toHaveBeenCalledWith('c-1', expect.objectContaining({ summary: 'Ela estava bem.', urgency: 'high', status: 'summarized' }));
    expect(result).toMatchObject({ summary: 'Ela estava bem.', needsFamily: ['Ela pediu remédio.'], urgency: 'high', assent: null });
    expect(llm.complete.mock.calls[0][0].system).not.toMatch(/"assent"/);
  });

  it('records nothing about assent on an ordinary call', async () => {
    await summarizeConversation('c-1', PRESENCE, transcript);

    expect(store.recordElderAssent).not.toHaveBeenCalled();
  });

  it('asks about her answer on a first call and records a clear yes with her name', async () => {
    reply({ assent: 'yes', preferred_name: 'Dona Lurdes', preferred_time: 'de manhã' });

    const result = await summarizeConversation('c-1', PRESENCE, transcript, { firstCall: true });

    expect(llm.complete.mock.calls[0][0].system).toMatch(/"assent"/);
    expect(store.recordElderAssent).toHaveBeenCalledWith(PRESENCE.id, ELDER_ASSENT_CALL_VERSION);
    expect(store.saveFact).toHaveBeenCalledWith(PRESENCE.id, expect.objectContaining({ kind: 'language', question: PREFERRED_NAME_QUESTION, answer: 'Dona Lurdes' }));
    expect(result).toMatchObject({ assent: 'yes', preferredName: 'Dona Lurdes' });
  });

  it('records nothing when she said no, or when it is unclear', async () => {
    reply({ assent: 'no' });
    const no = await summarizeConversation('c-1', PRESENCE, transcript, { firstCall: true });
    reply({});
    const unclear = await summarizeConversation('c-1', PRESENCE, transcript, { firstCall: true });

    expect(store.recordElderAssent).not.toHaveBeenCalled();
    expect(no.assent).toBe('no');
    expect(unclear.assent).toBe('unclear');
  });

  it('still saves a summary line when the model returns nothing usable', async () => {
    llm.complete.mockResolvedValue({ content: 'not json' });

    const result = await summarizeConversation('c-1', PRESENCE, transcript);

    expect(result.summary).toMatch(/O resumo não saiu/);
    expect(store.saveConversationSummary).toHaveBeenCalled();
  });

  it('marks an empty call without asking the model', async () => {
    const result = await summarizeConversation('c-1', PRESENCE, []);

    expect(llm.complete).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/nenhuma conversa/);
  });
});

describe('the distress tripwire (Phase 2, T8)', () => {
  it('raises the urgency to high when she spoke of a fall, whatever the model said', async () => {
    reply({ needs_family: [], urgency: 'normal' });
    const fell = [{ role: 'agent', content: 'Como foi o dia?' }, { role: 'user', content: 'Tudo bem, só que eu caí no quintal de manhã.' }];

    const result = await summarizeConversation('c-1', PRESENCE, fell);

    expect(result.urgency).toBe('high');
    expect(result.needsFamily).toEqual([expect.stringMatching(/caí/)]);
    expect(store.saveConversationSummary).toHaveBeenCalledWith('c-1', expect.objectContaining({ urgency: 'high', needs_family: [expect.stringMatching(/caí/)] }));
  });

  it('keeps what the model found and only adds the urgency', async () => {
    reply({ needs_family: ['Ela pediu o remédio.'], urgency: 'normal' });
    const pain = [{ role: 'user', content: 'tô com muita dor na perna' }];

    const result = await summarizeConversation('c-1', PRESENCE, pain);

    expect(result.urgency).toBe('high');
    expect(result.needsFamily).toEqual(['Ela pediu o remédio.']);
  });
});
