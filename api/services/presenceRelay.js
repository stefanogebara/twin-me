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
  listPresencesForMember,
  listMemberWhatsApp,
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

/**
 * Who hears about a call, and how much (README 7.3): the owner and the family
 * get the digest; a companion (acompanhante, cuidadora) gets only what needs a
 * person. The owner is read on their own too, so a presence created before the
 * member rows existed still reaches them. Returns { family: [phones], companions:
 * [phones] } or { reason } when nobody can be reached.
 */
async function recipients(presence) {
  const [members, owner] = await Promise.all([listMemberWhatsApp(presence.id), getOwnerWhatsApp(presence.owner_user_id)]);
  if (members.error) log.error('Members WhatsApp not read', { presenceId: presence.id, error: members.error.message });
  if (owner.error) log.error('Family WhatsApp not read', { presenceId: presence.id, error: owner.error.message });

  const family = [];
  const companions = [];
  if (owner.data?.channel_id) family.push(owner.data.channel_id);
  for (const m of members.data || []) {
    if (!m.phone || family.includes(m.phone) || companions.includes(m.phone)) continue;
    if (m.role === 'companion') companions.push(m.phone);
    else family.push(m.phone);
  }
  if (!family.length && !companions.length) return { reason: owner.error || members.error ? 'channel_read_failed' : 'no_channel' };
  return { family, companions };
}

/**
 * After a call: the urgent message if any, then the digest, whose message id is
 * kept so a reply maps back to this conversation.
 * @returns {Promise<{ sent: boolean, via?: 'template'|'text', messageId?: string|null, reason?: string }>}
 */
export async function relayCall(presence, conversation) {
  const who = await recipients(presence);
  if (who.reason) return { sent: false, reason: who.reason };
  const her = presence.cared_for_name?.trim() || 'ela';
  const needsList = (Array.isArray(conversation.needs_family) ? conversation.needs_family : []).map((n) => oneLine(n, 300)).filter(Boolean);

  if (conversation.urgency === 'high') {
    const needs = oneLine(needsList.join(' '), 600) || 'algo que precisa de uma pessoa agora';
    for (const phone of [...who.family, ...who.companions]) {
      const urgent = await sendFamily(
        phone, URGENT_TEMPLATE, [her, oneLine(needs)],
        `Urgente: na ligação de hoje, ${her} falou de algo que precisa de uma pessoa agora: ${needs}\nA Presença não é um serviço de emergência.`,
      );
      if (!urgent.sent) log.error('Urgent message not sent', { presenceId: presence.id, error: urgent.error });
    }
  }

  // The companion hears what needs a person, never what she shared.
  if (needsList.length) {
    for (const phone of who.companions) {
      const result = await sendWhatsAppMessage(phone, `Na ligação de hoje, ${her} falou de algo que precisa de uma pessoa: ${needsList.join(' ')}`);
      if (!result?.success) log.error('Needs line not sent to companion', { presenceId: presence.id, error: result?.error });
    }
  }

  const { text, templateParams } = composeDigest(presence, conversation);
  let first = null;
  for (const phone of who.family) {
    const digest = await sendFamily(phone, DIGEST_TEMPLATE, templateParams, text);
    if (!digest.sent) { log.error('Digest not sent', { presenceId: presence.id, conversationId: conversation.id, phone: phone.slice(-4), error: digest.error }); continue; }
    if (!first) first = digest;
  }
  if (!first) return { sent: false, reason: who.family.length ? 'send_failed' : 'no_channel' };
  // The first digest's id (the owner's, when they are linked) is the one a reply maps back to.
  if (first.messageId) {
    const { error } = await setConversationDigest(conversation.id, first.messageId);
    if (error) log.error('Digest message id not stored', { conversationId: conversation.id, error: error.message });
  }
  return { sent: true, via: first.via, messageId: first.messageId };
}

/** After the second attempt of the day went unanswered. */
export async function relayNoAnswer(presence, { days = 1 } = {}) {
  const who = await recipients(presence);
  if (who.reason) return { sent: false, reason: who.reason };
  if (!who.family.length) return { sent: false, reason: 'no_channel' };
  const her = presence.cared_for_name?.trim() || 'ela';
  // The second day in a row is different news: someone should go and look.
  const text = days >= 2
    ? `Não consegui falar com a ${her} hoje nem ontem: ${days === 2 ? 'dois dias' : `${days} dias`} sem atender. Vale ligar para ela, ou pedir para alguém passar lá.`
    : `Não consegui falar com a ${her} hoje: ela não atendeu nas duas tentativas.`;
  let first = null;
  for (const phone of who.family) {
    const result = await sendWhatsAppMessage(phone, text);
    if (!result?.success) { log.error('No-answer message not sent', { presenceId: presence.id, error: result?.error }); continue; }
    if (!first) first = result;
  }
  if (!first) return { sent: false, reason: 'send_failed' };
  return { sent: true, messageId: first.messageId || null };
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
    // Their own presence, or the one they were invited into: one and only one.
    const owned = await listActivePresencesOwnedBy(userId);
    if (owned.error) log.error('Presences lookup failed', { userId, error: owned.error.message });
    const ids = new Set((owned.data || []).map((p) => p.id));
    if (ids.size !== 1) {
      const joined = await listPresencesForMember(userId);
      if (joined.error) log.error('Memberships lookup failed', { userId, error: joined.error.message });
      for (const m of joined.data || []) if (m.presences?.status === 'active') ids.add(m.presences.id);
    }
    if (ids.size === 1) {
      presenceId = [...ids][0];
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
