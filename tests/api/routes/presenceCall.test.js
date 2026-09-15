/**
 * Error paths of api/routes/presence-call.js (the elder channel), with
 * presenceStore mocked at its boundary. After the conversation row is stored
 * the elder page must not see an error (a retry would store the call twice),
 * so the writes that follow it are logged when they fail rather than lost.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const TOKEN = 'tok_abcdefghijklmnopqrstuv';
const PRESENCE = { id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'user-1', status: 'active', cared_for_name: 'Lurdes', caller_name: 'Ana' };

const ok = (data) => ({ data, error: null });
const fail = (message) => ({ data: null, error: { message } });

const { store, log, llm, brief, voiceService } = vi.hoisted(() => ({
  store: {
    findPresenceByCallToken: vi.fn(),
    getElderHome: vi.fn(),
    createConversation: vi.fn(),
    markQueuedNotesDelivered: vi.fn(),
    saveConversationSummary: vi.fn(),
    addFacts: vi.fn(),
    recordElderAssent: vi.fn(),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  llm: { complete: vi.fn() },
  brief: { compileCallBrief: vi.fn() },
  voiceService: { isEnabled: vi.fn(), getConversationToken: vi.fn(), getConversation: vi.fn() },
}));

vi.mock('../../../api/services/presenceStore.js', () => store);
vi.mock('../../../api/services/logger.js', () => ({ createLogger: () => log }));
vi.mock('../../../api/services/llmGateway.js', () => ({ complete: llm.complete, TIER_ANALYSIS: 'analysis' }));
vi.mock('../../../api/services/presenceCallBrief.js', () => brief);
vi.mock('../../../api/services/voiceService.js', () => ({ voiceService }));

const callRoutes = (await import('../../../api/routes/presence-call.js')).default;

function createApp() {
  const app = express();
  // As server.js mounts it: a 2 MB parser for the elder channel ahead of the
  // 100 kB default, so a 40-minute transcript is not refused with 413.
  app.use('/api/presence-call', express.json({ limit: '2mb' }));
  app.use(express.json());
  app.use('/api/presence-call', callRoutes);
  return app;
}

const complete = (body) => request(createApp()).post(`/api/presence-call/${TOKEN}/complete`).send(body);
const loggedError = (message) => expect.objectContaining({ error: message });

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(store)) fn.mockResolvedValue(ok(null));
  store.findPresenceByCallToken.mockResolvedValue(ok(PRESENCE));
  store.createConversation.mockResolvedValue(ok({ id: 'conv-1' }));
  store.getElderHome.mockResolvedValue({ notes: ok([]), conversations: ok([]), error: null });
  // No ElevenLabs key in most tests: the session uses the public agent id and the
  // transcript the browser sent, as in local development.
  voiceService.isEnabled.mockReturnValue(false);
  brief.compileCallBrief.mockResolvedValue({ prompt: 'PROMPT', firstMessage: 'Oi, Lurdes!', voiceId: null, queuedNoteIds: [] });
  llm.complete.mockResolvedValue({
    content: JSON.stringify({
      summary: 'She talked about the beach.',
      her_recap: 'Falamos da praia.',
      needs_family: [],
      learned_facts: [{ question: 'Summers', answer: 'She spent every summer in Ubatuba.' }],
      unknown_people: [],
    }),
  });
});

describe('GET /:token', () => {
  afterEach(() => {
    delete process.env.ELEVENLABS_PRESENCE_AGENT_ID;
  });

  // compileCallBrief rejects when the family map, facts or notes cannot be read.
  it('answers 500, and starts no call, when the brief cannot be compiled', async () => {
    process.env.ELEVENLABS_PRESENCE_AGENT_ID = 'agent-1';
    brief.compileCallBrief.mockRejectedValueOnce({ message: 'statement timeout' });

    const res = await request(createApp()).get(`/api/presence-call/${TOKEN}`);

    expect(res.status).toBe(500);
    expect(res.body.call).toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(expect.any(String), loggedError('statement timeout'));
  });
});

describe('GET /:token — a private agent and a server-issued session', () => {
  beforeEach(() => {
    process.env.ELEVENLABS_PRESENCE_AGENT_ID = 'agent-1';
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_PRESENCE_AGENT_ID;
  });

  it('returns a conversation token, the presence id and Brazilian Portuguese', async () => {
    voiceService.isEnabled.mockReturnValue(true);
    voiceService.getConversationToken.mockResolvedValue({ success: true, token: 'tok-1', conversationId: 'conv-1' });

    const res = await request(createApp()).get(`/api/presence-call/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.call).toMatchObject({ conversation_token: 'tok-1', presence_id: PRESENCE.id, language: 'pt-br', agent_id: 'agent-1' });
    expect(voiceService.getConversationToken).toHaveBeenCalledWith('agent-1');
  });

  it('answers 502 when ElevenLabs will not issue a session', async () => {
    voiceService.isEnabled.mockReturnValue(true);
    voiceService.getConversationToken.mockResolvedValue({ success: false, error: 'invalid key' });

    const res = await request(createApp()).get(`/api/presence-call/${TOKEN}`);

    expect(res.status).toBe(502);
    expect(res.body.call).toBeUndefined();
  });

  it('falls back to the public agent id without a key, as in local development', async () => {
    const res = await request(createApp()).get(`/api/presence-call/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.call.conversation_token).toBeNull();
    expect(res.body.call.agent_id).toBe('agent-1');
  });
});

describe('POST /:token/complete — the transcript ElevenLabs holds, not the one the browser sent', () => {
  const record = (overrides = {}) => ({
    agent_id: 'agent-1',
    conversation_id: 'conv-1',
    status: 'done',
    transcript: [
      { role: 'agent', message: 'Oi, Lurdes!', time_in_call_secs: 0 },
      { role: 'user', message: 'Oi, filha', time_in_call_secs: 3 },
      { role: 'agent', message: null, time_in_call_secs: 5 },
    ],
    metadata: { call_duration_secs: 95 },
    ...overrides,
  });

  beforeEach(() => {
    process.env.ELEVENLABS_PRESENCE_AGENT_ID = 'agent-1';
    voiceService.isEnabled.mockReturnValue(true);
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_PRESENCE_AGENT_ID;
  });

  it('answers 400 without a conversation id', async () => {
    const res = await complete({ transcript: [{ role: 'user', content: 'x' }], duration_seconds: 10 });

    expect(res.status).toBe(400);
    expect(store.createConversation).not.toHaveBeenCalled();
  });

  it('answers 409 and stores nothing when ElevenLabs does not know the conversation', async () => {
    voiceService.getConversation.mockResolvedValue({ success: false, error: 'not found' });

    const res = await complete({ conversation_id: 'conv-x', transcript: [{ role: 'user', content: 'FAKE' }], duration_seconds: 10 });

    expect(res.status).toBe(409);
    expect(store.createConversation).not.toHaveBeenCalled();
  });

  it('answers 409 when the conversation belongs to another agent', async () => {
    voiceService.getConversation.mockResolvedValue({ success: true, conversation: record({ agent_id: 'agent-other' }) });

    const res = await complete({ conversation_id: 'conv-1', transcript: [], duration_seconds: 10 });

    expect(res.status).toBe(409);
    expect(store.createConversation).not.toHaveBeenCalled();
  });

  it('stores the transcript and duration ElevenLabs holds, with its id', async () => {
    voiceService.getConversation.mockResolvedValue({ success: true, conversation: record() });

    const res = await complete({ conversation_id: 'conv-1', transcript: [{ role: 'user', content: 'FAKE' }], duration_seconds: 1 });

    expect(res.status).toBe(201);
    expect(store.createConversation.mock.calls[0][0]).toMatchObject({
      transcript: [{ role: 'assistant', content: 'Oi, Lurdes!' }, { role: 'user', content: 'Oi, filha' }],
      turn_count: 2,
      duration_seconds: 95,
      provider_conversation_id: 'conv-1',
    });
  });

  it('keeps the transcript the browser sent, and logs, while ElevenLabs is still processing the call', async () => {
    voiceService.getConversation.mockResolvedValue({ success: true, conversation: record({ status: 'processing', transcript: [], metadata: {} }) });

    const res = await complete({ conversation_id: 'conv-1', transcript: [{ role: 'user', content: 'Oi, filha' }], duration_seconds: 40 });

    expect(res.status).toBe(201);
    expect(store.createConversation.mock.calls[0][0]).toMatchObject({
      transcript: [{ role: 'user', content: 'Oi, filha' }], duration_seconds: 40, provider_conversation_id: 'conv-1',
    });
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ conversationId: 'conv-1' }));
  });
});

describe('GET /:token — only an active presence answers its link', () => {
  it.each(['draft', 'paused', 'deleted'])('answers 404 for a %s presence', async (status) => {
    process.env.ELEVENLABS_PRESENCE_AGENT_ID = 'agent-1';
    store.findPresenceByCallToken.mockResolvedValue(ok({ ...PRESENCE, status }));

    const res = await request(createApp()).get(`/api/presence-call/${TOKEN}`);

    expect(res.status).toBe(404);
    expect(brief.compileCallBrief).not.toHaveBeenCalled();
    delete process.env.ELEVENLABS_PRESENCE_AGENT_ID;
  });
});

describe('POST /:token/complete — the transcript of a long call', () => {
  it('stores a 40-minute conversation whose body is over 100 kB', async () => {
    const transcript = Array.from({ length: 300 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(600) }));

    const res = await complete({ transcript, duration_seconds: 2400 });

    expect(res.status).toBe(201);
    expect(store.createConversation.mock.calls[0][0].turn_count).toBe(300);
  });
});

describe('POST /:token/complete — a note is delivered only by a call that happened', () => {
  it('does not mark notes delivered when she never spoke', async () => {
    const res = await complete({ transcript: [{ role: 'assistant', content: 'Oi, Lurdes!' }], duration_seconds: 4 });

    expect(res.status).toBe(201);
    expect(store.markQueuedNotesDelivered).not.toHaveBeenCalled();
  });

  it('does not mark notes delivered when the call dropped within a minute', async () => {
    const res = await complete({
      transcript: [{ role: 'assistant', content: 'Oi' }, { role: 'user', content: 'Oi, filha' }, { role: 'assistant', content: 'Ana pediu para eu te contar...' }],
      duration_seconds: 20,
    });

    expect(res.status).toBe(201);
    expect(store.markQueuedNotesDelivered).not.toHaveBeenCalled();
  });

  it('marks notes delivered once she has spoken and the call lasted', async () => {
    const res = await complete({
      transcript: [{ role: 'assistant', content: 'Oi' }, { role: 'user', content: 'Oi, filha' }, { role: 'assistant', content: 'Ana pediu para eu te contar...' }],
      duration_seconds: 90,
    });

    expect(res.status).toBe(201);
    expect(store.markQueuedNotesDelivered).toHaveBeenCalledWith(PRESENCE.id);
  });
});

describe('GET /:token/home', () => {
  it('answers 500, not an empty home, when a home query fails', async () => {
    store.getElderHome.mockResolvedValue({ notes: fail('timeout'), conversations: ok([]), error: { message: 'timeout' } });

    const res = await request(createApp()).get(`/api/presence-call/${TOKEN}/home`);

    expect(res.status).toBe(500);
  });
});

describe('POST /:token/complete', () => {
  it('still answers 201, and logs, when the queued notes cannot be marked delivered', async () => {
    store.markQueuedNotesDelivered.mockResolvedValue(fail('timeout'));

    const res = await complete({
      transcript: [{ role: 'assistant', content: 'Oi' }, { role: 'user', content: 'Oi, filha' }, { role: 'assistant', content: 'Que bom.' }],
      duration_seconds: 90,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, conversation_id: 'conv-1' });
    expect(log.error).toHaveBeenCalledWith(expect.any(String), loggedError('timeout'));
  });
});

describe('her assent', () => {
  beforeEach(() => {
    process.env.ELEVENLABS_PRESENCE_AGENT_ID = 'agent-1';
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_PRESENCE_AGENT_ID;
  });

  it('asks for her assent before the first call and not after', async () => {
    const before = await request(createApp()).get(`/api/presence-call/${TOKEN}`);
    expect(before.body.call.assent_required).toBe(true);

    store.findPresenceByCallToken.mockResolvedValue(ok({ ...PRESENCE, elder_assent_at: '2026-09-15T10:00:00Z', elder_assent_version: 'elder-assent-v1' }));
    const after = await request(createApp()).get(`/api/presence-call/${TOKEN}`);
    expect(after.body.call.assent_required).toBe(false);
  });

  it('records her yes with the version of the text she heard', async () => {
    const res = await request(createApp()).post(`/api/presence-call/${TOKEN}/assent`).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, assent_version: 'elder-assent-v1' });
    expect(store.recordElderAssent).toHaveBeenCalledWith(PRESENCE.id, 'elder-assent-v1');
  });

  it('answers 500 when her yes cannot be saved', async () => {
    store.recordElderAssent.mockResolvedValue(fail('connection reset'));

    const res = await request(createApp()).post(`/api/presence-call/${TOKEN}/assent`).send({});

    expect(res.status).toBe(500);
  });
});

describe('urgency', () => {
  const call = () => complete({
    transcript: [{ role: 'assistant', content: 'Oi' }, { role: 'user', content: 'Caí no banheiro hoje.' }],
    duration_seconds: 90,
  });

  it('stores a high urgency when the summary reports one', async () => {
    llm.complete.mockResolvedValue({ content: JSON.stringify({ summary: 'Ela caiu no banheiro.', her_recap: 'Falamos do seu dia.', needs_family: ['Ela caiu no banheiro hoje de manhã.'], urgency: 'high', learned_facts: [], unknown_people: [] }) });

    const res = await call();

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(store.saveConversationSummary).toHaveBeenCalledWith('conv-1', expect.objectContaining({ urgency: 'high' })));
  });

  it('stores a normal urgency when the summary reports none', async () => {
    const res = await call();

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(store.saveConversationSummary).toHaveBeenCalledWith('conv-1', expect.objectContaining({ urgency: 'normal' })));
  });
});

describe('background summary', () => {
  it('writes the ask card for an unknown person in Portuguese', async () => {
    llm.complete.mockResolvedValue({ content: JSON.stringify({ summary: 'x', her_recap: 'y', needs_family: [], learned_facts: [], unknown_people: ['Teresa'] }) });

    const res = await complete({
      transcript: [{ role: 'assistant', content: 'Oi' }, { role: 'user', content: 'A Teresa passou aqui.' }],
      duration_seconds: 90,
    });

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(store.addFacts).toHaveBeenCalled());
    expect(store.addFacts.mock.calls[0][0]).toEqual([
      expect.objectContaining({ confidence: 'ask', question: 'Quem é "Teresa"? Ela falou dessa pessoa na conversa.' }),
    ]);
  });

  it('asks for the family summary in Brazilian Portuguese', async () => {
    const res = await complete({
      transcript: [{ role: 'assistant', content: 'Oi' }, { role: 'user', content: 'Fui à feira hoje.' }],
      duration_seconds: 90,
    });

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(llm.complete).toHaveBeenCalled());
    const { system } = llm.complete.mock.calls[0][0];
    expect(system).toMatch(/em português do Brasil/);
    expect(system).not.toMatch(/in English/);
  });

  it('logs when the empty-call summary cannot be saved', async () => {
    store.saveConversationSummary.mockResolvedValue(fail('connection reset'));

    const res = await complete({ transcript: [], duration_seconds: 3 });

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(log.error).toHaveBeenCalledWith(expect.any(String), loggedError('connection reset')));
  });

  it('logs when the summary cannot be saved, and still keeps what she said about her life', async () => {
    store.saveConversationSummary.mockResolvedValue(fail('connection reset'));

    const res = await complete({
      transcript: [{ role: 'user', content: 'Every summer we went to Ubatuba.' }, { role: 'assistant', content: 'Tell me more.' }],
      duration_seconds: 60,
    });

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(store.addFacts).toHaveBeenCalled());
    expect(log.error).toHaveBeenCalledWith(expect.any(String), loggedError('connection reset'));
    expect(store.addFacts.mock.calls[0][0]).toEqual([
      expect.objectContaining({ kind: 'biography', question: 'Summers', answer: 'She spent every summer in Ubatuba.', confidence: 'provisional' }),
    ]);
  });
});
