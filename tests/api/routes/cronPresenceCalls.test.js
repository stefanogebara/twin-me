/**
 * The hourly cron that dials the presences due at this hour, with the store,
 * the brief compiler and voiceService mocked at their boundaries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.CRON_SECRET = 'cron-secret';
process.env.NODE_ENV = 'test';

const ok = (data) => ({ data, error: null });
const fail = (message) => ({ data: null, error: { message } });

// 2026-09-15 13:00Z is Tuesday 10:00 in São Paulo.
const NOW = new Date('2026-09-15T13:00:00Z');
const DUE = {
  id: 'p-1', owner_user_id: 'user-1', cared_for_name: 'Lurdes', caller_name: 'Ana', tone: '',
  elder_phone: '+5511999990000', call_hour: 10, call_days: [0, 1, 2, 3, 4, 5, 6], call_timezone: 'America/Sao_Paulo',
  elder_assent_at: '2026-09-10T10:00:00Z',
};
const NOT_YET = { ...DUE, id: 'p-2', call_hour: 15 };

const { store, log, brief, voiceService, cronLogger } = vi.hoisted(() => ({
  store: { listCallablePresences: vi.fn(), listCallsSince: vi.fn(), createCall: vi.fn() },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  brief: { compileCallBrief: vi.fn() },
  voiceService: { isEnabled: vi.fn(), startOutboundCall: vi.fn() },
  cronLogger: { logCronExecution: vi.fn() },
}));

vi.mock('../../../api/services/presenceStore.js', () => store);
vi.mock('../../../api/services/logger.js', () => ({ createLogger: () => log }));
vi.mock('../../../api/services/presenceCallBrief.js', () => brief);
vi.mock('../../../api/services/voiceService.js', () => ({ voiceService }));
vi.mock('../../../api/services/cronLogger.js', () => cronLogger);

const cronRoutes = (await import('../../../api/routes/cron-presence-calls.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cron/presence-calls', cronRoutes);
  return app;
}

const run = () => request(createApp()).post('/api/cron/presence-calls').set('Authorization', 'Bearer cron-secret');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.PRESENCE_CALLS_ENABLED = 'true';
  process.env.ELEVENLABS_PRESENCE_AGENT_ID = 'agent-1';
  process.env.ELEVENLABS_PRESENCE_PHONE_NUMBER_ID = 'phone-1';
  store.listCallablePresences.mockResolvedValue(ok([DUE, NOT_YET]));
  store.listCallsSince.mockResolvedValue(ok([]));
  store.createCall.mockResolvedValue(ok({ id: 'call-1' }));
  brief.compileCallBrief.mockResolvedValue({ prompt: 'PROMPT', firstMessage: 'Oi, Lurdes!', voiceId: null, queuedNoteIds: [] });
  voiceService.isEnabled.mockReturnValue(true);
  voiceService.startOutboundCall.mockResolvedValue({ success: true, conversationId: 'conv-1', callSid: 'CA1' });
  cronLogger.logCronExecution.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.PRESENCE_CALLS_ENABLED;
});

describe('cron presence-calls', () => {
  it('refuses without the cron secret', async () => {
    const res = await request(createApp()).post('/api/cron/presence-calls');

    expect(res.status).toBe(401);
    expect(store.listCallablePresences).not.toHaveBeenCalled();
  });

  it('does nothing, and touches no table, while dialing is disabled', async () => {
    delete process.env.PRESENCE_CALLS_ENABLED;

    const res = await run();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, skipped: 'disabled' });
    expect(store.listCallablePresences).not.toHaveBeenCalled();
  });

  it('dials the presence due at this hour with her brief, and records the call', async () => {
    const res = await run();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, dialed: 1 });
    expect(brief.compileCallBrief).toHaveBeenCalledWith(DUE, { firstCall: false });
    expect(voiceService.startOutboundCall).toHaveBeenCalledTimes(1);
    expect(voiceService.startOutboundCall).toHaveBeenCalledWith({
      agentId: 'agent-1',
      phoneNumberId: 'phone-1',
      toNumber: '+5511999990000',
      overrides: { agent: { prompt: { prompt: 'PROMPT' }, first_message: 'Oi, Lurdes!', language: 'pt-br' } },
      dynamicVariables: { presence_id: 'p-1' },
    });
    expect(store.createCall).toHaveBeenCalledWith(expect.objectContaining({
      presence_id: 'p-1', attempt: 1, status: 'dialing', direction: 'outbound', provider_conversation_id: 'conv-1', call_sid: 'CA1',
    }));
  });

  it('sends her cloned voice when the brief has one', async () => {
    brief.compileCallBrief.mockResolvedValue({ prompt: 'PROMPT', firstMessage: 'Oi', voiceId: 'voice-1', queuedNoteIds: [] });

    await run();

    expect(voiceService.startOutboundCall.mock.calls[0][0].overrides).toMatchObject({ tts: { voice_id: 'voice-1' } });
  });

  it('compiles a first-call brief for a presence she has not said yes to', async () => {
    store.listCallablePresences.mockResolvedValue(ok([{ ...DUE, elder_assent_at: null }]));

    await run();

    expect(brief.compileCallBrief).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }), { firstCall: true });
  });

  it('skips a presence already called today', async () => {
    store.listCallsSince.mockResolvedValue(ok([{ presence_id: 'p-1', status: 'completed', attempt: 1, scheduled_for: '2026-09-15T12:05:00Z', direction: 'outbound' }]));

    const res = await run();

    expect(res.body.dialed).toBe(0);
    expect(voiceService.startOutboundCall).not.toHaveBeenCalled();
  });

  it('records a failed dial and does not throw', async () => {
    voiceService.startOutboundCall.mockResolvedValue({ success: false, error: 'phone number not found' });

    const res = await run();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dialed: 0, failed: 1 });
    expect(store.createCall).toHaveBeenCalledWith(expect.objectContaining({ presence_id: 'p-1', status: 'failed', failure_reason: 'phone number not found' }));
  });

  it('answers 500 when the presences cannot be read', async () => {
    store.listCallablePresences.mockResolvedValue(fail('connection reset'));

    const res = await run();

    expect(res.status).toBe(500);
    expect(voiceService.startOutboundCall).not.toHaveBeenCalled();
  });

  it('stops at the per-run cap', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ...DUE, id: `p-${i}` }));
    store.listCallablePresences.mockResolvedValue(ok(many));

    const res = await run();

    expect(res.body.dialed).toBe(20);
    expect(voiceService.startOutboundCall).toHaveBeenCalledTimes(20);
  });
});
