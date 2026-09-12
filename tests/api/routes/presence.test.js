/**
 * Error paths of api/routes/presence.js, with presenceStore mocked at its
 * boundary. Each test names a write or read whose failure used to be ignored
 * (or to destroy data) and pins what the route does with it now: fail the
 * request before anything irreversible happens, or log it when the request's
 * main write has already landed and a retry would duplicate it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const PRESENCE_ID = '11111111-1111-4111-8111-111111111111';
const ASK_ID = '22222222-2222-4222-8222-222222222222';

const ok = (data) => ({ data, error: null });
const fail = (message) => ({ data: null, error: { message } });

const { store, log, voiceService, llm } = vi.hoisted(() => {
  const names = [
    'findLivePresenceById', 'getLatestPresenceForOwner', 'createPresence', 'updatePresence',
    'setCallToken', 'setPresenceTone', 'getReadinessSources', 'getResumeDetails', 'getOverview',
    'listActivePeople', 'replaceActivePeople', 'addPeople', 'enrichPerson', 'saveFact', 'addFacts',
    'supersedeFamilyIntroduction', 'findOpenAsk', 'dismissFact', 'supersedeFact', 'queueNote',
    'getConversationTranscript', 'recordConsent', 'appendConsent', 'getLatestVoiceConsent',
    'getLatestVoiceConsentKind', 'getVoiceState', 'getClonedVoiceId', 'recordVoiceStatus',
    'recordVoiceSample', 'recordVoiceRevoked',
  ];
  return {
    store: Object.fromEntries(names.map((name) => [name, vi.fn()])),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    voiceService: {
      speechToTextEnabled: true,
      speechToText: vi.fn(),
      isEnabled: vi.fn(),
      addSamplesToVoice: vi.fn(),
      cloneVoice: vi.fn(),
      deleteVoice: vi.fn(),
    },
    llm: { complete: vi.fn() },
  };
});

vi.mock('../../../api/services/presenceStore.js', () => store);
vi.mock('../../../api/services/logger.js', () => ({ createLogger: () => log }));
vi.mock('../../../api/services/voiceService.js', () => ({ voiceService }));
vi.mock('../../../api/services/llmGateway.js', () => ({ complete: llm.complete, TIER_ANALYSIS: 'analysis' }));
// authenticateUser reads email_verified from users; the store is the only other DB client.
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { email_verified: true, created_at: new Date().toISOString() }, error: null }),
    })),
  },
  serverDb: {},
}));

const presenceRoutes = (await import('../../../api/routes/presence.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/presence', presenceRoutes);
  return app;
}

const token = jwt.sign({ id: USER_ID }, 'test-secret', { expiresIn: '1h' });
const api = (method, path) => request(createApp())[method](`/api/presence${path}`).set('Authorization', `Bearer ${token}`);
const audio = Buffer.from('fake webm bytes');

const OWNED = {
  id: PRESENCE_ID, owner_user_id: USER_ID, status: 'draft', cared_for_name: 'Lurdes', caller_name: 'Ana', tone: '',
};

function extraction(overrides = {}) {
  return {
    content: JSON.stringify({
      people: [],
      anchors: [{ kind: 'place', value: 'The beach house in Ubatuba' }],
      boundaries: ['Never mention the hospital'],
      facts: [],
      tone_hint: '',
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(store)) fn.mockResolvedValue(ok(null));
  store.findLivePresenceById.mockResolvedValue(ok(OWNED));
  store.listActivePeople.mockResolvedValue(ok([]));
  store.addFacts.mockResolvedValue(ok([{ created_at: '2026-09-11T10:00:00.000001+00:00' }]));
  store.getReadinessSources.mockResolvedValue({
    people: { count: 0, error: null }, facts: ok([]), notes: { count: 0, error: null },
    conversations: { count: 0, error: null }, voice: ok(null), error: null,
  });
  store.getResumeDetails.mockResolvedValue({ people: ok([]), voice: ok(null), facts: ok([]), error: null });
  store.getOverview.mockResolvedValue({
    presence: ok(OWNED), people: ok([]), voice: ok(null), facts: ok([]), notes: ok([]), conversations: ok([]), error: null,
  });
  store.getLatestVoiceConsentKind.mockResolvedValue(ok([{ kind: 'own_voice' }]));
  store.getVoiceState.mockResolvedValue(ok(null));
  store.findOpenAsk.mockResolvedValue(ok({ id: ASK_ID, question: 'Who is "Teresa"? She mentioned them in conversation.' }));
  voiceService.isEnabled.mockReturnValue(true);
  voiceService.deleteVoice.mockResolvedValue({ success: true });
  llm.complete.mockResolvedValue(extraction());
});

afterEach(() => {
  delete process.env.PRESENCE_VOICE_CLONE_ENABLED;
});

describe('PUT /:id/people — the family map is replaced in one step', () => {
  it('hands the cleaned map to replaceActivePeople and returns the rows it saved', async () => {
    const saved = [{ id: 'p-1', name: 'Teresa', relation: 'sister', called_by: 'Tete' }];
    store.replaceActivePeople.mockResolvedValue(ok(saved));

    const res = await api('put', `/${PRESENCE_ID}/people`).send({
      people: [{ name: '  Teresa ', relation: 'sister', called_by: 'Tete' }, { name: '   ' }],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, people: saved });
    expect(store.replaceActivePeople).toHaveBeenCalledWith(PRESENCE_ID, [
      { name: 'Teresa', relation: 'sister', called_by: 'Tete' },
    ]);
  });

  it('clears the map through the same call when the list is empty', async () => {
    store.replaceActivePeople.mockResolvedValue(ok([]));

    const res = await api('put', `/${PRESENCE_ID}/people`).send({ people: [] });

    expect(res.status).toBe(200);
    expect(res.body.people).toEqual([]);
    expect(store.replaceActivePeople).toHaveBeenCalledWith(PRESENCE_ID, []);
  });

  it('answers 500 when the replacement fails', async () => {
    store.replaceActivePeople.mockResolvedValue(fail('violates check constraint'));

    const res = await api('put', `/${PRESENCE_ID}/people`).send({ people: [{ name: 'Teresa' }] });

    expect(res.status).toBe(500);
  });
});

describe('POST /:id/facts — one fact per (kind, question)', () => {
  it('saves through saveFact and returns the fact it wrote', async () => {
    const fact = { id: 'f-1', kind: 'anchor', question: 'A place that matters to her', answer: 'Ubatuba' };
    store.saveFact.mockResolvedValue(ok(fact));

    const res = await api('post', `/${PRESENCE_ID}/facts`).send({
      kind: 'anchor', question: 'A place that matters to her', answer: 'Ubatuba',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, fact });
    expect(store.saveFact).toHaveBeenCalledWith(PRESENCE_ID, {
      kind: 'anchor', question: 'A place that matters to her', answer: 'Ubatuba', source: 'family_onboarding',
    });
  });

  it('answers 500 when the save fails', async () => {
    store.saveFact.mockResolvedValue(fail('deadlock detected'));

    const res = await api('post', `/${PRESENCE_ID}/facts`).send({ kind: 'tone', question: 'q', answer: 'a' });

    expect(res.status).toBe(500);
  });
});

describe('POST /:id/about — a new description replaces the old introduction safely', () => {
  it('keeps the old introduction when the new facts fail to save', async () => {
    store.addFacts.mockResolvedValue(fail('violates check constraint'));

    const res = await api('post', `/${PRESENCE_ID}/about`).send({ text: 'She loves the beach.' });

    expect(res.status).toBe(500);
    expect(store.supersedeFamilyIntroduction).not.toHaveBeenCalled();
  });

  it('retires only introductions older than the one it just stored, after storing it', async () => {
    const res = await api('post', `/${PRESENCE_ID}/about`).send({ text: 'She loves the beach.' });

    expect(res.status).toBe(201);
    expect(store.supersedeFamilyIntroduction).toHaveBeenCalledWith(PRESENCE_ID, '2026-09-11T10:00:00.000001+00:00');
    expect(store.addFacts.mock.invocationCallOrder[0])
      .toBeLessThan(store.supersedeFamilyIntroduction.mock.invocationCallOrder[0]);
  });

  it('still answers 201, and logs, when the older introduction cannot be retired', async () => {
    store.supersedeFamilyIntroduction.mockResolvedValue(fail('timeout'));

    const res = await api('post', `/${PRESENCE_ID}/about`).send({ text: 'She loves the beach.' });

    expect(res.status).toBe(201);
    expect(log.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: 'timeout' }));
  });

  it('answers 500 and adds nobody when the family map cannot be read', async () => {
    store.listActivePeople.mockResolvedValue(fail('connection reset'));
    llm.complete.mockResolvedValue(extraction({ people: [{ name: 'Teresa', relation: 'sister' }] }));

    const res = await api('post', `/${PRESENCE_ID}/about`).send({ text: 'Her sister Teresa.' });

    expect(res.status).toBe(500);
    expect(store.addPeople).not.toHaveBeenCalled();
  });

  it('answers 500, before saving facts, when a new person cannot be saved', async () => {
    store.addPeople.mockResolvedValue(fail('violates check constraint'));
    llm.complete.mockResolvedValue(extraction({ people: [{ name: 'Teresa', relation: 'sister' }] }));

    const res = await api('post', `/${PRESENCE_ID}/about`).send({ text: 'Her sister Teresa.' });

    expect(res.status).toBe(500);
    expect(store.addFacts).not.toHaveBeenCalled();
  });

  it('answers 500 when an existing person cannot be filled in', async () => {
    store.listActivePeople.mockResolvedValue(ok([{ id: 'p-1', name: 'Teresa', relation: '', called_by: '' }]));
    store.enrichPerson.mockResolvedValue(fail('timeout'));
    llm.complete.mockResolvedValue(extraction({ people: [{ name: 'Teresa', relation: 'sister' }] }));

    const res = await api('post', `/${PRESENCE_ID}/about`).send({ text: 'Her sister Teresa.' });

    expect(res.status).toBe(500);
    expect(store.addFacts).not.toHaveBeenCalled();
  });

  it('still answers 201, and logs, when the tone hint cannot be saved', async () => {
    store.setPresenceTone.mockResolvedValue(fail('timeout'));
    llm.complete.mockResolvedValue(extraction({ tone_hint: 'Storytelling' }));

    const res = await api('post', `/${PRESENCE_ID}/about`).send({ text: 'She tells stories.' });

    expect(res.status).toBe(201);
    expect(store.setPresenceTone).toHaveBeenCalledWith(PRESENCE_ID, 'Storytelling');
    expect(log.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: 'timeout' }));
  });
});

describe('POST /:id/voice-samples', () => {
  const upload = () => api('post', `/${PRESENCE_ID}/voice-samples`)
    .field('sample_seconds', '12')
    .attach('audio', audio, { filename: 'sample.webm', contentType: 'audio/webm' });

  it('answers 500, not "consent required", when the consent read fails', async () => {
    store.getLatestVoiceConsentKind.mockResolvedValue(fail('connection reset'));

    const res = await upload();

    expect(res.status).toBe(500);
    expect(store.recordVoiceSample).not.toHaveBeenCalled();
  });

  it('answers 500, and clones nothing, when the current voice state cannot be read', async () => {
    process.env.PRESENCE_VOICE_CLONE_ENABLED = 'true';
    store.getVoiceState.mockResolvedValue(fail('connection reset'));

    const res = await upload();

    expect(res.status).toBe(500);
    expect(voiceService.cloneVoice).not.toHaveBeenCalled();
    expect(store.recordVoiceSample).not.toHaveBeenCalled();
  });

  it('keeps the ready voice and does not count a sample the voice did not take', async () => {
    process.env.PRESENCE_VOICE_CLONE_ENABLED = 'true';
    store.getVoiceState.mockResolvedValue(ok({ status: 'ready', sample_count: 2, sample_seconds: 40, elevenlabs_voice_id: 'voice-1' }));
    voiceService.addSamplesToVoice.mockResolvedValue({ success: false, error: 'quota exceeded' });

    const res = await upload();

    expect(res.status).toBe(201);
    expect(store.recordVoiceSample).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ready', elevenlabs_voice_id: 'voice-1', sample_count: 2, sample_seconds: 40,
    }));
  });

  it('counts the sample when the voice took it', async () => {
    process.env.PRESENCE_VOICE_CLONE_ENABLED = 'true';
    store.getVoiceState.mockResolvedValue(ok({ status: 'ready', sample_count: 2, sample_seconds: 40, elevenlabs_voice_id: 'voice-1' }));
    voiceService.addSamplesToVoice.mockResolvedValue({ success: true });

    const res = await upload();

    expect(res.status).toBe(201);
    expect(store.recordVoiceSample).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ready', elevenlabs_voice_id: 'voice-1', sample_count: 3, sample_seconds: 52,
    }));
  });

  // presence_voice: CHECK (sample_count BETWEEN 0 AND 20), CHECK (sample_seconds BETWEEN 0 AND 3600).
  it('stops counting at 20 samples, the most presence_voice holds', async () => {
    store.getVoiceState.mockResolvedValue(ok({ status: 'queued', sample_count: 20, sample_seconds: 400, elevenlabs_voice_id: null }));

    const res = await upload();

    expect(res.status).toBe(201);
    expect(store.recordVoiceSample).toHaveBeenCalledWith(expect.objectContaining({ sample_count: 20, sample_seconds: 412 }));
  });

  it('stops adding seconds at 3600, the most presence_voice holds', async () => {
    store.getVoiceState.mockResolvedValue(ok({ status: 'queued', sample_count: 5, sample_seconds: 3595, elevenlabs_voice_id: null }));

    const res = await upload();

    expect(res.status).toBe(201);
    expect(store.recordVoiceSample).toHaveBeenCalledWith(expect.objectContaining({ sample_count: 6, sample_seconds: 3600 }));
  });

  it('deletes a revoked voice still at ElevenLabs before cloning a new one', async () => {
    process.env.PRESENCE_VOICE_CLONE_ENABLED = 'true';
    store.getVoiceState.mockResolvedValue(ok({ status: 'revoked', sample_count: 0, sample_seconds: 0, elevenlabs_voice_id: 'voice-old' }));
    voiceService.cloneVoice.mockResolvedValue({ success: true, voiceId: 'voice-new' });

    const res = await upload();

    expect(res.status).toBe(201);
    expect(voiceService.deleteVoice).toHaveBeenCalledWith('voice-old');
    expect(voiceService.deleteVoice.mock.invocationCallOrder[0])
      .toBeLessThan(voiceService.cloneVoice.mock.invocationCallOrder[0]);
    expect(store.recordVoiceSample).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready', elevenlabs_voice_id: 'voice-new' }));
  });

  it('answers 502, and clones nothing, when the revoked voice cannot be deleted first', async () => {
    process.env.PRESENCE_VOICE_CLONE_ENABLED = 'true';
    store.getVoiceState.mockResolvedValue(ok({ status: 'revoked', sample_count: 0, sample_seconds: 0, elevenlabs_voice_id: 'voice-old' }));
    voiceService.deleteVoice.mockResolvedValue({ success: false, error: 'timeout' });

    const res = await upload();

    expect(res.status).toBe(502);
    expect(voiceService.cloneVoice).not.toHaveBeenCalled();
    expect(store.recordVoiceSample).not.toHaveBeenCalled();
  });

  it('carries an undeleted voice id forward when the sample is only queued', async () => {
    store.getVoiceState.mockResolvedValue(ok({ status: 'revoked', sample_count: 0, sample_seconds: 0, elevenlabs_voice_id: 'voice-old' }));

    const res = await upload();

    expect(res.status).toBe(201);
    expect(store.recordVoiceSample).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued', elevenlabs_voice_id: 'voice-old' }));
  });
});

describe('POST /:id/voice-revoke — the withdrawal is recorded before it is acted on', () => {
  it('answers 500 and deletes nothing when the revocation record cannot be written', async () => {
    store.getClonedVoiceId.mockResolvedValue(ok({ elevenlabs_voice_id: 'voice-1' }));
    store.appendConsent.mockResolvedValue(fail('connection reset'));

    const res = await api('post', `/${PRESENCE_ID}/voice-revoke`);

    expect(res.status).toBe(500);
    expect(voiceService.deleteVoice).not.toHaveBeenCalled();
    expect(store.recordVoiceRevoked).not.toHaveBeenCalled();
  });

  it('answers 500 and changes nothing when the cloned voice id cannot be read', async () => {
    store.getClonedVoiceId.mockResolvedValue(fail('connection reset'));

    const res = await api('post', `/${PRESENCE_ID}/voice-revoke`);

    expect(res.status).toBe(500);
    expect(store.appendConsent).not.toHaveBeenCalled();
    expect(store.recordVoiceRevoked).not.toHaveBeenCalled();
  });

  it('records the withdrawal, then deletes the voice, then marks it revoked', async () => {
    store.getClonedVoiceId.mockResolvedValue(ok({ elevenlabs_voice_id: 'voice-1' }));
    store.recordVoiceRevoked.mockResolvedValue(ok({ status: 'revoked' }));

    const res = await api('post', `/${PRESENCE_ID}/voice-revoke`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, voice: { status: 'revoked' } });
    expect(store.appendConsent).toHaveBeenCalledWith(expect.objectContaining({
      presence_id: PRESENCE_ID, user_id: USER_ID, kind: 'own_voice_revoked',
    }));
    const order = [store.appendConsent, voiceService.deleteVoice, store.recordVoiceRevoked]
      .map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(store.recordVoiceRevoked).toHaveBeenCalledWith(expect.objectContaining({ elevenlabs_voice_id: null }));
  });

  // A voice whose id is dropped can never be deleted at ElevenLabs. The id stays
  // until a delete succeeds: the next revoke, or the next clone, tries again.
  it('keeps the voice id, marked revoked, when ElevenLabs does not delete it', async () => {
    store.getClonedVoiceId.mockResolvedValue(ok({ elevenlabs_voice_id: 'voice-1' }));
    voiceService.deleteVoice.mockResolvedValue({ success: false, error: 'timeout' });
    store.recordVoiceRevoked.mockResolvedValue(ok({ status: 'revoked' }));

    const res = await api('post', `/${PRESENCE_ID}/voice-revoke`);

    expect(res.status).toBe(200);
    expect(store.recordVoiceRevoked).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked', elevenlabs_voice_id: 'voice-1' }));
    expect(log.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ presenceId: PRESENCE_ID, error: 'timeout' }));
  });

  it('keeps the voice id, marked revoked, when the voice service is not configured', async () => {
    store.getClonedVoiceId.mockResolvedValue(ok({ elevenlabs_voice_id: 'voice-1' }));
    voiceService.isEnabled.mockReturnValue(false);

    const res = await api('post', `/${PRESENCE_ID}/voice-revoke`);

    expect(res.status).toBe(200);
    expect(voiceService.deleteVoice).not.toHaveBeenCalled();
    expect(store.recordVoiceRevoked).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked', elevenlabs_voice_id: 'voice-1' }));
  });
});

describe('POST /:id/asks/:factId — the card closes only after its answer is saved', () => {
  const answer = (body) => api('post', `/${PRESENCE_ID}/asks/${ASK_ID}`).send(body);

  it('answers 500, not 404, when the ask cannot be read', async () => {
    store.findOpenAsk.mockResolvedValue(fail('connection reset'));

    const res = await answer({ action: 'dismiss' });

    expect(res.status).toBe(500);
  });

  it('answers 500 when a dismissal is not saved', async () => {
    store.dismissFact.mockResolvedValue(fail('timeout'));

    const res = await answer({ action: 'dismiss' });

    expect(res.status).toBe(500);
  });

  it('answers 500 and adds nobody when the family map cannot be read', async () => {
    store.listActivePeople.mockResolvedValue(fail('connection reset'));

    const res = await answer({ relation: 'sister' });

    expect(res.status).toBe(500);
    expect(store.addPeople).not.toHaveBeenCalled();
    expect(store.supersedeFact).not.toHaveBeenCalled();
  });

  it('answers 500 and leaves the card open when the person is not saved', async () => {
    store.addPeople.mockResolvedValue(fail('violates check constraint'));

    const res = await answer({ relation: 'sister' });

    expect(res.status).toBe(500);
    expect(store.supersedeFact).not.toHaveBeenCalled();
  });

  it('answers 500 and leaves the card open when an existing person is not filled in', async () => {
    store.listActivePeople.mockResolvedValue(ok([{ id: 'p-1', name: 'Teresa', relation: '', called_by: '' }]));
    store.enrichPerson.mockResolvedValue(fail('timeout'));

    const res = await answer({ relation: 'sister' });

    expect(res.status).toBe(500);
    expect(store.supersedeFact).not.toHaveBeenCalled();
  });

  it('answers 500 and leaves the card open when the "who they are" fact is not saved', async () => {
    store.addFacts.mockResolvedValue(fail('violates check constraint'));

    const res = await answer({ relation: 'sister' });

    expect(res.status).toBe(500);
    expect(store.supersedeFact).not.toHaveBeenCalled();
  });

  it('answers 500 when the card itself cannot be closed', async () => {
    store.supersedeFact.mockResolvedValue(fail('timeout'));

    const res = await answer({ relation: 'sister' });

    expect(res.status).toBe(500);
  });

  it('saves the person, then the fact, then closes the card', async () => {
    const res = await answer({ relation: 'sister', called_by: 'Tete' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, person: { name: 'Teresa', relation: 'sister', called_by: 'Tete' } });
    expect(store.addPeople).toHaveBeenCalledWith({ presence_id: PRESENCE_ID, name: 'Teresa', relation: 'sister', called_by: 'Tete' });
    const order = [store.addPeople, store.addFacts, store.supersedeFact].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(store.supersedeFact).toHaveBeenCalledWith(ASK_ID);
  });
});

describe('parallel reads fail the request instead of reading as empty', () => {
  it('GET /mine answers 500 when a resume query fails', async () => {
    store.getLatestPresenceForOwner.mockResolvedValue(ok(OWNED));
    store.getResumeDetails.mockResolvedValue({ people: fail('timeout'), voice: ok(null), facts: ok([]), error: { message: 'timeout' } });

    const res = await api('get', '/mine');

    expect(res.status).toBe(500);
  });

  it('GET /:id/overview answers 500, not a null presence, when a dashboard query fails', async () => {
    store.getOverview.mockResolvedValue({
      presence: fail('timeout'), people: ok([]), voice: ok(null), facts: ok([]), notes: ok([]), conversations: ok([]),
      error: { message: 'timeout' },
    });

    const res = await api('get', `/${PRESENCE_ID}/overview`);

    expect(res.status).toBe(500);
  });

  it('GET /:id/readiness answers 500 when a readiness query fails', async () => {
    store.getReadinessSources.mockResolvedValue({
      people: { count: null, error: { message: 'timeout' } }, facts: ok([]), notes: { count: 0, error: null },
      conversations: { count: 0, error: null }, voice: ok(null), error: { message: 'timeout' },
    });

    const res = await api('get', `/${PRESENCE_ID}/readiness`);

    expect(res.status).toBe(500);
  });

  it('POST /:id/call-link answers 500, not "not ready", when a readiness query fails', async () => {
    store.getReadinessSources.mockResolvedValue({
      people: { count: null, error: { message: 'timeout' } }, facts: ok([]), notes: { count: 0, error: null },
      conversations: { count: 0, error: null }, voice: ok(null), error: { message: 'timeout' },
    });

    const res = await api('post', `/${PRESENCE_ID}/call-link`);

    expect(res.status).toBe(500);
    expect(store.setCallToken).not.toHaveBeenCalled();
  });
});
