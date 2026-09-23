/**
 * The calendar connection's tables (audit M2-D, 2026-09-22): the events a sync writes and the
 * platform_connections row that says when the last sync ran. Thin builders; the route keeps
 * its control flow.
 */
import { supabaseAdmin } from '../database.js';

const PLATFORM = 'google_calendar';

/** One row per person and Google event; a re-sync refreshes it. */
export function upsertCalendarEvent(row) {
  return supabaseAdmin.from('calendar_events').upsert(row, { onConflict: 'user_id,google_event_id' });
}
export function deleteCalendarEvents(userId) {
  return supabaseAdmin.from('calendar_events').delete().eq('user_id', userId);
}
/** How the last sync went, on the connection row. */
export function markCalendarSync(userId, patch) {
  return supabaseAdmin.from('platform_connections').update(patch).eq('user_id', userId).eq('platform', PLATFORM);
}
export function findCalendarConnection(userId) {
  return supabaseAdmin.from('platform_connections').select('*').eq('user_id', userId).eq('platform', PLATFORM).single();
}
export function disconnectCalendar(userId) {
  return markCalendarSync(userId, { connected: false });
}
