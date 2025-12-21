/**
 * Database Helper Methods for Gmail Integration
 *
 * Add these methods to your existing database.js service
 * or import them where needed
 */

import { supabase } from '../config/supabase.js';

/**
 * Upsert (insert or update) a platform connection
 */
export async function upsertPlatformConnection(connectionData) {
  const {
    userId,
    platform,
    accountId,
    connectedAt,
    status,
    metadata
  } = connectionData;

  try {
    const { data, error } = await supabase
      .from('platform_connections')
      .upsert({
        user_id: userId,
        platform: platform,
        account_id: accountId,
        connected_at: connectedAt,
        status: status || 'connected',
        metadata: metadata || {},
        last_sync: null
      }, {
        onConflict: 'user_id,platform'
      })
      .select()
      .single();

    if (error) {
      console.error('Database error upserting platform connection:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error upserting platform connection:', error);
    throw error;
  }
}

/**
 * Get a platform connection for a user
 */
export async function getPlatformConnection(userId, platform) {
  try {
    const { data, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Database error getting platform connection:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error getting platform connection:', error);
    throw error;
  }
}

/**
 * Delete a platform connection
 */
export async function deletePlatformConnection(userId, platform) {
  try {
    const { error } = await supabase
      .from('platform_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', platform);

    if (error) {
      console.error('Database error deleting platform connection:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error deleting platform connection:', error);
    throw error;
  }
}

/**
 * Store soul data (extracted patterns and analysis)
 */
export async function storeSoulData(soulDataObj) {
  const {
    userId,
    platform,
    dataType,
    rawData,
    extractedPatterns,
    privacyLevel
  } = soulDataObj;

  try {
    const { data, error } = await supabase
      .from('soul_data')
      .insert({
        user_id: userId,
        platform: platform,
        data_type: dataType,
        raw_data: rawData,
        extracted_patterns: extractedPatterns,
        privacy_level: privacyLevel || 50,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Database error storing soul data:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error storing soul data:', error);
    throw error;
  }
}

/**
 * Get soul data for a user and platform
 */
export async function getSoulData(userId, platform, dataType = null) {
  try {
    let query = supabase
      .from('soul_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform);

    if (dataType) {
      query = query.eq('data_type', dataType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error getting soul data:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error getting soul data:', error);
    throw error;
  }
}

/**
 * Update soul data privacy level
 */
export async function updateSoulDataPrivacy(soulDataId, privacyLevel) {
  try {
    const { data, error } = await supabase
      .from('soul_data')
      .update({
        privacy_level: privacyLevel
      })
      .eq('id', soulDataId)
      .select()
      .single();

    if (error) {
      console.error('Database error updating soul data privacy:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error updating soul data privacy:', error);
    throw error;
  }
}

// Export all functions as named exports
export const serverDb = {
  upsertPlatformConnection,
  getPlatformConnection,
  deletePlatformConnection,
  storeSoulData,
  getSoulData,
  updateSoulDataPrivacy
};
