/**
 * Connection Mapping Service
 * Manages Nango connection ID mappings per user in Supabase
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('ConnectionMapping');

export async function getConnectionId(userId, platform) {
  if (!supabaseAdmin) {
    log.info(`Database not available, returning null for ${platform}`);
    return null;
  }

  // Selects without filtering on status so the two cases stay distinguishable.
  // Filtering by status='active' made a mapping that exists but is flagged
  // needs_reconnect log the same "No mapping found" as never having connected —
  // which is how eleven days of dead Whoop ingestion read as a fresh install.
  // The upsert in saveConnectionMapping is keyed on (user_id, platform), so
  // there is at most one row and maybeSingle is safe.
  const { data, error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .select('nango_connection_id, status')
    .eq('user_id', userId)
    .eq('platform', platform)
    .maybeSingle();

  if (error) {
    log.warn(`Error reading ${platform} mapping (user: ${userId}): ${error.message}`);
    return null;
  }

  if (!data) {
    log.info(`No mapping row for ${platform} (user: ${userId}) — never connected`);
    return null;
  }

  if (data.status !== 'active') {
    log.warn(`${platform} mapping is '${data.status}', not active (user: ${userId}) — needs re-authorization`);
    return null;
  }

  return data.nango_connection_id;
}

export async function saveConnectionMapping(userId, platform, nangoConnectionId, providerConfigKey) {
  if (!supabaseAdmin) {
    log.error('Database not available');
    throw new Error('Database not available');
  }

  const { data, error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .upsert({
      user_id: userId,
      platform,
      nango_connection_id: nangoConnectionId,
      provider_config_key: providerConfigKey,
      connected_at: new Date().toISOString(),
      status: 'active'
    }, {
      onConflict: 'user_id,platform'
    })
    .select()
    .single();

  if (error) {
    log.error(`Error saving mapping:`, error);
    throw error;
  }

  log.info(`Saved mapping for ${platform} (user: ${userId})`);
  return data;
}

export async function deleteConnectionMapping(userId, platform) {
  if (!supabaseAdmin) {
    log.error('Database not available');
    throw new Error('Database not available');
  }

  const { error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .update({ status: 'disconnected' })
    .eq('user_id', userId)
    .eq('platform', platform);

  if (error) {
    log.error(`Error deleting mapping:`, error);
    throw error;
  }

  log.info(`Disconnected ${platform} for user ${userId}`);
}

export async function getAllUserConnections(userId) {
  if (!supabaseAdmin) {
    log.info('Database not available');
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    log.error(`Error getting connections:`, error);
    return [];
  }

  return data || [];
}

export async function updateLastSynced(userId, platform) {
  if (!supabaseAdmin) {
    return;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('nango_connection_mappings')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('platform', platform);
  if (updateErr) log.warn('Error updating last_synced_at:', updateErr.message);
}

// Flip a connection's status to 'needs_reconnect' so the frontend
// shows the amber pill and the user can re-authorize. Used by fetchers
// when the upstream API returns 401/403 (token revoked / scope missing).
export async function markConnectionNeedsReconnect(userId, platform, reason) {
  if (!supabaseAdmin) return;

  const { error: updateErr } = await supabaseAdmin
    .from('nango_connection_mappings')
    .update({ status: 'needs_reconnect' })
    .eq('user_id', userId)
    .eq('platform', platform);
  if (updateErr) {
    log.warn(`Failed to mark ${platform} needs_reconnect:`, updateErr.message);
    return;
  }
  log.warn(`Marked ${platform} needs_reconnect`, { userId, reason });
}

export default {
  getConnectionId,
  saveConnectionMapping,
  deleteConnectionMapping,
  getAllUserConnections,
  updateLastSynced,
  markConnectionNeedsReconnect
};
