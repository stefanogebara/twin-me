/**
 * The account's own tables (audit M2-D, 2026-09-22): the profile row it reads and writes,
 * the deletion, and the export that reads every table a person's data lives in. The users
 * table's reads and writes are shared with the sign-in store so there is one place that
 * knows the column names.
 */
import { supabaseAdmin } from '../database.js';
export { findUserById, updateUser } from '../auth/authStore.js';

/** The route answers 503 rather than a false empty account when the client never came up. */
export const databaseAvailable = () => Boolean(supabaseAdmin);

/** The row goes; every related table follows by CASCADE. */
export function deleteUser(id) {
  return supabaseAdmin.from('users').delete().eq('id', id);
}

/**
 * Everything the person is owed on export, table by table, in the order the route names them.
 * Each entry is the raw `{ data, error }` the table answered; the route shapes the file.
 */
export function exportReads(userId) {
  return [
    supabaseAdmin.from('users').select('id, email, name, first_name, last_name, avatar_url, created_at, updated_at').eq('id', userId).single(),
    supabaseAdmin.from('platform_connections').select('platform, status, connected_at, last_sync_at').eq('user_id', userId),
    supabaseAdmin.from('user_platform_data').select('platform, data_type, data, extracted_at').eq('user_id', userId).order('extracted_at', { ascending: false }).limit(50000),
    supabaseAdmin.from('personality_scores').select('openness, conscientiousness, extraversion, agreeableness, neuroticism, data_sources, created_at').eq('user_id', userId),
    supabaseAdmin.from('twin_conversations').select('id, title, context_type, message_count, created_at, updated_at').eq('user_id', userId).order('created_at', { ascending: false }),
    supabaseAdmin.from('enriched_profiles').select('full_name, company, title, location, bio, interests, social_links, discovered_photo, is_confirmed, created_at').eq('user_id', userId),
    supabaseAdmin.from('onboarding_calibration').select('conversation_history, insights, archetype_hint, personality_summary, completed_at').eq('user_id', userId),
    supabaseAdmin.from('user_memories').select('memory_type, content, source, importance, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50000),
    supabaseAdmin.from('big_five_scores').select('openness, conscientiousness, extraversion, agreeableness, neuroticism, assessment_type, created_at').eq('user_id', userId),
    supabaseAdmin.from('behavioral_patterns').select('pattern_type, description, confidence, platforms, first_observed, last_observed').eq('user_id', userId).limit(200),
    supabaseAdmin.from('reflection_history').select('reflection_type, content, platforms_used, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    supabaseAdmin.from('privacy_settings').select('cluster_visibility, sharing_preferences, updated_at').eq('user_id', userId),
  ];
}
/** The messages of the conversations the export found; a subquery in `.eq` is not possible. */
export function exportMessages(conversationIds) {
  return supabaseAdmin.from('twin_messages').select('conversation_id, role, content, created_at').in('conversation_id', conversationIds).order('created_at', { ascending: false }).limit(50000);
}
