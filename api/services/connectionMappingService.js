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

  const { data, error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .select('nango_connection_id')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    log.info(`No mapping found for ${platform} (user: ${userId})`);
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

export default {
  getConnectionId,
  saveConnectionMapping,
  deleteConnectionMapping,
  getAllUserConnections,
  updateLastSynced
};
