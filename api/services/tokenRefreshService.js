/**
 * Automatic Token Refresh Service
 * Proactively refreshes OAuth tokens before they expire
 * Prevents token expiration issues and maintains continuous connection
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Platform-specific OAuth configurations
const PLATFORM_REFRESH_CONFIGS = {
  spotify: {
    tokenUrl: 'https://accounts.spotify.com/api/token',
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  },
  youtube: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  google_gmail: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  google_calendar: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  github: {
    // GitHub tokens don't expire, but we check their validity
    checkUrl: 'https://api.github.com/user',
  },
  discord: {
    tokenUrl: 'https://discord.com/api/oauth2/token',
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
  },
  linkedin: {
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  },
};

/**
 * Decrypt token from database
 */
function decryptToken(encryptedData) {
  try {
    if (!encryptedData) return null;

    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');

    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'),
      iv
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('❌ Token decryption failed:', error.message);
    return null;
  }
}

/**
 * Encrypt token for database storage
 */
function encryptToken(token) {
  try {
    if (!token) return null;

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'),
      iv
    );

    let encrypted = cipher.update(token, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (error) {
    console.error('❌ Token encryption failed:', error.message);
    return null;
  }
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(platform, refreshToken, userId) {
  const config = PLATFORM_REFRESH_CONFIGS[platform];

  if (!config || !config.tokenUrl) {
    console.log(`ℹ️  Platform ${platform} doesn't support token refresh`);
    return null;
  }

  try {
    console.log(`🔄 Refreshing token for ${platform} (user: ${userId})`);

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const response = await axios.post(config.tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;

    if (!access_token) {
      throw new Error('No access token in refresh response');
    }

    console.log(`✅ Token refreshed successfully for ${platform}`);

    return {
      accessToken: access_token,
      refreshToken: newRefreshToken || refreshToken, // Some platforms don't return new refresh token
      expiresIn: expires_in || 3600, // Default 1 hour
    };
  } catch (error) {
    console.error(`❌ Token refresh failed for ${platform}:`, error.response?.data || error.message);

    // Mark connection as needs_reauth
    await supabase
      .from('platform_connections')
      .update({
        status: 'needs_reauth',
        error_message: 'Token refresh failed - please reconnect',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    return null;
  }
}

/**
 * Check and refresh tokens that are about to expire
 * Runs every 5 minutes
 */
async function checkAndRefreshExpiringTokens() {
  try {
    console.log('🔍 Checking for expiring tokens...');

    // Get all connections that expire in the next 10 minutes
    // Include both 'connected' and 'token_expired' status (tokens can be refreshed even if expired)
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: connections, error } = await getSupabaseClient()
      .from('platform_connections')
      .select('*')
      .in('status', ['connected', 'token_expired'])
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', tenMinutesFromNow);

    if (error) {
      console.error('❌ Error fetching connections:', error);
      return;
    }

    if (!connections || connections.length === 0) {
      console.log('✅ No tokens expiring soon');
      return;
    }

    console.log(`⚠️  Found ${connections.length} tokens expiring soon`);

    // Refresh each token
    for (const connection of connections) {
      const decryptedRefreshToken = decryptToken(connection.refresh_token);

      if (!decryptedRefreshToken) {
        console.error(`❌ Could not decrypt refresh token for ${connection.platform}`);
        continue;
      }

      const newTokens = await refreshAccessToken(
        connection.platform,
        decryptedRefreshToken,
        connection.user_id
      );

      if (newTokens) {
        // Encrypt and save new tokens
        const encryptedAccessToken = encryptToken(newTokens.accessToken);
        const encryptedRefreshToken = encryptToken(newTokens.refreshToken);

        const newExpiryTime = new Date(Date.now() + newTokens.expiresIn * 1000).toISOString();

        await getSupabaseClient()
          .from('platform_connections')
          .update({
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            token_expires_at: newExpiryTime,
            status: 'connected', // Reset status to 'connected' after successful refresh
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        console.log(`✅ Updated tokens for ${connection.platform} (user: ${connection.user_id})`);
      }
    }
  } catch (error) {
    console.error('❌ Error in token refresh check:', error);
  }
}

/**
 * Start the automatic token refresh service
 * Runs every 5 minutes to check for expiring tokens
 */
function startTokenRefreshService() {
  console.log('🚀 Starting automatic token refresh service...');

  // Run immediately on startup
  checkAndRefreshExpiringTokens();

  // Schedule to run every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    console.log('⏰ Running scheduled token refresh check');
    checkAndRefreshExpiringTokens();
  });

  console.log('✅ Token refresh service started (runs every 5 minutes)');
}

/**
 * Middleware to automatically refresh token on API call if expired
 * Use this in API routes that make platform API calls
 */
async function ensureFreshToken(userId, platform) {
  try {
    const { data: connection } = await getSupabaseClient()
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (!connection) {
      throw new Error('Platform not connected');
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiresAt = new Date(connection.token_expires_at);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinutesFromNow) {
      console.log(`🔄 Token expired/expiring for ${platform}, refreshing...`);

      const decryptedRefreshToken = decryptToken(connection.refresh_token);

      if (!decryptedRefreshToken) {
        throw new Error('Could not decrypt refresh token');
      }

      const newTokens = await refreshAccessToken(platform, decryptedRefreshToken, userId);

      if (!newTokens) {
        throw new Error('Token refresh failed');
      }

      // Encrypt and save new tokens
      const encryptedAccessToken = encryptToken(newTokens.accessToken);
      const encryptedRefreshToken = encryptToken(newTokens.refreshToken);
      const newExpiryTime = new Date(Date.now() + newTokens.expiresIn * 1000).toISOString();

      await getSupabaseClient()
        .from('platform_connections')
        .update({
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          token_expires_at: newExpiryTime,
          status: 'connected', // Reset status to 'connected' after successful refresh
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      console.log(`✅ Token refreshed for ${platform}`);

      return newTokens.accessToken;
    }

    // Token is still valid, decrypt and return
    return decryptToken(connection.access_token);
  } catch (error) {
    console.error(`❌ Error ensuring fresh token for ${platform}:`, error.message);
    throw error;
  }
}

export {
  startTokenRefreshService,
  ensureFreshToken,
  refreshAccessToken,
  encryptToken,
  decryptToken,
};
