/**
 * voiceService.deleteVoice. Presence keeps a revoked voice's id until a delete
 * succeeds, and ElevenLabs answers 404 for a voice it no longer has: a delete
 * that landed but timed out must not leave that id stuck forever.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { axios } = vi.hoisted(() => ({ axios: { delete: vi.fn(), get: vi.fn(), post: vi.fn() } }));

vi.mock('axios', () => ({ default: axios }));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

process.env.ELEVENLABS_API_KEY = 'test-key';
const { VoiceService } = await import('../../../api/services/voiceService.js');

const httpError = (status, detail) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { detail } } });

describe('voiceService.deleteVoice', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VoiceService();
  });

  it('deletes the voice', async () => {
    axios.delete.mockResolvedValue({ status: 200 });

    await expect(service.deleteVoice('voice-1')).resolves.toMatchObject({ success: true });
    expect(axios.delete).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/voices/voice-1', expect.anything());
  });

  it('counts a voice ElevenLabs no longer has as deleted', async () => {
    axios.delete.mockRejectedValue(httpError(404, { status: 'voice_not_found' }));

    await expect(service.deleteVoice('voice-1')).resolves.toMatchObject({ success: true });
  });

  it('reports any other failure', async () => {
    axios.delete.mockRejectedValue(httpError(500, 'internal error'));

    await expect(service.deleteVoice('voice-1')).resolves.toEqual({ success: false, error: 'internal error' });
  });
});

// The elder channel starts sessions against a private agent with a token the
// server fetches, and reads the transcript ElevenLabs holds rather than the one
// the browser sends.
describe('voiceService conversations', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VoiceService();
  });

  it('asks ElevenLabs for a conversation token for the agent', async () => {
    axios.get.mockResolvedValue({ data: { token: 'tok-1', conversation_id: 'conv-1' } });

    await expect(service.getConversationToken('agent-1')).resolves.toEqual({ success: true, token: 'tok-1', conversationId: 'conv-1' });
    expect(axios.get.mock.calls[0][0]).toBe('https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent-1');
    expect(axios.get.mock.calls[0][1]).toMatchObject({ headers: { 'xi-api-key': 'test-key' } });
  });

  it('reports a token it could not get', async () => {
    axios.get.mockRejectedValue(httpError(401, 'invalid key'));

    await expect(service.getConversationToken('agent-1')).resolves.toEqual({ success: false, error: 'invalid key' });
  });

  it('reads a conversation record', async () => {
    const record = { agent_id: 'agent-1', conversation_id: 'conv-1', status: 'done', transcript: [], metadata: { call_duration_secs: 90 } };
    axios.get.mockResolvedValue({ data: record });

    await expect(service.getConversation('conv-1')).resolves.toEqual({ success: true, conversation: record });
    expect(axios.get.mock.calls[0][0]).toBe('https://api.elevenlabs.io/v1/convai/conversations/conv-1');
  });

  it('reports a conversation ElevenLabs does not have', async () => {
    axios.get.mockRejectedValue(httpError(404, 'not found'));

    await expect(service.getConversation('conv-x')).resolves.toEqual({ success: false, error: 'not found' });
  });
});

// ElevenLabs places her call through its own Twilio integration: one number
// imported once, its id in ELEVENLABS_PRESENCE_PHONE_NUMBER_ID.
describe('voiceService.startOutboundCall', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VoiceService();
  });

  const input = {
    agentId: 'agent-1',
    phoneNumberId: 'phone-1',
    toNumber: '+5511999990000',
    overrides: { agent: { prompt: { prompt: 'PROMPT' }, first_message: 'Oi', language: 'pt-br' } },
    dynamicVariables: { presence_id: 'p-1' },
  };

  it('asks ElevenLabs to dial her with the brief as overrides and the presence id as a dynamic variable', async () => {
    axios.post.mockResolvedValue({ data: { success: true, message: 'ok', conversation_id: 'conv-1', callSid: 'CA1' } });

    await expect(service.startOutboundCall(input)).resolves.toEqual({ success: true, conversationId: 'conv-1', callSid: 'CA1' });
    expect(axios.post.mock.calls[0][0]).toBe('https://api.elevenlabs.io/v1/convai/twilio/outbound-call');
    expect(axios.post.mock.calls[0][1]).toEqual({
      agent_id: 'agent-1',
      agent_phone_number_id: 'phone-1',
      to_number: '+5511999990000',
      conversation_initiation_client_data: {
        conversation_config_override: input.overrides,
        dynamic_variables: { presence_id: 'p-1' },
      },
      telephony_call_config: { ringing_timeout_secs: 45 },
    });
    expect(axios.post.mock.calls[0][2]).toMatchObject({ headers: { 'xi-api-key': 'test-key' } });
  });

  it('reports a dial ElevenLabs refused', async () => {
    axios.post.mockResolvedValue({ data: { success: false, message: 'phone number not found', conversation_id: null, callSid: null } });

    await expect(service.startOutboundCall(input)).resolves.toEqual({ success: false, error: 'phone number not found' });
  });

  it('reports a request that failed', async () => {
    axios.post.mockRejectedValue(httpError(422, 'invalid to_number'));

    await expect(service.startOutboundCall(input)).resolves.toEqual({ success: false, error: 'invalid to_number' });
  });

  // A Brazilian number a CPF can buy (Zadarma, Directcall, Vono, Telnyx) reaches
  // ElevenLabs as a SIP trunk, which has its own outbound endpoint and returns a
  // SIP call id instead of a Twilio call sid.
  it('dials through the SIP-trunk endpoint for a SIP-trunk number', async () => {
    axios.post.mockResolvedValue({ data: { success: true, message: 'ok', conversation_id: 'conv-2', sip_call_id: 'sip-1' } });

    await expect(service.startOutboundCall({ ...input, provider: 'sip_trunk' }))
      .resolves.toEqual({ success: true, conversationId: 'conv-2', callSid: 'sip-1' });
    expect(axios.post.mock.calls[0][0]).toBe('https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call');
    expect(axios.post.mock.calls[0][1]).toMatchObject({ agent_id: 'agent-1', agent_phone_number_id: 'phone-1', to_number: '+5511999990000' });
  });
});
