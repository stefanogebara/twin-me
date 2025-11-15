import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from '../encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GitHub Token Manager
 * Handles token validation and lifecycle management
 *
 * Note: GitHub tokens don't expire by default unless using GitHub Apps
 */
export class GithubTokenManager {

  /**
   * Get valid access token for user
   * GitHub tokens don't expire, but we still validate them
   */
  static async getValidAccessToken(userId) {
    try {
      // Fetch connection from database
      const { data: connection, error } = await supabase
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'github')
        .single();

      if (error || !connection) {
        throw new Error('GitHub connection not found. User must authorize GitHub first.');
      }

      // Decrypt token
      const accessToken = decryptToken(connection.access_token);

      if (!accessToken) {
        throw new Error('Failed to decrypt GitHub access token');
      }

      // Validate token is still active
      const isValid = await this.validateToken(accessToken);
      if (!isValid) {
        console.error(`❌ GitHub token invalid for user ${userId}`);

        // Mark connection as needs reauth
        await supabase
          .from('platform_connections')
          .update({
            status: 'needs_reauth',
            last_sync_status: 'error',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('platform', 'github');

        throw new Error('GitHub token has been revoked. User must reconnect.');
      }

      console.log(`✅ GitHub token valid for user ${userId}`);
      return accessToken;

    } catch (error) {
      console.error('GitHub token manager error:', error);
      throw error;
    }
  }

  /**
   * Validate token by making test API call
   */
  static async validateToken(accessToken) {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  /**
   * Check if user has GitHub connected
   */
  static async isConnected(userId) {
    const { data, error } = await supabase
      .from('platform_connections')
      .select('id, status')
      .eq('user_id', userId)
      .eq('platform', 'github')
      .single();

    return !error && data && data.status === 'connected';
  }

  /**
   * Revoke GitHub connection (user disconnect)
   */
  static async revokeConnection(userId) {
    const { error } = await supabase
      .from('platform_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'github');

    if (error) {
      throw new Error('Failed to revoke GitHub connection');
    }

    console.log(`🔓 GitHub connection revoked for user ${userId}`);
    return { success: true };
  }

  /**
   * Get connection status with metadata
   */
  static async getConnectionStatus(userId) {
    const { data, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'github')
      .single();

    if (error || !data) {
      return {
        connected: false,
        status: 'disconnected'
      };
    }

    // GitHub tokens don't expire, so we just check validity
    const accessToken = decryptToken(data.access_token);
    const isValid = accessToken ? await this.validateToken(accessToken) : false;

    return {
      connected: true,
      status: data.status,
      connectedAt: data.connected_at,
      lastSync: data.last_sync_at,
      lastSyncStatus: data.last_sync_status,
      tokenValid: isValid
    };
  }
}
