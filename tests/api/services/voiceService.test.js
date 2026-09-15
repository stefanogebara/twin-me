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
