/**
 * What the browser extension captured (audit M2-D, 2026-09-22): rows in user_platform_data,
 * and the connection row it surfaces for a platform it saw. Thin builders; the route keeps
 * its control flow.
 */
import { supabaseAdmin } from '../database.js';
export { upsertPlatformConnection } from '../auth/authStore.js';

const CAPTURE_KEY = 'user_id,platform,data_type,source_url';

/** Insert one capture and read it back. */
export function insertCapture(row) {
  return supabaseAdmin.from('user_platform_data').insert(row).select().single();
}
/** Upsert a batch (or one row) on the capture key; answers the ids written. */
export function upsertCaptures(rows) {
  return supabaseAdmin.from('user_platform_data').upsert(rows, { onConflict: CAPTURE_KEY, ignoreDuplicates: false }).select('id');
}
/** The web captures since a moment; `newestFirst` orders them, as the digest wants. */
export function webCaptures(userId, sinceIso, { columns, limit = 300, newestFirst = false } = {}) {
  let q = supabaseAdmin.from('user_platform_data').select(columns).eq('user_id', userId).eq('platform', 'web').gte('extracted_at', sinceIso);
  if (newestFirst) q = q.order('extracted_at', { ascending: false });
  return q.limit(limit);
}
/** Everything the extension captured, newest first. */
export function extensionCaptures(userId, { limit = 500 } = {}) {
  return supabaseAdmin.from('user_platform_data').select('platform, data_type, raw_data, extracted_at').eq('user_id', userId).like('data_type', 'extension_%').order('extracted_at', { ascending: false }).limit(limit);
}
/** Delete one platform's extension captures; answers the rows deleted. */
export function deleteExtensionCaptures(userId, platform) {
  return supabaseAdmin.from('user_platform_data').delete().eq('user_id', userId).eq('platform', platform).like('data_type', 'extension_%').select();
}
