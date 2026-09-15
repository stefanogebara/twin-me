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
