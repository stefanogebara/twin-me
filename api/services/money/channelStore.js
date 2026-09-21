/**
 * What the channel keeps: the messages it has seen, and whether the morning line is wanted.
 * Offers and sends are added beside these by the tasks that need them.
 */
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('MoneyChannelStore');

/** True the first time a provider message id is seen. A message with no id is always new. */
export async function claimInbound(messageId, userId) {
  if (!messageId) return true;
  const { error } = await supabaseAdmin.from('money_channel_inbound').insert({ message_id: String(messageId).slice(0, 200), user_id: userId });
  if (!error) return true;
  if (error.code === '23505') return false;
  /* A database that is down must not make a person repeat themselves. */
  log.warn(`inbound not recorded: ${error.message}`);
  return true;
}

/** The latest line sent in the last day, not yet answered, is now answered. */
export async function markReplied(userId, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin.from('money_channel_sends').select('id').eq('user_id', userId).is('replied_at', null).gte('sent_at', since).order('sent_at', { ascending: false }).limit(1);
  const id = data?.[0]?.id;
  if (id) await supabaseAdmin.from('money_channel_sends').update({ replied_at: now.toISOString() }).eq('id', id);
}

export async function setMorningMuted(userId, muted) {
  const { data } = await supabaseAdmin.from('messaging_channels').select('id, preferences').eq('user_id', userId).eq('channel', 'whatsapp').limit(1);
  const row = data?.[0];
  if (!row) return;
  const { error } = await supabaseAdmin.from('messaging_channels').update({ preferences: { ...(row.preferences || {}), money_morning_muted: Boolean(muted) } }).eq('id', row.id);
  if (error) throw new Error(error.message);
}
