/**
 * callService — double-gated outbound calling (Vapi).
 * isCallingEnabled (env + flag), buildCallPrompt (AI disclosure), placeCall
 * (not-configured guard, quota, Vapi payload + row), handleCallWebhook
 * (finalize + notify), mapEndedReasonToStatus.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let countReturn = 0;
let userRow = { name: 'Stefano' };
let twinRow = null;
let insertId = 'call-1';
const inserts = [];
const updates = [];

const axiosPostMock = vi.fn();
vi.mock('axios', () => ({ default: { post: (...a) => axiosPostMock(...a) } }));

vi.mock('../../../api/services/database.js', () => {
  function from(table) {
    const b = { _table: table };
    b.select = () => b;
    b.eq = () => b;
    b.gte = () => Promise.resolve({ count: countReturn, error: null });
    b.limit = () => b;
    b.insert = (payload) => { inserts.push({ table, payload }); return b; };
    b.update = (patch) => { updates.push({ table, patch }); return b; };
    b.single = () => Promise.resolve({ data: table === 'users' ? userRow : { id: insertId }, error: null });
    b.maybeSingle = () => Promise.resolve({ data: twinRow, error: null });
    return b;
  }
  return { supabaseAdmin: { from } };
});

let flagsReturn = { phone_calls: true };
vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: () => Promise.resolve(flagsReturn),
}));

const deliverInsightMock = vi.fn();
vi.mock('../../../api/services/messageRouter.js', () => ({
  deliverInsight: (...a) => deliverInsightMock(...a),
}));

const { isCallingEnabled, buildCallPrompt, placeCall, handleCallWebhook, mapEndedReasonToStatus } =
  await import('../../../api/services/callService.js');

const enableEnv = () => { process.env.VAPI_API_KEY = 'vk'; process.env.VAPI_PHONE_NUMBER_ID = 'pn'; };
const disableEnv = () => { delete process.env.VAPI_API_KEY; delete process.env.VAPI_PHONE_NUMBER_ID; };

beforeEach(() => {
  countReturn = 0; twinRow = null; insertId = 'call-1';
  inserts.length = 0; updates.length = 0;
  axiosPostMock.mockReset(); deliverInsightMock.mockReset();
  flagsReturn = { phone_calls: true };
});

describe('isCallingEnabled', () => {
  it('false without env', async () => { disableEnv(); expect(await isCallingEnabled('u1')).toBe(false); });
  it('false when flag not explicitly true', async () => { enableEnv(); flagsReturn = {}; expect(await isCallingEnabled('u1')).toBe(false); });
  it('true with env + flag', async () => { enableEnv(); flagsReturn = { phone_calls: true }; expect(await isCallingEnabled('u1')).toBe(true); });
});

describe('buildCallPrompt', () => {
  it('discloses AI + includes the goal', () => {
    const p = buildCallPrompt({ userName: 'Stefano', goal: 'book a table for 4 at 8pm', toName: 'Trattoria' });
    expect(p).toMatch(/AI assistant/i);
    expect(p).toContain('book a table for 4 at 8pm');
    expect(p).toContain('Stefano');
  });
});

describe('mapEndedReasonToStatus', () => {
  it('maps no-answer/busy/voicemail → no_answer', () => {
    for (const r of ['customer-did-not-answer', 'busy', 'voicemail']) expect(mapEndedReasonToStatus(r)).toBe('no_answer');
  });
  it('maps failures → failed', () => { expect(mapEndedReasonToStatus('pipeline-error')).toBe('failed'); });
  it('defaults to completed', () => { expect(mapEndedReasonToStatus('customer-ended-call')).toBe('completed'); });
});

describe('placeCall', () => {
  it('returns calling_not_configured and inserts nothing when disabled', async () => {
    disableEnv();
    const out = await placeCall('u1', { toNumber: '+5511999', goal: 'x' });
    expect(out.error).toBe('calling_not_configured');
    expect(inserts.length).toBe(0);
  });

  it('places a call: inserts a row, posts the Vapi payload, marks dialing', async () => {
    enableEnv();
    axiosPostMock.mockResolvedValue({ data: { id: 'vapi-123' } });
    const out = await placeCall('u1', { toNumber: '+5511988887777', toName: 'Dentist', goal: 'book a cleaning next week' });

    expect(out.success).toBe(true);
    expect(out.providerCallId).toBe('vapi-123');
    expect(inserts[0].payload).toMatchObject({ user_id: 'u1', to_number: '+5511988887777', to_name: 'Dentist', provider: 'vapi', status: 'queued' });

    const [url, body, cfg] = axiosPostMock.mock.calls[0];
    expect(url).toContain('/call');
    expect(body.phoneNumberId).toBe('pn');
    expect(body.customer.number).toBe('+5511988887777');
    expect(body.assistant.model.messages[0].content).toMatch(/AI assistant/i);
    expect(body.assistant.maxDurationSeconds).toBe(300);
    expect(body.metadata.twinCallId).toBe('call-1');
    expect(cfg.headers.Authorization).toBe('Bearer vk');
    expect(updates.some(u => u.patch.status === 'dialing' && u.patch.provider_call_id === 'vapi-123')).toBe(true);
  });

  it('enforces the daily quota', async () => {
    enableEnv();
    countReturn = 10;
    const out = await placeCall('u1', { toNumber: '+5511999', goal: 'x' });
    expect(out.error).toBe('daily_quota_exceeded');
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('marks the row failed when Vapi rejects', async () => {
    enableEnv();
    axiosPostMock.mockRejectedValue({ response: { data: { message: 'bad number' } } });
    const out = await placeCall('u1', { toNumber: '+5511999', goal: 'x' });
    expect(out.success).toBe(false);
    expect(updates.some(u => u.patch.status === 'failed')).toBe(true);
  });
});

describe('handleCallWebhook', () => {
  it('ignores non-terminal event types', async () => {
    const out = await handleCallWebhook({ message: { type: 'status-update' } });
    expect(out.handled).toBe(false);
    expect(out.reason).toContain('ignored_type');
  });

  it('finalizes the call and notifies the user on end-of-call-report', async () => {
    twinRow = { id: 'call-1', user_id: 'u1', goal: 'book a table', to_name: 'Trattoria', status: 'dialing' };
    const out = await handleCallWebhook({
      message: {
        type: 'end-of-call-report',
        call: { id: 'vapi-123', metadata: { twinCallId: 'call-1' } },
        endedReason: 'customer-ended-call',
        durationSeconds: 92,
        analysis: { summary: 'Booked a table for 4 at 8pm under Stefano.' },
        artifact: { transcript: 'Assistant: Hi, I am an AI assistant...' },
      },
    });
    expect(out.handled).toBe(true);
    expect(out.status).toBe('completed');
    const patch = updates.find(u => u.patch.outcome)?.patch;
    expect(patch.outcome).toContain('Booked a table');
    expect(patch.duration_seconds).toBe(92);
    expect(deliverInsightMock).toHaveBeenCalledWith('u1', expect.objectContaining({ category: 'call' }));
  });

  it('is idempotent — skips an already-finalized call', async () => {
    twinRow = { id: 'call-1', user_id: 'u1', goal: 'g', to_name: null, status: 'completed' };
    const out = await handleCallWebhook({ message: { type: 'end-of-call-report', call: { id: 'v1', metadata: { twinCallId: 'call-1' } } } });
    expect(out.handled).toBe(false);
    expect(out.reason).toBe('already_finalized');
    expect(deliverInsightMock).not.toHaveBeenCalled();
  });
});
