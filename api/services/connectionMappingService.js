/**
 * Connection Mapping Service
 * Manages Nango connection ID mappings per user in Supabase
 */

import { supabaseAdmin } from './database.js';

export async function getConnectionId(userId, platform) {
  if (!supabaseAdmin) {
    console.log(`[ConnectionMapping] Database not available, returning null for ${platform}`);
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
    console.log(`[ConnectionMapping] No mapping found for ${platform} (user: ${userId})`);
    return null;
  }

  return data.nango_connection_id;
}

export async function saveConnectionMapping(userId, platform, nangoConnectionId, providerConfigKey) {
  if (!supabaseAdmin) {
    console.error('[ConnectionMapping] Database not available');
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
    console.error(`[ConnectionMapping] Error saving mapping:`, error);
    throw error;
  }

  console.log(`[ConnectionMapping] Saved mapping for ${platform} (user: ${userId})`);
  return data;
}

export async function deleteConnectionMapping(userId, platform) {
  if (!supabaseAdmin) {
    console.error('[ConnectionMapping] Database not available');
    throw new Error('Database not available');
  }

  const { error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .update({ status: 'disconnected' })
    .eq('user_id', userId)
    .eq('platform', platform);

  if (error) {
    console.error(`[ConnectionMapping] Error deleting mapping:`, error);
    throw error;
  }

  console.log(`[ConnectionMapping] Disconnected ${platform} for user ${userId}`);
}

export async function getAllUserConnections(userId) {
  if (!supabaseAdmin) {
    console.log('[ConnectionMapping] Database not available');
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error(`[ConnectionMapping] Error getting connections:`, error);
    return [];
  }

  return data || [];
}

export async function updateLastSynced(userId, platform) {
  if (!supabaseAdmin) {
    return;
  }

  await supabaseAdmin
    .from('nango_connection_mappings')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('platform', platform);
}

export default {
  getConnectionId,
  saveConnectionMapping,
  deleteConnectionMapping,
  getAllUserConnections,
  updateLastSynced
};
