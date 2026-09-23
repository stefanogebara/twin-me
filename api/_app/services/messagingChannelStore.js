/**
 * The messaging_channels table (audit M2-D, 2026-09-22): which WhatsApp number a person
 * linked, and whether it is on. Thin builders; the routes keep their control flow.
 */
import { supabaseAdmin } from './database.js';

const WHATSAPP = 'whatsapp';

/** Link, or relink, a number; one row per person and channel. */
export function linkWhatsApp(userId, phone) {
  return supabaseAdmin.from('messaging_channels').upsert({ user_id: userId, channel: WHATSAPP, channel_id: phone, is_enabled: true }, { onConflict: 'user_id,channel' });
}
export function whatsAppLink(userId) {
  return supabaseAdmin.from('messaging_channels').select('channel_id, is_enabled, created_at').eq('user_id', userId).eq('channel', WHATSAPP).single();
}
export function unlinkWhatsApp(userId) {
  return supabaseAdmin.from('messaging_channels').delete().eq('user_id', userId).eq('channel', WHATSAPP);
}
/** The number alone, or null: for a message that is sent only if there is somewhere to send it. */
export function whatsAppNumber(userId) {
  return supabaseAdmin.from('messaging_channels').select('channel_id').eq('user_id', userId).eq('channel', WHATSAPP).maybeSingle();
}
/** Everyone with a linked number, for a cron that writes to each. */
export function whatsAppChannels({ limit = 500 } = {}) {
  return supabaseAdmin.from('messaging_channels').select('user_id, channel_id').eq('channel', WHATSAPP).limit(limit);
}
