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

const { store, log, llm, brief } = vi.hoisted(() => ({
  store: {
    findPresenceByCallToken: vi.fn(),
    getElderHome: vi.fn(),
    createConversation: vi.fn(),
    markQueuedNotesDelivered: vi.fn(),
    saveConversationSummary: vi.fn(),
    addFacts: vi.fn(),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  llm: { complete: vi.fn() },
  brief: { compileCallBrief: vi.fn() },
}));

vi.mock('../../../api/services/presenceStore.js', () => store);
vi.mock('../../../api/services/logger.js', () => ({ createLogger: () => log }));
vi.mock('../../../api/services/llmGateway.js', () => ({ complete: llm.complete, TIER_ANALYSIS: 'analysis' }));
vi.mock('../../../api/services/presenceCallBrief.js', () => brief);

const callRoutes = (await import('../../../api/routes/presence-call.js')).default;

function createApp() {
  const app = express();
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

    const res = await complete({ transcript: [], duration_seconds: 3 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, conversation_id: 'conv-1' });
    expect(log.error).toHaveBeenCalledWith(expect.any(String), loggedError('timeout'));
  });
});

describe('background summary', () => {
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
