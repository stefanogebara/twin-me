/**
 * The voice provider behind Presence (plan 2026-09-15-presence-forward, README
 * 5.3, Phase 2 T9). One interface for what Presence asks of a provider: a token
 * for her browser session, an outbound call to her phone, the conversation it
 * holds afterwards, and the signature on its webhook. ElevenLabs is the only
 * implementation; the bake-off against GPT-Live adds a second one here, and the
 * cron, her page and the webhook route stay as they are.
 *
 * PRESENCE_VOICE_PROVIDER names the implementation ('elevenlabs' by default).
 */
import { voiceService } from './voiceService.js';
import { verifyElevenLabsSignature } from './elevenlabsWebhook.js';

const elevenlabs = {
  name: 'elevenlabs',
  /** A key is configured; without it there is no token and no call. */
  isEnabled: () => voiceService.isEnabled(),
  /** A short-lived token her browser starts the private agent's session with. */
  getConversationToken: (agentId) => voiceService.getConversationToken(agentId),
  /** Place a call to her phone; resolves { success, conversationId, callSid } or { success: false, error }. */
  startOutboundCall: (call) => voiceService.startOutboundCall(call),
  /** The conversation the provider holds after a call: transcript, status, metadata. */
  getConversation: (conversationId) => voiceService.getConversation(conversationId),
  /** Whether a webhook body was signed by the provider for us. */
  verifyWebhook: (rawBody, header, secret, now) => verifyElevenLabsSignature(rawBody, header, secret, now),
};

const PROVIDERS = { elevenlabs };

export function voiceProvider(name = process.env.PRESENCE_VOICE_PROVIDER || 'elevenlabs') {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown voice provider: ${name}`);
  return provider;
}
