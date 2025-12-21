/**
 * Token Lifecycle Background Job Scheduler
 *
 * Manages automated background jobs for OAuth token lifecycle:
 * 1. Token Refresh Job - Refreshes expiring access tokens every 5 minutes
 * 2. OAuth State Cleanup Job - Removes expired OAuth states every 15 minutes
 *
 * Security Features:
 * - Automatic token refresh before expiration (5-minute buffer)
 * - Prevention of token expiration errors for users
 * - Cleanup of expired/used OAuth states to prevent replay attacks
 * - Error logging for monitoring and debugging
 *
 * @module tokenLifecycleJob
 */

import cron from 'node-cron';
import { refreshAccessToken } from './tokenRefreshService.js';
import { decryptToken, encryptToken } from './encryption.js';
import { createClient } from '@supabase/supabase-js';

// =========================================================================
// Supabase Client Initialization (Lazy)
// =========================================================================

let supabase = null;

/**
 * Get or initialize Supabase client
 * Lazy initialization to ensure env vars are loaded first
 */
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

// =========================================================================
// Job Storage
// =========================================================================

let tokenRefreshJob = null;
let oauthCleanupJob = null;

// =========================================================================
// Job 1: Token Refresh Job
// =========================================================================

/**
 * Token Refresh Job
 *
 * Runs every 5 minutes to refresh access tokens that are expiring soon.
 * This prevents users from experiencing "token expired" errors when
 * they try to use platform features.
 *
 * Schedule: Every 5 minutes (cron expression using node-cron)
 *
 * Process:
 * 1. Query platform_connections for tokens expiring within 5 minutes
 * 2. For each expiring token, call refreshExpiringTokens()
 * 3. Log success/failure for monitoring
 * 4. Continue on error (don't stop the job)
 */
