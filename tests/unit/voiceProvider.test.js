/**
 * The provider adapter (Phase 2, T9): Presence asks one interface; today it is
 * ElevenLabs underneath, and a wrong name fails loudly rather than dialing nothing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const { voiceService, verify } = vi.hoisted(() => ({
  voiceService: { isEnabled: vi.fn(() => true), getConversationToken: vi.fn(), startOutboundCall: vi.fn(), getConversation: vi.fn() },
  verify: vi.fn(() => true),
}));
vi.mock('../../api/services/voiceService.js', () => ({ voiceService }));
vi.mock('../../api/services/elevenlabsWebhook.js', () => ({ verifyElevenLabsSignature: verify }));

const { voiceProvider } = await import('../../api/services/voiceProvider.js');

afterEach(() => { delete process.env.PRESENCE_VOICE_PROVIDER; });

describe('voiceProvider', () => {
  it('is ElevenLabs by default and delegates each call', async () => {
    const p = voiceProvider();
    expect(p.name).toBe('elevenlabs');
    await p.startOutboundCall({ agentId: 'a', phoneNumberId: 'n', toNumber: '+55', provider: 'sip_trunk' });
    expect(voiceService.startOutboundCall).toHaveBeenCalledWith({ agentId: 'a', phoneNumberId: 'n', toNumber: '+55', provider: 'sip_trunk' });
    await p.getConversationToken('a');
    expect(voiceService.getConversationToken).toHaveBeenCalledWith('a');
    await p.getConversation('c');
    expect(voiceService.getConversation).toHaveBeenCalledWith('c');
    expect(p.verifyWebhook('{}', 't=1,v0=x', 's')).toBe(true);
    expect(verify).toHaveBeenCalledWith('{}', 't=1,v0=x', 's', undefined);
    expect(p.isEnabled()).toBe(true);
  });

  it('reads the name from PRESENCE_VOICE_PROVIDER and refuses one it does not know', () => {
    process.env.PRESENCE_VOICE_PROVIDER = 'elevenlabs';
    expect(voiceProvider().name).toBe('elevenlabs');
    process.env.PRESENCE_VOICE_PROVIDER = 'gpt-live';
    expect(() => voiceProvider()).toThrow(/Unknown voice provider: gpt-live/);
  });
});
