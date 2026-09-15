/**
 * Presence relay: the family's side of a call, on WhatsApp.
 * ==========================================================
 * After each call the family member gets one message, three lines at most:
 * what she shared, what needs a person (urgent items first), and that a reply
 * becomes a note for her next call. An urgent call gets its own message first.
 * A reply to the digest (Meta `context.id`), or a message starting with
 * "nota:" / "recado:", is queued as a note.
 *
 * Sends go through whatsappService (Kapso, Meta Cloud API): a template lands
 * outside the 24-hour service window and is tried first; plain text is the
 * fallback inside the window. Templates are registered by
 * scripts/presence/register-templates.mjs and reviewed by Meta.
 */

import { sendWhatsAppMessage, sendWhatsAppTemplate } from './whatsappService.js';
import {
  getOwnerWhatsApp,
  setConversationDigest,
  findConversationByDigestMessageId,
  listActivePresencesOwnedBy,
  queueNote,
} from './presenceStore.js';
import { createLogger } from './logger.js';

const log = createLogger('PresenceRelay');

export const DIGEST_TEMPLATE = 'presence_call_digest';
export const URGENT_TEMPLATE = 'presence_urgent';
const TEMPLATE_LANGUAGE = 'pt_BR';
const PARAM_MAX = 300;
const NOTE_PREFIX = /^\s*(nota|recado)\s*:\s*/i;
const NOTE_SAVED = 'Anotado. Ela ouve na próxima ligação.';
const NOTE_FAILED = 'Não deu para anotar agora. Tente de novo em instantes.';

/** One line, no newlines, capped: what a WhatsApp template parameter may hold. */
function oneLine(text, max = PARAM_MAX) {
  return String(text || '').replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

/** The digest's text and template parameters. Pure. */
export function composeDigest(presence, conversation) {
  const her = presence.cared_for_name?.trim() || 'ela';
  const summary = oneLine(conversation.summary, 1000);
  const needs = (Array.isArray(conversation.needs_family) ? conversation.needs_family : []).map((n) => oneLine(n, 300)).filter(Boolean);
  const needsLine = needs.join(' ');
  const lines = [`Ela contou que: ${summary}`];
  if (needs.length) lines.push(`Precisa de você: ${needsLine}`);
  lines.push('Responda esta mensagem e ela ouve na próxima ligação.');
  return {
    text: lines.join('\n'),
    templateParams: [her, oneLine(summary), needs.length ? oneLine(needsLine) : 'nada desta vez'],
  };
}

/** Template first (lands outside the window), plain text inside it. */
async function sendFamily(phone, template, params, text) {
  const viaTemplate = await sendWhatsAppTemplate(phone, template, TEMPLATE_LANGUAGE, params);
  if (viaTemplate?.success) return { sent: true, via: 'template', messageId: viaTemplate.messageId || null };
  const viaText = await sendWhatsAppMessage(phone, text);
  if (viaText?.success) return { sent: true, via: 'text', messageId: viaText.messageId || null };
  return { sent: false, error: viaText?.error || viaTemplate?.error || 'send failed' };
}

/** The family member's number, or the reason there is none. */
async function familyPhone(presence) {
  const { data, error } = await getOwnerWhatsApp(presence.owner_user_id);
  if (error) {
    log.error('Family WhatsApp not read', { presenceId: presence.id, error: error.message });
    return { reason: 'channel_read_failed' };
  }
  if (!data?.channel_id) return { reason: 'no_channel' };
  return { phone: data.channel_id };
}

/**
 * After a call: the urgent message if any, then the digest, whose message id is
 * kept so a reply maps back to this conversation.
 * @returns {Promise<{ sent: boolean, via?: 'template'|'text', messageId?: string|null, reason?: string }>}
 */
export async function relayCall(presence, conversation) {
  const family = await familyPhone(presence);
  if (!family.phone) return { sent: false, reason: family.reason };
  const her = presence.cared_for_name?.trim() || 'ela';

  if (conversation.urgency === 'high') {
    const needs = oneLine((conversation.needs_family || []).join(' '), 600) || 'algo que precisa de uma pessoa agora';
    const urgent = await sendFamily(
      family.phone, URGENT_TEMPLATE, [her, oneLine(needs)],
      `Urgente: na ligação de hoje, ${her} falou de algo que precisa de uma pessoa agora: ${needs}\nA Presença não é um serviço de emergência.`,
    );
    if (!urgent.sent) log.error('Urgent message not sent', { presenceId: presence.id, error: urgent.error });
  }

  const { text, templateParams } = composeDigest(presence, conversation);
  const digest = await sendFamily(family.phone, DIGEST_TEMPLATE, templateParams, text);
  if (!digest.sent) {
    log.error('Digest not sent', { presenceId: presence.id, conversationId: conversation.id, error: digest.error });
    return { sent: false, reason: 'send_failed' };
  }
  if (digest.messageId) {
    const { error } = await setConversationDigest(conversation.id, digest.messageId);
    if (error) log.error('Digest message id not stored', { conversationId: conversation.id, error: error.message });
  }
  return { sent: true, via: digest.via, messageId: digest.messageId };
}

/** After the second attempt of the day went unanswered. */
export async function relayNoAnswer(presence) {
  const family = await familyPhone(presence);
  if (!family.phone) return { sent: false, reason: family.reason };
  const her = presence.cared_for_name?.trim() || 'ela';
  const result = await sendWhatsAppMessage(family.phone, `Não consegui falar com a ${her} hoje: ela não atendeu nas duas tentativas.`);
  if (!result?.success) {
    log.error('No-answer message not sent', { presenceId: presence.id, error: result?.error });
    return { sent: false, reason: 'send_failed' };
  }
  return { sent: true, messageId: result.messageId || null };
}

/**
 * A family member's WhatsApp message, before the rest of the inbound pipeline:
 * a reply to a digest, or "nota: ..." from someone with one presence, becomes a
 * note for her next call. Resolves the reply to send, or null when it is not ours.
 */
export async function handleFamilyReply({ userId, text, contextMessageId }) {
  const body = String(text || '').trim();
  if (!body) return null;

  let presenceId = null;
  let noteBody = body;
  if (contextMessageId) {
    const { data, error } = await findConversationByDigestMessageId(contextMessageId);
    if (error) log.error('Digest lookup failed', { userId, error: error.message });
    if (data?.presence_id) presenceId = data.presence_id;
  }
  if (!presenceId && NOTE_PREFIX.test(body)) {
    const { data, error } = await listActivePresencesOwnedBy(userId);
    if (error) log.error('Presences lookup failed', { userId, error: error.message });
    if (data?.length === 1) {
      presenceId = data[0].id;
      noteBody = body.replace(NOTE_PREFIX, '').trim();
    }
  }
  if (!presenceId || !noteBody) return null;

  const { error } = await queueNote({ presence_id: presenceId, author_user_id: userId, body: noteBody.slice(0, 2000) });
  if (error) {
    log.error('Note from WhatsApp not queued', { userId, presenceId, error: error.message });
    return NOTE_FAILED;
  }
  log.info('Note queued from WhatsApp', { userId, presenceId, viaReply: Boolean(contextMessageId) });
  return NOTE_SAVED;
}