const tokenRefreshJobHandler = async () => {
  const startTime = Date.now();
  console.log('🔄 [Token Lifecycle] Starting token refresh job...');

  try {
    const supabase = getSupabaseClient();

    // Get all tokens expiring within the next 5 minutes
    const { data: expiringTokens, error } = await supabase.rpc(
      'get_expiring_platform_tokens',
      { expiry_buffer_minutes: 5 }
    );

    if (error) {
      console.error('❌ [Token Lifecycle] Error fetching expiring tokens:', error.message);
      return;
    }

    if (!expiringTokens || expiringTokens.length === 0) {
      console.log('✅ [Token Lifecycle] No tokens expiring soon. Job complete.');
      return;
    }

    // Try to refresh ALL tokens that have refresh_token - even 'expired' ones
    // The refresh token might still be valid. Only if refresh fails do we require re-authorization.
    const tokensToRefresh = expiringTokens;

    console.log(`📊 [Token Lifecycle] Found ${tokensToRefresh.length} tokens to refresh`);

    // Refresh each expiring token
    const results = await Promise.allSettled(
      tokensToRefresh.map(async (token) => {
        try {
          console.log(`🔄 [Token Lifecycle] Refreshing ${token.platform} token for user ${token.user_id}`);

          // Decrypt the refresh token before using it
          const decryptedRefreshToken = decryptToken(token.refresh_token);

          if (!decryptedRefreshToken) {
            console.error(`❌ [Token Lifecycle] Could not decrypt refresh token for ${token.platform}`);
            return {
              success: false,
              userId: token.user_id,
              platform: token.platform,
              error: 'Failed to decrypt refresh token'
            };
          }

          // Actually refresh the token
          const newTokens = await refreshAccessToken(token.platform, decryptedRefreshToken, token.user_id);

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
                status: 'connected',
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', token.user_id)
              .eq('platform', token.platform);

            console.log(`✅ [Token Lifecycle] Successfully refreshed ${token.platform} token`);
          } else {
            throw new Error('refreshAccessToken returned null');
          }

          return {
            success: true,
            userId: token.user_id,
            platform: token.platform
          };
        } catch (error) {
          console.error(`❌ [Token Lifecycle] Failed to refresh ${token.platform} token:`, error.message);

          // Mark connection as expired if refresh fails
          try {
            await getSupabaseClient()
              .from('platform_connections')
              .update({
                status: 'expired',
                updated_at: new Date().toISOString()
              })
              .eq('user_id', token.user_id)
              .eq('platform', token.platform);
          } catch (updateError) {
            console.error(`❌ [Token Lifecycle] Failed to mark connection as expired:`, updateError.message);
          }

          return {
            success: false,
            userId: token.user_id,
            platform: token.platform,
            error: error.message
          };
        }
      })
    );

    // Log summary
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
    const duration = Date.now() - startTime;

    console.log(`✅ [Token Lifecycle] Token refresh job complete`);
    console.log(`📊 [Token Lifecycle] Results: ${successful} successful, ${failed} failed`);
    console.log(`⏱️ [Token Lifecycle] Duration: ${duration}ms`);

  } catch (error) {
    console.error('❌ [Token Lifecycle] Token refresh job failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
};

// =========================================================================
// Job 2: OAuth State Cleanup Job
// =========================================================================

/**
 * OAuth State Cleanup Job
 *
 * Runs every 15 minutes to remove expired and used OAuth states.
 * This prevents database bloat and ensures replay attacks using old
 * state parameters are not possible.
 *
 * Schedule: Every 15 minutes (cron expression using node-cron)
 *
 * Process:
 * 1. Delete oauth_states where expires_at < NOW() OR used = true AND used_at < NOW() - 1 hour
 * 2. Log number of states cleaned up
 * 3. Continue on error (don't stop the job)
 */
const oauthCleanupJobHandler = async () => {
  const startTime = Date.now();
  console.log('🧹 [Token Lifecycle] Starting OAuth state cleanup job...');

  try {
    const supabase = getSupabaseClient();

    // Delete expired oauth_states (older than expiration time)
    const { data: expiredStates, error: expiredError } = await supabase
      .from('oauth_states')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (expiredError) {
      console.error('❌ [Token Lifecycle] Error deleting expired states:', expiredError.message);
    } else {
      const expiredCount = expiredStates?.length || 0;
      console.log(`✅ [Token Lifecycle] Deleted ${expiredCount} expired OAuth states`);
    }

    // Delete used oauth_states older than 1 hour (keep recent ones for debugging)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: usedStates, error: usedError } = await supabase
      .from('oauth_states')
      .delete()
      .eq('used', true)
      .lt('used_at', oneHourAgo)
      .select('id');

    if (usedError) {
      console.error('❌ [Token Lifecycle] Error deleting used states:', usedError.message);
    } else {
      const usedCount = usedStates?.length || 0;
      console.log(`✅ [Token Lifecycle] Deleted ${usedCount} old used OAuth states`);
    }

    const totalCleaned = (expiredStates?.length || 0) + (usedStates?.length || 0);
    const duration = Date.now() - startTime;

    console.log(`✅ [Token Lifecycle] OAuth cleanup job complete`);
    console.log(`📊 [Token Lifecycle] Total cleaned: ${totalCleaned} states`);
    console.log(`⏱️ [Token Lifecycle] Duration: ${duration}ms`);

  } catch (error) {
    console.error('❌ [Token Lifecycle] OAuth cleanup job failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
};

// =========================================================================
// Job Scheduling Functions
// =========================================================================

/**
 * Start all background jobs
 *
 * Initializes and starts both token refresh and OAuth cleanup jobs.
 * This should be called once on server startup.
 *
 * @returns {Object} Object containing both job instances
 */
export function startBackgroundJobs() {
  console.log('🚀 [Token Lifecycle] Starting background jobs...');

  // Token Refresh Job - Every 5 minutes
  if (tokenRefreshJob) {
    console.warn('⚠️ [Token Lifecycle] Token refresh job already running, stopping old instance');
    tokenRefreshJob.stop();
  }

  tokenRefreshJob = cron.schedule('*/5 * * * *', tokenRefreshJobHandler, {
    scheduled: true,
    timezone: 'UTC'
  });

  console.log('✅ [Token Lifecycle] Token refresh job scheduled (every 5 minutes)');

  // OAuth State Cleanup Job - Every 15 minutes
  if (oauthCleanupJob) {
    console.warn('⚠️ [Token Lifecycle] OAuth cleanup job already running, stopping old instance');
    oauthCleanupJob.stop();
  }

  oauthCleanupJob = cron.schedule('*/15 * * * *', oauthCleanupJobHandler, {
    scheduled: true,
    timezone: 'UTC'
  });

  console.log('✅ [Token Lifecycle] OAuth cleanup job scheduled (every 15 minutes)');

  // Run initial cleanup immediately (token refresh will wait for first 5-minute interval)
  oauthCleanupJobHandler().catch(error => {
    console.error('❌ [Token Lifecycle] Initial OAuth cleanup failed:', error.message);
  });

  console.log('✅ [Token Lifecycle] All background jobs started successfully');
  console.log('📋 [Token Lifecycle] Job schedule:');
  console.log('   - Token Refresh: Every 5 minutes (UTC)');
  console.log('   - OAuth Cleanup: Every 15 minutes (UTC)');

  return {
    tokenRefreshJob,
    oauthCleanupJob
  };
}

/**
 * Stop all background jobs
 *
 * Stops both token refresh and OAuth cleanup jobs.
 * This should be called on graceful server shutdown.
 */
export function stopBackgroundJobs() {
  console.log('🛑 [Token Lifecycle] Stopping background jobs...');

  let stopped = 0;

  if (tokenRefreshJob) {
    tokenRefreshJob.stop();
    tokenRefreshJob = null;
    stopped++;
    console.log('✅ [Token Lifecycle] Token refresh job stopped');
  }

  if (oauthCleanupJob) {
    oauthCleanupJob.stop();
    oauthCleanupJob = null;
    stopped++;
    console.log('✅ [Token Lifecycle] OAuth cleanup job stopped');
  }

  if (stopped === 0) {
    console.warn('⚠️ [Token Lifecycle] No jobs were running');
  } else {
    console.log(`✅ [Token Lifecycle] Stopped ${stopped} background jobs`);
  }
}

/**
 * Run token refresh job immediately (for testing)
 *
 * Useful for manual testing or running the job on-demand.
 *
 * @returns {Promise<void>}
 */
export async function runTokenRefreshNow() {
  console.log('🔄 [Token Lifecycle] Running token refresh job immediately...');
  await tokenRefreshJobHandler();
}

/**
 * Run OAuth cleanup job immediately (for testing)
 *
 * Useful for manual testing or running the job on-demand.
 *
 * @returns {Promise<void>}
 */
export async function runOAuthCleanupNow() {
  console.log('🧹 [Token Lifecycle] Running OAuth cleanup job immediately...');
  await oauthCleanupJobHandler();
}

/**
 * Get job status
 *
 * Returns the current status of both background jobs.
 *
 * @returns {Object} Job status information
 */
export function getJobStatus() {
  return {
    tokenRefreshJob: {
      running: tokenRefreshJob !== null,
      schedule: '*/5 * * * * (Every 5 minutes)'
    },
    oauthCleanupJob: {
      running: oauthCleanupJob !== null,
      schedule: '*/15 * * * * (Every 15 minutes)'
    }
  };
}

// =========================================================================
// Usage Examples
// =========================================================================

/**
 * Example 1: Start jobs on server startup
 *
 * import { startBackgroundJobs, stopBackgroundJobs } from './services/tokenLifecycleJob.js';
 *
 * // In server.js
 * startBackgroundJobs();
 *
 * // On graceful shutdown
 * process.on('SIGTERM', () => {
 *   stopBackgroundJobs();
 *   process.exit(0);
 * });
 */

/**
 * Example 2: Run jobs manually for testing
 *
 * import { runTokenRefreshNow, runOAuthCleanupNow } from './services/tokenLifecycleJob.js';
 *
 * // Run immediately
 * await runTokenRefreshNow();
 * await runOAuthCleanupNow();
 */

/**
 * Example 3: Check job status
 *
 * import { getJobStatus } from './services/tokenLifecycleJob.js';
 *
 * const status = getJobStatus();
 * console.log('Job Status:', status);
 */

export default {
  startBackgroundJobs,
  stopBackgroundJobs,
  runTokenRefreshNow,
  runOAuthCleanupNow,
  getJobStatus
};
