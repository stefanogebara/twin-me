/**
 * The money twin on a messaging channel: the half with effects.
 * =============================================================
 * One inbound message from a person in the beta. The ledger answers it, exactly as on the page:
 * answer() keeps both turns, and nothing here phrases anything the ledger did not say.
 * `deps` carries every side effect, as in attachments.js, so the tests hand in spies.
 */
import { createLogger } from '../logger.js';
import { transcribeVoice, canHear } from './hearing.js';
import { answer, act, looksLikeInstruction } from './chat.js';
import { inPersonScope, listChatTurns, userLanguage, saveChatTurn } from './store.js';
import { claimInbound, keepOffers, takeOffer, recentOffers, offerSaid, releaseOffer, noteOfferMessage, offersOfMessage } from './channelStore.js';
import { sendWhatsAppCtaButton, sendWhatsAppButtons, downloadWhatsAppMedia, markMessageAsRead } from '../whatsappService.js';
import { readAttachment, acceptsAttachment, MAX_ATTACHMENT_BYTES } from './attachments.js';
import { ATTACHMENT_DEPS } from './attachmentDeps.js';
import { renderReply, channelSay, offerMessage, offerIdFrom, numberedChoice, asForwarded, labelOf, CHANNEL_DEADLINE_MS, reactionVerdict } from './channel.js';
import { quietly } from './quietly.js';

const log = createLogger('MoneyChannel');
/** How many kept turns ride along as history. */
export const HISTORY_TURNS = 8;
/** A private token: only the deadline timer resolves with this, never answer(). */
const DEADLINE = Symbol('money_channel_deadline');

const DEFAULT_DEPS = { markRead: (messageId) => markMessageAsRead(messageId, { typing: true }), transcribe: transcribeVoice, canHear, answer, act, listChatTurns, userLanguage, claimInbound, keepOffers, takeOffer, recentOffers, offerSaid, releaseOffer, noteOfferMessage, offersOfMessage, sendCta: sendWhatsAppCtaButton, sendButtons: sendWhatsAppButtons, looksLikeInstruction, download: downloadWhatsAppMedia, readAttachment, saveChatTurn, attachmentDeps: ATTACHMENT_DEPS, deadlineMs: CHANNEL_DEADLINE_MS };
const APP_URL = () => String(process.env.APP_URL || process.env.VITE_APP_URL || 'https://twinme.me').replace(/\/+$/, '');

class ChannelSendFailure extends Error {
  constructor(part, suppressed = false) {
    super('WhatsApp send was not confirmed.');
    this.part = part;
    this.reason = suppressed ? 'money_send_suppressed' : 'money_send_failed';
  }
}

/** The adapter can resolve failure (including a timeout), so await alone is not acceptance. */
function checkedSend(send, part) {
  return async (...args) => {
    let result;
    try { result = await send(...args); }
    catch { throw new ChannelSendFailure(part); }
    if (result?.suppressed) throw new ChannelSendFailure(part, true);
    if (result?.success !== true) throw new ChannelSendFailure(part);
    return result;
  };
}

/** The one effectful entry point, run in the person's own zone. */
export async function handleMoneyInbound(parsed, opts) {
  const scope = opts?.deps?.inPersonScope || inPersonScope;
  const deps = { ...DEFAULT_DEPS, ...opts.deps };
  try {
    return await scope(opts.userId, () => handleMoneyInboundIn(parsed, {
      ...opts,
      send: checkedSend(opts.send, 'text'),
      deps: { ...deps, sendCta: checkedSend(deps.sendCta, 'link'), sendButtons: checkedSend(deps.sendButtons, 'buttons') },
    }));
  } catch (error) {
    if (!(error instanceof ChannelSendFailure)) throw error;
    /* Stop later parts without releasing receipts/offers or inviting the pipeline's generic retry.
       A mutation may already be committed; the adapter cannot establish acceptance after a timeout.
       This reports failure only: durable result storage and delivery recovery still need an outbox. */
    log.warn('money channel send not confirmed', { userId: opts.userId, part: error.part, reason: error.reason });
    return { handled: false, reason: error.reason, part: error.part, userId: opts.userId };
  }
}

