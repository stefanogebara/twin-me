/**
 * The ElevenLabs webhooks: the post-call transcript (signed), the call that
 * never connected, and the conversation-initiation request for an inbound
 * call. Store, brief, summarizer and relay are mocked at their boundaries;
 * bodies are signed the way ElevenLabs signs them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHmac } from 'node:crypto';

process.env.NODE_ENV = 'test';
const SECRET = 'whsec_test';
const INIT_SECRET = 'init-secret';
const ok = (data) => ({ data, error: null });
const fail = (message) => ({ data: null, error: { message } });

const PRESENCE = {
  id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'user-1', status: 'active',
  cared_for_name: 'Lurdes', caller_name: 'Ana', tone: '', elder_phone: '+5511999990000', elder_assent_at: '2026-09-10T10:00:00Z',
};

const { store, log, brief, summarizer, relay } = vi.hoisted(() => ({
  store: {
    findActivePresenceById: vi.fn(), findPresenceByElderPhone: vi.fn(), findConversationByProviderId: vi.fn(),
    createConversation: vi.fn(), updateCallByConversation: vi.fn(), markQueuedNotesDelivered: vi.fn(), createCall: vi.fn(), listCallsSince: vi.fn(),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  brief: { compileCallBrief: vi.fn() },
  summarizer: { summarizeConversation: vi.fn() },
  relay: { relayCall: vi.fn(), relayNoAnswer: vi.fn() },
}));

vi.mock('../../../api/services/presenceStore.js', () => store);
vi.mock('../../../api/services/logger.js', () => ({ createLogger: () => log }));
vi.mock('../../../api/services/presenceCallBrief.js', () => brief);
vi.mock('../../../api/services/presenceSummarizer.js', () => summarizer);
vi.mock('../../../api/services/presenceRelay.js', () => relay);

const routes = (await import('../../../api/routes/webhooks-elevenlabs.js')).default;

function createApp() {
  const app = express();
  // As server.js does: the raw body is kept for signature verification.
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use('/api/webhooks/elevenlabs', routes);
  return app;
}

const signed = (bodyObj, secret = SECRET) => {
  const body = JSON.stringify(bodyObj);
  const t = Math.floor(Date.now() / 1000);
  const v0 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return request(createApp()).post('/api/webhooks/elevenlabs/post-call')
    .set('Content-Type', 'application/json').set('ElevenLabs-Signature', `t=${t},v0=${v0}`).send(body);
};

const transcription = (overrides = {}) => ({
  type: 'post_call_transcription',
  event_timestamp: 1758000000,
  data: {
    agent_id: 'agent-1',
    conversation_id: 'conv-1',
    status: 'done',
    transcript: [
      { role: 'agent', message: 'Oi, Lurdes!', time_in_call_secs: 0 },
      { role: 'user', message: 'Oi, filha. Tudo bem.', time_in_call_secs: 3 },
      { role: 'agent', message: 'Que bom.', time_in_call_secs: 6 },
    ],
    metadata: { call_duration_secs: 95, phone_call: { direction: 'outbound', external_number: '+5511999990000', agent_number: '+15550001111', call_sid: 'CA1' } },
    conversation_initiation_client_data: { dynamic_variables: { presence_id: PRESENCE.id } },
    ...overrides,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ELEVENLABS_POST_CALL_SECRET = SECRET;
  process.env.ELEVENLABS_WEBHOOK_SECRET = INIT_SECRET;
  process.env.ELEVENLABS_PRESENCE_AGENT_ID = 'agent-1';
  for (const fn of Object.values(store)) fn.mockResolvedValue(ok(null));
  store.findActivePresenceById.mockResolvedValue(ok(PRESENCE));
  store.findPresenceByElderPhone.mockResolvedValue(ok(PRESENCE));
  store.createConversation.mockResolvedValue(ok({ id: 'c-1' }));
  store.createCall.mockResolvedValue(ok({ id: 'call-1' }));
  brief.compileCallBrief.mockResolvedValue({ prompt: 'PROMPT', firstMessage: 'Oi, Lurdes!', voiceId: null, queuedNoteIds: [] });
  summarizer.summarizeConversation.mockResolvedValue({ summary: 'Ela estava bem.', needsFamily: [], urgency: 'normal', assent: null, preferredName: '' });
  relay.relayCall.mockResolvedValue({ sent: true });
  relay.relayNoAnswer.mockResolvedValue({ sent: true });
  store.listCallsSince.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  delete process.env.ELEVENLABS_POST_CALL_SECRET;
  delete process.env.ELEVENLABS_WEBHOOK_SECRET;
  delete process.env.ELEVENLABS_PRESENCE_AGENT_ID;
});

describe('POST /post-call', () => {
  it('refuses a body signed with another secret', async () => {
    const res = await signed(transcription(), 'other');

    expect(res.status).toBe(401);
    expect(store.createConversation).not.toHaveBeenCalled();
  });

  it('refuses when no secret is configured', async () => {
    delete process.env.ELEVENLABS_POST_CALL_SECRET;

    const res = await signed(transcription());

    expect(res.status).toBe(503);
  });

  it('stores the call, marks the notes delivered, summarizes and relays', async () => {
    const res = await signed(transcription());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, conversation_id: 'c-1' });
    expect(store.findActivePresenceById).toHaveBeenCalledWith(PRESENCE.id);
    expect(store.createConversation).toHaveBeenCalledWith(expect.objectContaining({
      presence_id: PRESENCE.id,
      transcript: [{ role: 'assistant', content: 'Oi, Lurdes!' }, { role: 'user', content: 'Oi, filha. Tudo bem.' }, { role: 'assistant', content: 'Que bom.' }],
      turn_count: 3,
      duration_seconds: 95,
      provider_conversation_id: 'conv-1',
      source: 'phone',
    }));
    expect(store.updateCallByConversation).toHaveBeenCalledWith('conv-1', expect.objectContaining({ status: 'completed', conversation_id: 'c-1' }));
    expect(store.markQueuedNotesDelivered).toHaveBeenCalledWith(PRESENCE.id);
    await vi.waitFor(() => expect(relay.relayCall).toHaveBeenCalled());
    expect(summarizer.summarizeConversation).toHaveBeenCalledWith('c-1', PRESENCE, expect.any(Array), { firstCall: false });
    expect(relay.relayCall).toHaveBeenCalledWith(PRESENCE, expect.objectContaining({ id: 'c-1', summary: 'Ela estava bem.', urgency: 'normal' }));
  });

  it('summarizes as a first call when she has not said yes yet', async () => {
    store.findActivePresenceById.mockResolvedValue(ok({ ...PRESENCE, elder_assent_at: null }));

    await signed(transcription());

    await vi.waitFor(() => expect(summarizer.summarizeConversation).toHaveBeenCalled());
    expect(summarizer.summarizeConversation.mock.calls[0][3]).toEqual({ firstCall: true });
  });

  it('finds the presence by her phone when the call carried no presence id (she called in)', async () => {
    const body = transcription({ conversation_initiation_client_data: { dynamic_variables: {} }, metadata: { call_duration_secs: 40, phone_call: { direction: 'inbound', external_number: '+5511999990000', agent_number: '+15550001111', call_sid: 'CA2' } } });

    const res = await signed(body);

    expect(res.status).toBe(200);
    expect(store.findPresenceByElderPhone).toHaveBeenCalledWith('+5511999990000');
    expect(store.createConversation).toHaveBeenCalledWith(expect.objectContaining({ source: 'phone' }));
  });

  it('ignores, with 200, a conversation for nobody we know', async () => {
    store.findActivePresenceById.mockResolvedValue(ok(null));
    store.findPresenceByElderPhone.mockResolvedValue(ok(null));

    const res = await signed(transcription());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, ignored: 'unknown_presence' });
    expect(store.createConversation).not.toHaveBeenCalled();
  });

  it('does not store a conversation twice', async () => {
    store.findConversationByProviderId.mockResolvedValue(ok({ id: 'c-1', presence_id: PRESENCE.id }));

    const res = await signed(transcription());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, duplicate: true });
    expect(store.createConversation).not.toHaveBeenCalled();
  });

  it('does not mark notes delivered when the call never became a conversation', async () => {
    const body = transcription({ transcript: [{ role: 'agent', message: 'Oi, Lurdes!', time_in_call_secs: 0 }], metadata: { call_duration_secs: 5, phone_call: { direction: 'outbound', external_number: '+5511999990000' } } });

    await signed(body);

    expect(store.markQueuedNotesDelivered).not.toHaveBeenCalled();
  });

  it('answers 500 so ElevenLabs retries when the conversation cannot be stored', async () => {
    store.createConversation.mockResolvedValue(fail('connection reset'));

    const res = await signed(transcription());

    expect(res.status).toBe(500);
  });

  const failure = (reason) => signed({ type: 'call_initiation_failure', event_timestamp: 1, data: { agent_id: 'agent-1', conversation_id: 'conv-1', failure_reason: reason, metadata: { type: 'twilio', body: {} } } });

  it('records a call that never connected', async () => {
    store.updateCallByConversation.mockResolvedValue({ data: [{ attempt: 1, presence_id: PRESENCE.id }], error: null });

    const res = await failure('no-answer');

    expect(res.status).toBe(200);
    expect(store.updateCallByConversation).toHaveBeenCalledWith('conv-1', expect.objectContaining({ status: 'no_answer', failure_reason: 'no-answer' }));
    expect(relay.relayNoAnswer).not.toHaveBeenCalled();
  });

  it('tells the family after the second unanswered attempt of the day', async () => {
    store.updateCallByConversation.mockResolvedValue({ data: [{ attempt: 2, presence_id: PRESENCE.id }], error: null });

    const res = await failure('busy');

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(relay.relayNoAnswer).toHaveBeenCalledWith(PRESENCE, { days: 1 }));
    expect(store.findActivePresenceById).toHaveBeenCalledWith(PRESENCE.id);
  });

  it('ignores event types it does not know', async () => {
    const res = await signed({ type: 'post_call_audio', data: { conversation_id: 'conv-1' } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, ignored: 'post_call_audio' });
  });
});

describe('POST /initiation — she calls in', () => {
  const init = (headers = { 'x-presence-secret': INIT_SECRET }) =>
    request(createApp()).post('/api/webhooks/elevenlabs/initiation').set(headers)
      .send({ caller_id: '+5511999990000', called_number: '+15550001111', agent_id: 'agent-1', conversation_id: 'conv-9' });

  it('refuses without the shared secret', async () => {
    const res = await init({});

    expect(res.status).toBe(401);
  });

  it('answers with her brief and the presence id, and records the inbound call', async () => {
    const res = await init();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      type: 'conversation_initiation_client_data',
      conversation_config_override: { agent: { prompt: { prompt: 'PROMPT' }, first_message: 'Oi, Lurdes!', language: 'pt-br' } },
      dynamic_variables: { presence_id: PRESENCE.id },
    });
    expect(brief.compileCallBrief).toHaveBeenCalledWith(PRESENCE, { firstCall: false });
    expect(store.createCall).toHaveBeenCalledWith(expect.objectContaining({ presence_id: PRESENCE.id, direction: 'inbound', status: 'answered', provider_conversation_id: 'conv-9' }));
  });

  it('answers 404 for a caller we do not know', async () => {
    store.findPresenceByElderPhone.mockResolvedValue(ok(null));

    const res = await init();

    expect(res.status).toBe(404);
    expect(brief.compileCallBrief).not.toHaveBeenCalled();
  });
});

describe('the second day she does not answer (Phase 2, T8)', () => {
  const failure = (reason) => signed({ type: 'call_initiation_failure', event_timestamp: 1, data: { agent_id: 'agent-1', conversation_id: 'conv-1', failure_reason: reason, metadata: { type: 'twilio', body: {} } } });
  it('counts yesterday too when nothing was answered then either', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
    store.updateCallByConversation.mockResolvedValue({ data: [{ attempt: 2, presence_id: PRESENCE.id }], error: null });
    store.listCallsSince.mockResolvedValue({ data: [
      { presence_id: PRESENCE.id, status: 'no_answer', scheduled_for: `${yesterday}T13:00:00Z` },
      { presence_id: PRESENCE.id, status: 'no_answer', scheduled_for: `${yesterday}T14:00:00Z` },
      { presence_id: PRESENCE.id, status: 'no_answer', scheduled_for: `${today}T13:00:00Z` },
    ], error: null });

    await failure('busy');

    await vi.waitFor(() => expect(relay.relayNoAnswer).toHaveBeenCalledWith(PRESENCE, { days: 2 }));
  });

  it('is one day when yesterday she answered', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
    store.updateCallByConversation.mockResolvedValue({ data: [{ attempt: 2, presence_id: PRESENCE.id }], error: null });
    store.listCallsSince.mockResolvedValue({ data: [
      { presence_id: PRESENCE.id, status: 'completed', scheduled_for: `${yesterday}T13:00:00Z` },
      { presence_id: PRESENCE.id, status: 'no_answer', scheduled_for: `${today}T13:00:00Z` },
    ], error: null });

    await failure('busy');

    await vi.waitFor(() => expect(relay.relayNoAnswer).toHaveBeenCalledWith(PRESENCE, { days: 1 }));
  });
});
