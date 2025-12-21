import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from './encryption.js';
import PLATFORM_CONFIGS from '../config/platformConfigs.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Spotify Token Manager
 * Handles token refresh, validation, and lifecycle management
 */
export class SpotifyTokenManager {

  /**
   * Get valid access token for user
   * Automatically refreshes if expired
   */
  static async getValidAccessToken(userId) {
    try {
      // Fetch connection from database
      const { data: connection, error } = await supabase
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .single();

      if (error || !connection) {
        throw new Error('Spotify connection not found. User must authorize Spotify first.');
      }

      // Decrypt tokens
      const accessToken = decryptToken(connection.access_token);
      const refreshToken = connection.refresh_token ? decryptToken(connection.refresh_token) : null;
      const expiresAt = new Date(connection.token_expires_at);

      // Check if token is expired (with 5-minute buffer)
      const now = new Date();
      const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds

      if (expiresAt - now > bufferTime) {
        // Token is still valid
        console.log(`✅ Spotify token valid for user ${userId}`);
        return accessToken;
      }

      // Token expired, refresh it
      if (!refreshToken) {
        throw new Error('No refresh token available. User must reconnect Spotify.');
      }

      console.log(`🔄 Refreshing Spotify token for user ${userId}`);
      const newTokens = await this.refreshAccessToken(refreshToken);

      // Update database with new tokens
      const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

      const { error: updateError } = await supabase
        .from('platform_connections')
        .update({
          access_token: encryptToken(newTokens.access_token),
          refresh_token: newTokens.refresh_token ? encryptToken(newTokens.refresh_token) : connection.refresh_token,
          token_expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('platform', 'spotify');

      if (updateError) {
        console.error('Failed to update refreshed tokens:', updateError);
        throw new Error('Failed to save refreshed tokens');
      }

      console.log(`✅ Spotify token refreshed successfully for user ${userId}`);
      return newTokens.access_token;

    } catch (error) {
      console.error('Spotify token manager error:', error);
      throw error;
    }
  }

  /**
   * Refresh Spotify access token using refresh token
   */
  static async refreshAccessToken(refreshToken) {
    const config = PLATFORM_CONFIGS.spotify;

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Spotify token refresh error:', errorData);
      throw new Error(`Failed to refresh token: ${errorData.error_description || errorData.error}`);
    }

    const tokens = await response.json();
    return tokens;
  }

  /**
   * Validate token by making test API call
   */
  static async validateToken(accessToken) {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      return response.ok;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  /**
   * Check if user has Spotify connected
   */
  static async isConnected(userId) {
    const { data, error } = await supabase
      .from('platform_connections')
      .select('id, status')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .single();

    return !error && data && data.status === 'connected';
  }

  /**
   * Revoke Spotify connection (user disconnect)
   */
  static async revokeConnection(userId) {
    const { error } = await supabase
      .from('platform_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    if (error) {
      throw new Error('Failed to revoke Spotify connection');
    }

    console.log(`🔓 Spotify connection revoked for user ${userId}`);
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
      .eq('platform', 'spotify')
      .single();

    if (error || !data) {
      return {
        connected: false,
        status: 'disconnected'
      };
    }

    const expiresAt = new Date(data.token_expires_at);
    const now = new Date();
    const isExpired = expiresAt < now;

    return {
      connected: true,
      status: data.status,
      connectedAt: data.connected_at,
      lastSync: data.last_sync_at,
      lastSyncStatus: data.last_sync_status,
      tokenExpired: isExpired,
      hasRefreshToken: !!data.refresh_token
    };
  }
}