async function handleMoneyInboundIn(parsed, { userId, send, deps = {} }) {
  const startedAt = Date.now();
  const d = { ...DEFAULT_DEPS, ...deps };
  const { phone, messageId } = parsed;
  let text = parsed.text;

  if (!(await d.claimInbound(messageId, userId))) return { handled: true, kind: 'money_duplicate', userId };
  /* Read, and typing: the person sees the ledger at work while it reads; a failure here is nothing. */
  Promise.resolve(d.markRead(messageId)).catch(quietly('channel/mark-read', undefined));
  const language = await Promise.resolve(d.userLanguage(userId)).catch(quietly('channel/user-language', null));

  /* A voice note: written down, then answered as the typed words would be. */
  if (parsed.audio) {
    if (!d.canHear()) {
      await send(phone, channelSay(language, 'I cannot hear voice notes yet. Type it and I will answer.'));
      return { handled: true, kind: 'money_voice_unheard', userId };
    }
    const buffer = await d.download(parsed.audio.id);
    let heard = '';
    try { heard = buffer ? await d.transcribe(buffer, parsed.audio.mimeType || 'audio/ogg', { language }) : ''; }
    catch (e) { log.warn(`voice note failed: ${e.message}`); }
    if (!heard) {
      await send(phone, channelSay(language, 'I could not make out that voice note. Type it and I will answer.'));
      return { handled: true, kind: 'money_voice_unheard', userId };
    }
    text = heard.slice(0, 2000);
    parsed = { ...parsed, text, heard: true };
  }

  /* A photo or a document: read in memory and dropped, as on the page. Only what it said is kept. */
  const file = parsed.document || parsed.image;
  if (file) {
    const filename = parsed.document ? String(file.filename || 'file').replace(/[\r\n\t]/g, ' ').slice(0, 120) : `photo.${/png/i.test(file.mimeType || '') ? 'png' : 'jpg'}`;
    const note = String(file.caption || text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const buffer = acceptsAttachment(filename, file.mimeType || '') ? await d.download(file.id) : null;
    if (!buffer || buffer.length > MAX_ATTACHMENT_BYTES) {
      await send(phone, channelSay(language, 'That file could not be read. A photo of it would come through.'));
      return { handled: true, kind: 'money_attachment_unread', userId };
    }
    const r = await d.readAttachment(userId, { buffer, filename, mimeType: file.mimeType || '', note, language }, d.attachmentDeps);
    await Promise.resolve(d.saveChatTurn(userId, { role: 'user', text: `Sent ${filename}${note ? `. ${note}` : ''}` })).catch(quietly('channel/save-user-turn', undefined));
    await Promise.resolve(d.saveChatTurn(userId, { role: 'twin', text: r.said, receipts: r.receipts || null })).catch(quietly('channel/save-twin-turn', undefined));
    await send(phone, renderReply({ text: r.said }).text);
    return { handled: true, kind: 'money_attachment', userId };
  }

  /* A reaction on a message that carried offers: a positive reaction can approve a single offer only; a
     thumbs-down leaves them where they are, anything else is a reaction and nothing more. */
  let offerId = offerIdFrom(parsed.replyId);
  if (!offerId && parsed.reaction) {
    const verdict = reactionVerdict(parsed.reaction.emoji);
    if (verdict !== 'yes') return { handled: true, kind: verdict === 'no' ? 'money_reaction_no' : 'money_reaction', userId };
    const rows = await Promise.resolve(d.offersOfMessage(userId, parsed.reaction.messageId)).catch(quietly('channel/offers-of-message', () => []));
    if (rows.length > 1) {
      await send(phone, channelSay(language, 'Tap the specific action you want to confirm.'));
      return { handled: true, kind: 'money_reaction_ambiguous', userId };
    }
    offerId = rows[0]?.id || null;
    if (!offerId) return { handled: true, kind: 'money_reaction', userId };
  }
  /* A tap, or a bare number while the offers are still on the screen. No model in this path:
     act() validates against the ledger as it does on the page. */
  if (!offerId && !parsed.context?.forwarded) {
    const n = numberedChoice(text);
    if (n) offerId = (await Promise.resolve(d.recentOffers(userId)).catch(quietly('channel/recent-offers', () => [])))[n - 1]?.id || null;
  }
  if (offerId) {
    const row = await d.takeOffer(userId, offerId);
    if (!row) {
      await send(phone, channelSay(language, 'That confirmation has expired or was already used.'));
      return { handled: true, kind: 'money_act_stale', userId };
    }
    let said;
    let released = false;
    try {
      said = (await d.act(userId, row.action)).said;
    } catch (e) {
      log.warn(`act failed: ${e.message}`);
      if (e.status === 400) {
        /* The ledger's own refusal: the offer stays taken, its own words are sent. */
        said = e.message;
      } else {
        /* Not the ledger's refusal — a transient failure. Give the offer back so a retry tap works. */
        await Promise.resolve(d.releaseOffer(userId, row.id)).catch(quietly('channel/release-offer', undefined));
        released = true;
        said = channelSay(language, 'That could not be done right now.');
      }
    }
    await send(phone, said);
    if (!released) await Promise.resolve(d.offerSaid(userId, row.id, said)).catch(quietly('channel/offer-said', undefined));
    return { handled: true, kind: 'money_act', userId };
  }

  if (!text) return { handled: false, kind: 'money_nothing_to_read', userId };

  const turns = await Promise.resolve(d.listChatTurns(userId, { limit: HISTORY_TURNS })).catch(quietly('channel/history', () => []));
  const history = (turns || []).map((t) => ({ role: t.role, text: t.text }));

  let message = text;
  if (parsed.context?.forwarded) {
    const f = asForwarded(text, d.looksLikeInstruction);
    if (f.refused) {
      await send(phone, channelSay(language, 'A forwarded message is read as data. That one reads like an instruction, so it was left alone.'));
      return { handled: true, kind: 'money_forward_refused', userId };
    }
    message = f.message;
  }
  const answerPromise = d.answer(userId, message, history);
  const timeLeft = Math.max(1000, d.deadlineMs - (Date.now() - startedAt));
  let timer;
  const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(DEADLINE), timeLeft); });
  const reply = await Promise.race([answerPromise, deadline]);
  if (reply === DEADLINE) {
    answerPromise.catch(quietly('channel/late-answer', undefined)); // a late reply must not become an unhandled rejection
    log.warn('money channel answer timed out', { userId, elapsedMs: Date.now() - startedAt });
    await send(phone, channelSay(language, 'That took too long to answer. Ask it again.'));
    return { handled: true, kind: 'money_deadline', userId };
  }
  clearTimeout(timer);

  const out = renderReply(reply);
  await send(phone, out.text);
  if (out.link) await d.sendCta(phone, { body: channelSay(language, 'The chart is on the page.'), buttonText: channelSay(language, 'Open TwinMe'), url: out.link });
  const setup = (reply.actions || []).find((a) => a && a.kind === 'setup');
  if (setup) await d.sendCta(phone, { body: labelOf(setup), buttonText: channelSay(language, 'Open TwinMe'), url: `${APP_URL()}${setup.href}` });
  const kept = await d.keepOffers(userId, reply.actions || []);
  const offers = offerMessage(kept, language);
  if (offers) {
    const sent = await d.sendButtons(phone, offers);
    if (sent?.messageId) await Promise.resolve(d.noteOfferMessage(userId, kept.map((k) => k.id), sent.messageId)).catch(quietly('channel/note-offer-message', undefined));
  }
  log.info('money channel answered', { userId, chars: out.text.length, figure: Boolean(out.link) });
  return { handled: true, kind: 'money_chat', userId };
}
