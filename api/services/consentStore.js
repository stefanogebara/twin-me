/**
 * The user_consents table (audit M2-D, 2026-09-22): what a person allowed, per platform, and
 * when it was taken back. Thin builders; the route keeps its control flow.
 */
import { supabaseAdmin } from './database.js';

export function listConsents(userId) {
  return supabaseAdmin.from('user_consents').select('*').eq('user_id', userId).order('created_at', { ascending: false });
}
/** One row per person, kind and platform; granting again refreshes it and reads it back. */
export function grantConsent(row) {
  return supabaseAdmin.from('user_consents').upsert(row, { onConflict: 'user_id,consent_type,platform' }).select().single();
}
export function revokeConsent(userId, consentType, platform, patch) {
  return supabaseAdmin.from('user_consents').update(patch).eq('user_id', userId).eq('consent_type', consentType).eq('platform', platform).select().single();
}
