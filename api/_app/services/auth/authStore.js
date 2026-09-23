/**
 * The sign-in tables, in one place.
 *
 * auth-simple.js held 36 direct table calls across users, user_refresh_tokens,
 * magic_link_tokens, pending_auth_codes and platform_connections (audit M2-D, 2026-09-22).
 * Each is a named read or write here; the route keeps its control flow and its error
 * handling, because every function returns the same thenable builder the route awaited
 * before, with the same `{ data, error }` shape. What moved is the knowledge of which table,
 * which columns and which filter make each fact.
 */
import { supabaseAdmin } from '../database.js';

/* ------------------------------------------------------------------------ users */

/** One user by email; `maybe` answers null instead of an error when there is none. */
export function findUserByEmail(email, columns, { maybe = false } = {}) {
  const q = supabaseAdmin.from('users').select(columns).eq('email', email);
  return maybe ? q.maybeSingle() : q.single();
}
export function findUserById(id, columns, { maybe = false } = {}) {
  const q = supabaseAdmin.from('users').select(columns).eq('id', id);
  return maybe ? q.maybeSingle() : q.single();
}
/** The pre-2026 single refresh hash kept on the user row, for sessions from before the token table. */
export function findUserByLegacyRefreshHash(hash, columns) {
  return supabaseAdmin.from('users').select(columns).eq('refresh_token_hash', hash).single();
}
export function findUserByVerificationToken(token, columns) {
  return supabaseAdmin.from('users').select(columns).eq('email_verification_token', token).single();
}
/** Insert and read back; `columns` defaults to every column, as `.select()` did. */
export function createUser(row, columns = '*') {
  return supabaseAdmin.from('users').insert(row).select(columns).single();
}
export function updateUser(id, patch) {
  return supabaseAdmin.from('users').update(patch).eq('id', id);
}
/** Clear the legacy hash only if it is still the one being signed out. */
export function clearLegacyRefreshHash(id, hash) {
  return supabaseAdmin.from('users').update({ refresh_token_hash: null }).eq('id', id).eq('refresh_token_hash', hash);
}

/* --------------------------------------------------------------- refresh tokens */

export function insertRefreshToken(row) {
  return supabaseAdmin.from('user_refresh_tokens').insert(row);
}
export function findRefreshToken(hash) {
  return supabaseAdmin.from('user_refresh_tokens').select('id, user_id, expires_at').eq('token_hash', hash).single();
}
export function deleteRefreshTokenById(id) {
  return supabaseAdmin.from('user_refresh_tokens').delete().eq('id', id);
}
export function deleteRefreshTokenByHash(hash) {
  return supabaseAdmin.from('user_refresh_tokens').delete().eq('token_hash', hash);
}
/** Rotate only if the row still carries the hash that was read: two refreshes racing rotate once. */
export function rotateRefreshToken(id, hash, patch) {
  return supabaseAdmin.from('user_refresh_tokens').update(patch).eq('id', id).eq('token_hash', hash).select('id');
}

/* ------------------------------------------------------------------ magic links */

export function insertMagicLink(row) {
  return supabaseAdmin.from('magic_link_tokens').insert(row);
}
export function findMagicLink(hash) {
  return supabaseAdmin.from('magic_link_tokens').select('id, email, invite_code, expires_at, consumed_at').eq('token_hash', hash).maybeSingle();
}
/** Consume once: the `is null` guard makes a second click a no-op. */
export function consumeMagicLink(id) {
  return supabaseAdmin.from('magic_link_tokens').update({ consumed_at: new Date().toISOString() }).eq('id', id).is('consumed_at', null);
}

/* ------------------------------------------------------- pending auth codes */

export function insertPendingAuthCode(row) {
  return supabaseAdmin.from('pending_auth_codes').insert(row);
}
export function findPendingAuthCode(code) {
  return supabaseAdmin.from('pending_auth_codes').select('*').eq('code', code).single();
}
export function deletePendingAuthCode(code) {
  return supabaseAdmin.from('pending_auth_codes').delete().eq('code', code);
}

/* ------------------------------------------------------- platform connections */

/** One row per user and platform; a reconnect replaces the tokens. */
export function upsertPlatformConnection(row) {
  return supabaseAdmin.from('platform_connections').upsert(row, { onConflict: 'user_id,platform' });
}
