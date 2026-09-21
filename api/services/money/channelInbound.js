/**
 * The money twin on a messaging channel: the half with effects.
 * =============================================================
 * One inbound message from a person in the beta. The ledger answers it, exactly as on the page:
 * answer() keeps both turns, and nothing here phrases anything the ledger did not say.
 * `deps` carries every side effect, as in attachments.js, so the tests hand in spies.
 */
import { createLogger } from '../logger.js';
import { answer, act, looksLikeInstruction } from './chat.js';
import { listChatTurns, userLanguage, saveChatTurn } from './store.js';
import { claimInbound, markReplied, setMorningMuted, keepOffers, takeOffer, recentOffers, offerSaid, releaseOffer } from './channelStore.js';
import { sendWhatsAppCtaButton, sendWhatsAppButtons, downloadWhatsAppMedia } from '../whatsappService.js';
import { readAttachment, acceptsAttachment, MAX_ATTACHMENT_BYTES } from './attachments.js';
import { ATTACHMENT_DEPS } from './attachmentDeps.js';
import { renderReply, muteIntent, channelSay, offerMessage, offerIdFrom, numberedChoice, asForwarded } from './channel.js';

const log = createLogger('MoneyChannel');
/** How many kept turns ride along as history. */
export const HISTORY_TURNS = 8;

const DEFAULT_DEPS = { answer, act, listChatTurns, userLanguage, claimInbound, markReplied, setMorningMuted, keepOffers, takeOffer, recentOffers, offerSaid, releaseOffer, sendCta: sendWhatsAppCtaButton, sendButtons: sendWhatsAppButtons, looksLikeInstruction, download: downloadWhatsAppMedia, readAttachment, saveChatTurn, attachmentDeps: ATTACHMENT_DEPS };
const APP_URL = () => String(process.env.APP_URL || process.env.VITE_APP_URL || 'https://twinme.me').replace(/\/+$/, '');

export async function handleMoneyInbound(parsed, { userId, send, deps = {} }) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const { phone, text, messageId } = parsed;

  if (!(await d.claimInbound(messageId, userId))) return { handled: true, kind: 'money_duplicate', userId };
  await Promise.resolve(d.markReplied(userId)).catch((e) => log.warn(`reply not marked: ${e.message}`));
  const language = await Promise.resolve(d.userLanguage(userId)).catch(() => null);

  const mute = muteIntent(text);
  if (mute) {
    await d.setMorningMuted(userId, mute === 'mute');
    await send(phone, channelSay(language, mute === 'mute' ? 'The morning line is off. Say start to bring it back.' : 'The morning line is back on.'));
    return { handled: true, kind: 'money_mute', userId };
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
    await Promise.resolve(d.saveChatTurn(userId, { role: 'user', text: `Sent ${filename}${note ? `. ${note}` : ''}` })).catch(() => {});
    await Promise.resolve(d.saveChatTurn(userId, { role: 'twin', text: r.said, receipts: r.receipts || null })).catch(() => {});
    await send(phone, renderReply({ text: r.said }).text);
    return { handled: true, kind: 'money_attachment', userId };
  }

  /* A tap, or a bare number while the offers are still on the screen. No model in this path:
     act() validates against the ledger as it does on the page. */
  let offerId = offerIdFrom(parsed.replyId);
  if (!offerId) {
    const n = numberedChoice(text);
    if (n) offerId = (await Promise.resolve(d.recentOffers(userId)).catch(() => []))[n - 1]?.id || null;
  }
  if (offerId) {
    const row = await d.takeOffer(userId, offerId);
    if (!row) {
      await send(phone, channelSay(language, 'That was already done.'));
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
        await Promise.resolve(d.releaseOffer(userId, row.id)).catch(() => {});
        released = true;
        said = channelSay(language, 'That could not be done right now.');
      }
    }
    await send(phone, said);
    if (!released) await Promise.resolve(d.offerSaid(row.id, said)).catch(() => {});
    return { handled: true, kind: 'money_act', userId };
  }

  if (!text) return { handled: false, kind: 'money_nothing_to_read', userId };

  const turns = await Promise.resolve(d.listChatTurns(userId, { limit: HISTORY_TURNS })).catch(() => []);
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
  const reply = await d.answer(userId, message, history);

  const out = renderReply(reply);
  await send(phone, out.text);
  if (out.link) await d.sendCta(phone, { body: channelSay(language, 'The chart is on the page.'), buttonText: channelSay(language, 'Open TwinMe'), url: out.link });
  const setup = (reply.actions || []).find((a) => a && a.kind === 'setup');
  if (setup) await d.sendCta(phone, { body: setup.label, buttonText: channelSay(language, 'Open TwinMe'), url: `${APP_URL()}${setup.href}` });
  const kept = await d.keepOffers(userId, reply.actions || []);
  const offers = offerMessage(kept, language);
  if (offers) await d.sendButtons(phone, offers);
  log.info('money channel answered', { userId, chars: out.text.length, figure: Boolean(out.link) });
  return { handled: true, kind: 'money_chat', userId };
}
