/**
 * The money twin on a messaging channel: the half with effects.
 * =============================================================
 * One inbound message from a person in the beta. The ledger answers it, exactly as on the page:
 * answer() keeps both turns, and nothing here phrases anything the ledger did not say.
 * `deps` carries every side effect, as in attachments.js, so the tests hand in spies.
 */
import { createLogger } from '../logger.js';
import { answer } from './chat.js';
import { listChatTurns, userLanguage } from './store.js';
import { claimInbound, markReplied, setMorningMuted } from './channelStore.js';
import { sendWhatsAppCtaButton } from '../whatsappService.js';
import { renderReply, muteIntent, channelSay } from './channel.js';

const log = createLogger('MoneyChannel');
/** How many kept turns ride along as history. */
export const HISTORY_TURNS = 8;

const DEFAULT_DEPS = { answer, listChatTurns, userLanguage, claimInbound, markReplied, setMorningMuted, sendCta: sendWhatsAppCtaButton };

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

  if (!text) return { handled: false, kind: 'money_nothing_to_read', userId };

  const turns = await Promise.resolve(d.listChatTurns(userId, { limit: HISTORY_TURNS })).catch(() => []);
  const history = (turns || []).map((t) => ({ role: t.role, text: t.text }));
  const reply = await d.answer(userId, text, history);

  const out = renderReply(reply);
  await send(phone, out.text);
  if (out.link) await d.sendCta(phone, { body: channelSay(language, 'The chart is on the page.'), buttonText: channelSay(language, 'Open TwinMe'), url: out.link });
  log.info('money channel answered', { userId, chars: out.text.length, figure: Boolean(out.link) });
  return { handled: true, kind: 'money_chat', userId };
}
