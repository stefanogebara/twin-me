/**
 * The beta tables (audit M2-D, 2026-09-22): applications, the waitlist, and the user rows a
 * sign-up creates. Thin builders; the route keeps its control flow.
 */
import { supabaseAdmin } from '../database.js';
export { findUserByEmail, findUserById, createUser } from '../auth/authStore.js';

export function findApplicationByEmail(email, columns) {
  return supabaseAdmin.from('beta_applications').select(columns).eq('email', email).single();
}
export function insertApplication(row) {
  return supabaseAdmin.from('beta_applications').insert(row);
}
export function updateApplicationByEmail(email, patch) {
  return supabaseAdmin.from('beta_applications').update(patch).eq('email', email);
}
export function updateApplicationById(id, patch) {
  return supabaseAdmin.from('beta_applications').update(patch).eq('id', id);
}
/** One waitlist row per address; a second sign-up refreshes the name and source. */
export function upsertWaitlist(row) {
  return supabaseAdmin.from('beta_waitlist').upsert(row, { onConflict: 'email' });
}

/* ------------------------------------------------------------------ feedback */

export function insertFeedback(row) {
  return supabaseAdmin.from('beta_feedback').insert(row);
}
/** Every note, newest first, with who wrote it. */
export function listFeedbackWithAuthors() {
  return supabaseAdmin.from('beta_feedback').select('*, user:users!beta_feedback_user_id_fkey(id, email, first_name)').order('created_at', { ascending: false });
}
