/**
 * Operations reads and retention writes (audit M2-D, 2026-09-22): the health probes, the
 * cron ledger the monitor scans, and the tables whose old rows are deleted on a schedule.
 * Thin builders; the routes keep their control flow and their timeouts.
 */
import { supabaseAdmin } from './database.js';

/* ------------------------------------------------------------------- health */

/** The cheapest read there is: one id from a table that always has rows. */
export function pingRead() {
  return supabaseAdmin.from('user_memories').select('id').limit(1);
}
export function memoryCount() {
  return supabaseAdmin.from('user_memories').select('*', { count: 'exact', head: true });
}
export function lastIngestionRun() {
  return supabaseAdmin.from('ingestion_health_log').select('run_at, duration_ms, users_processed, observations_stored, errors').order('run_at', { ascending: false }).limit(1).single();
}
export function llmCallsSince(sinceIso) {
  return supabaseAdmin.from('llm_usage_log').select('*', { count: 'exact', head: true }).gte('created_at', sinceIso);
}
/** How many memories the WhatsApp import left behind for a person. */
export function whatsAppMemoryCount(userId) {
  return supabaseAdmin.from('user_memories').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('memory_type', 'platform_data').like('content', '%WhatsApp%');
}

/* ----------------------------------------------------------------- the crons */

/** Every recorded run since a moment, newest first. */
export function recentCronExecutions(sinceIso, { limit = 2000 } = {}) {
  return supabaseAdmin.from('cron_executions').select('job_name, status, result_data, executed_at, error_message').gte('executed_at', sinceIso).order('executed_at', { ascending: false }).limit(limit);
}

/* ----------------------------------------------------------------- retention */

/** Usage rows older than the cutoff go; answers what went and how many. */
export function deleteLlmUsageBefore(cutoffIso) {
  return supabaseAdmin.from('llm_usage_log').delete({ count: 'exact' }).lt('created_at', cutoffIso).select('created_at', { count: 'exact' });
}
