/**
 * What the channel keeps: the messages it has seen, and consent to answer on WhatsApp.
 * Offers are added beside these by the tasks that need them.
 */
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { NUMBERED_REPLY_WINDOW_MS, MAX_BUTTONS } from './channel.js';

const log = createLogger('MoneyChannelStore');

/** True the first time a provider message id is seen. A missing identity or failed receipt prevents effects. */
export async function claimInbound(messageId, userId) {
  if (!messageId) throw new Error('A provider message id is required.');
  const { error } = await supabaseAdmin.from('money_channel_inbound').insert({ message_id: String(messageId).slice(0, 200), user_id: userId });
  if (!error) return true;
  if (error.code === '23505') return false;
  /* Never execute an edit when durable duplicate protection is unavailable. */
  log.warn(`inbound not recorded: ${error.message}`);
  throw new Error('Could not record the incoming message.');
}

/** When the person agreed to answers on WhatsApp. Kept once. */
export async function recordOptIn(userId, now = new Date()) {
  const { data } = await supabaseAdmin.from('messaging_channels').select('id, preferences').eq('user_id', userId).eq('channel', 'whatsapp').limit(1);
  const row = data?.[0];
  if (!row || (row.preferences || {}).money_opt_in_at) return false;
  const { error } = await supabaseAdmin.from('messaging_channels').update({ preferences: { ...(row.preferences || {}), money_opt_in_at: now.toISOString() } }).eq('id', row.id);
  if (error) throw new Error(error.message);
  return true;
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

/** The message the offers rode in, once the send has answered with its id. */
export async function noteOfferMessage(userId, offerIds, messageId) {
  const ids = (offerIds || []).filter(Boolean);
  if (!ids.length || !messageId) return;
  const { error } = await supabaseAdmin.from('money_channel_offers').update({ message_id: String(messageId).slice(0, 200) }).eq('user_id', userId).in('id', ids);
  if (error) log.warn(`offer message not noted: ${error.message}`);
}

/** All offers that rode in one message, including consumed ones: a reaction must never change meaning. */
export async function offersOfMessage(userId, messageId) {
  if (!messageId) return [];
  const { data, error } = await supabaseAdmin.from('money_channel_offers').select('id, position, action')
    .eq('user_id', userId).eq('message_id', String(messageId)).order('position', { ascending: true }).limit(MAX_BUTTONS);
  if (error) { log.warn(`offers of message not read: ${error.message}`); return []; }
  return data || [];
}

/** Takes an offer once. Null when consumed, expired, or not this person's. */
export async function takeOffer(userId, offerId, now = new Date()) {
  const since = new Date(now.getTime() - NUMBERED_REPLY_WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin.from('money_channel_offers').update({ taken_at: now.toISOString() })
    .eq('user_id', userId).eq('id', offerId).is('taken_at', null).gte('created_at', since).select('id, action').maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/** The original offers of the newest reply, in the order shown, while a bare number can still mean them. */
export async function recentOffers(userId, now = new Date()) {
  const since = new Date(now.getTime() - NUMBERED_REPLY_WINDOW_MS).toISOString();
  const { data } = await supabaseAdmin.from('money_channel_offers').select('id, position, action, created_at')
    .eq('user_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(MAX_BUTTONS * 2);
  const rows = data || [];
  if (!rows.length) return [];
  const newest = rows[0].created_at;
  return rows.filter((r) => r.created_at === newest).sort((a, b) => a.position - b.position);
}

export async function offerSaid(userId, offerId, said) {
  await supabaseAdmin.from('money_channel_offers').update({ said: String(said || '').slice(0, 1000) }).eq('id', offerId).eq('user_id', userId);
}

/** Gives an offer back after a failure that was not the ledger's own refusal, so it can be tapped again. */
export async function releaseOffer(userId, offerId) {
  const { error } = await supabaseAdmin.from('money_channel_offers').update({ taken_at: null }).eq('user_id', userId).eq('id', offerId);
  if (error) log.warn(`offer not released: ${error.message}`);
}
