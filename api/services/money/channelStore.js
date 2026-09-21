/**
 * What the channel keeps: the messages it has seen, and whether the morning line is wanted.
 * Offers and sends are added beside these by the tasks that need them.
 */
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { NUMBERED_REPLY_WINDOW_MS, MAX_BUTTONS, moneyChannelUserIds } from './channel.js';

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

/** The offers of one reply, kept so a tap can find them. The setup offer is a link, not an act. */
export async function keepOffers(userId, actions) {
  const rows = (actions || []).filter((a) => a && a.kind && a.kind !== 'setup').slice(0, MAX_BUTTONS)
    .map((action, position) => ({ user_id: userId, position, action }));
  if (!rows.length) return [];
  const { data, error } = await supabaseAdmin.from('money_channel_offers').insert(rows).select('id, position, action');
  if (error) { log.warn(`offers not kept: ${error.message}`); return []; }
  return (data || []).sort((a, b) => a.position - b.position);
}

/** Takes an offer once. Null when it was taken already or is not this person's. */
export async function takeOffer(userId, offerId) {
  const { data, error } = await supabaseAdmin.from('money_channel_offers').update({ taken_at: new Date().toISOString() })
    .eq('user_id', userId).eq('id', offerId).is('taken_at', null).select('id, action').maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/** The untaken offers of the newest reply, in the order shown, while a bare number can still mean them. */
export async function recentOffers(userId, now = new Date()) {
  const since = new Date(now.getTime() - NUMBERED_REPLY_WINDOW_MS).toISOString();
  const { data } = await supabaseAdmin.from('money_channel_offers').select('id, position, action, created_at')
    .eq('user_id', userId).is('taken_at', null).gte('created_at', since).order('created_at', { ascending: false }).limit(MAX_BUTTONS * 2);
  const rows = data || [];
  if (!rows.length) return [];
  const newest = rows[0].created_at;
  return rows.filter((r) => r.created_at === newest).sort((a, b) => a.position - b.position);
}

export async function offerSaid(offerId, said) {
  await supabaseAdmin.from('money_channel_offers').update({ said: String(said || '').slice(0, 1000) }).eq('id', offerId);
}

/** Gives an offer back after a failure that was not the ledger's own refusal, so it can be tapped again. */
export async function releaseOffer(userId, offerId) {
  const { error } = await supabaseAdmin.from('money_channel_offers').update({ taken_at: null }).eq('user_id', userId).eq('id', offerId);
  if (error) log.warn(`offer not released: ${error.message}`);
}

/** Beta people with a linked, enabled WhatsApp number who have not said stop. */
export async function morningRecipients() {
  const ids = moneyChannelUserIds();
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from('messaging_channels').select('user_id, channel_id, preferences').eq('channel', 'whatsapp').eq('is_enabled', true).in('user_id', ids);
  if (error) throw new Error(error.message);
  return (data || []).filter((r) => r.channel_id && !(r.preferences || {}).money_morning_muted).map((r) => ({ userId: r.user_id, phone: r.channel_id }));
}

/** Claims today's line for one person. Null when it was already claimed: one line a day, whatever runs twice. */
export async function claimMorningSend(userId, day, { template, language }) {
  const { data, error } = await supabaseAdmin.from('money_channel_sends').insert({ user_id: userId, day, kind: 'morning', template, language }).select('id').maybeSingle();
  if (!error) return data?.id || null;
  if (error.code === '23505') return null;
  throw new Error(error.message);
}

export async function finishMorningSend(id, { providerMessageId = null, error = null } = {}) {
  await supabaseAdmin.from('money_channel_sends').update({ provider_message_id: providerMessageId, error: error ? String(error).slice(0, 500) : null, sent_at: error ? null : new Date().toISOString() }).eq('id', id);
}
