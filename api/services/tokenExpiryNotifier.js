/**
 * Token Expiry Notification Service
 *
 * Proactively notifies users when their OAuth tokens are about to expire,
 * allowing them to reconnect before data flow is interrupted.
 *
 * This is especially important for platforms like Whoop where refresh tokens
 * have limited lifetimes (7-30 days).
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';

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

// Platform-specific refresh token lifetimes (in days)
const REFRESH_TOKEN_LIFETIMES = {
  whoop: 7,        // Whoop refresh tokens expire after ~7 days
  spotify: 180,    // Spotify refresh tokens are longer-lived
  google_calendar: 180, // Google refresh tokens vary
  default: 30      // Conservative default
};

// When to start warning (days before expiry)
const WARNING_THRESHOLD_DAYS = 2;

/**
 * Check for tokens that are about to expire and create notifications
 */
async function checkExpiringTokens() {
  console.log('🔔 [Token Notifier] Checking for expiring tokens...');

  try {
    const supabase = getSupabaseClient();

    // Get all connections - check both approaching expiry and already expired
    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('id, user_id, platform, last_sync_at, status, updated_at, token_expires_at')
      .in('status', ['connected', 'token_expired', 'expired'])
      .not('refresh_token', 'is', null);

    if (error) {
      console.error('❌ [Token Notifier] Error fetching connections:', error.message);
      return;
    }

    if (!connections || connections.length === 0) {
      console.log('✅ [Token Notifier] No connections to check');
      return;
    }

    console.log(`📊 [Token Notifier] Checking ${connections.length} connections`);

    const now = new Date();
    const notificationsToCreate = [];

    for (const conn of connections) {
      // CASE 1: Already expired - immediate notification
      if (conn.status === 'expired' || conn.status === 'token_expired') {
        console.log(`🚨 [Token Notifier] ${conn.platform} for user ${conn.user_id} is ALREADY EXPIRED`);

        notificationsToCreate.push({
          user_id: conn.user_id,
          type: 'token_expired',
          title: `${conn.platform} connection expired`,
          message: `Your ${conn.platform} connection has expired. Please reconnect to resume data sync.`,
          platform: conn.platform,
          action_url: '/get-started',
          priority: 'high',
          metadata: {
            status: conn.status,
            expired_at: conn.token_expires_at,
            connection_id: conn.id
          },
          created_at: new Date().toISOString()
        });
        continue;
      }

      // CASE 2: Approaching expiry - warning notification
      const lifetime = REFRESH_TOKEN_LIFETIMES[conn.platform] || REFRESH_TOKEN_LIFETIMES.default;
      const warningDays = lifetime - WARNING_THRESHOLD_DAYS;

      // Use last_sync_at, or updated_at as fallback
      const lastActivity = new Date(conn.last_sync_at || conn.updated_at);
      const daysSinceActivity = (now - lastActivity) / (1000 * 60 * 60 * 24);

      if (daysSinceActivity >= warningDays) {
        const daysUntilExpiry = Math.max(0, lifetime - daysSinceActivity);

        console.log(`⚠️ [Token Notifier] ${conn.platform} for user ${conn.user_id} expires in ~${Math.round(daysUntilExpiry)} days`);

        notificationsToCreate.push({
          user_id: conn.user_id,
          type: 'token_expiring',
          title: `${conn.platform} connection expiring soon`,
          message: `Your ${conn.platform} connection will expire in ${Math.round(daysUntilExpiry)} days. Please reconnect to maintain data sync.`,
          platform: conn.platform,
          action_url: '/get-started',
          priority: daysUntilExpiry < 1 ? 'high' : 'medium',
          metadata: {
            days_until_expiry: Math.round(daysUntilExpiry),
            connection_id: conn.id
          },
          created_at: new Date().toISOString()
        });
      }
    }

    // Check if notifications table exists, create notifications
    if (notificationsToCreate.length > 0) {
      console.log(`📨 [Token Notifier] Creating ${notificationsToCreate.length} notifications`);

      // Store notifications
      try {
        for (const notification of notificationsToCreate) {
          // Check for existing unread notification for same platform/user/type
          const { data: existing, error: checkError } = await supabase
            .from('user_notifications')
            .select('id')
            .eq('user_id', notification.user_id)
            .eq('platform', notification.platform)
            .eq('type', notification.type)  // Use the actual type from notification
            .eq('read', false)
            .maybeSingle();  // Use maybeSingle to avoid error when no match

          if (checkError) {
            console.error('❌ [Token Notifier] Check error:', checkError.message);
          }

          if (!existing) {
            const { error: insertError } = await supabase
              .from('user_notifications')
              .insert(notification);

            if (insertError) {
              console.error(`❌ [Token Notifier] Insert failed for ${notification.platform}:`, insertError.message);
            } else {
              console.log(`✅ [Token Notifier] Created notification for ${notification.platform}`);
            }
          } else {
            console.log(`ℹ️ [Token Notifier] Notification already exists for ${notification.platform}`);
          }
        }

        console.log('✅ [Token Notifier] Notifications processing complete');
      } catch (insertError) {
        console.error('❌ [Token Notifier] Error creating notifications:', insertError.message);
        console.log('📋 [Token Notifier] Failed notifications:', JSON.stringify(notificationsToCreate, null, 2));
      }
    } else {
      console.log('✅ [Token Notifier] No tokens expiring soon');
    }

  } catch (error) {
    console.error('❌ [Token Notifier] Error:', error.message);
  }
}

/**
 * Force-refresh a specific platform token (useful for keeping tokens alive)
 * Call this periodically for platforms with short-lived refresh tokens
 */
async function keepTokenAlive(userId, platform) {
  console.log(`🔄 [Token Notifier] Keeping ${platform} token alive for user ${userId}`);

  try {
    // Make a simple API call to use the token
    // This often extends the refresh token lifetime on some platforms
    const supabase = getSupabaseClient();

    const { data: conn } = await supabase
      .from('platform_connections')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (!conn) {
      console.warn(`⚠️ [Token Notifier] No ${platform} connection found`);
      return false;
    }

    // Update last_sync_at to extend the "activity" window
    await supabase
      .from('platform_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    console.log(`✅ [Token Notifier] Token activity updated for ${platform}`);
    return true;

  } catch (error) {
    console.error(`❌ [Token Notifier] Keep-alive failed:`, error.message);
    return false;
  }
}

let notifierJob = null;

/**
 * Start the token expiry notification service
 * Runs daily to check for expiring tokens
 */
function startTokenExpiryNotifier() {
  console.log('🔔 [Token Notifier] Starting token expiry notification service...');

  if (notifierJob) {
    console.warn('⚠️ [Token Notifier] Job already running');
    return;
  }

  // Run daily at 9 AM UTC
  notifierJob = cron.schedule('0 9 * * *', () => {
    console.log('⏰ [Token Notifier] Running daily check');
    checkExpiringTokens();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  // Also run immediately on startup
  checkExpiringTokens();

  console.log('✅ [Token Notifier] Service started (runs daily at 9 AM UTC)');
}

/**
 * Stop the notification service
 */
function stopTokenExpiryNotifier() {
  if (notifierJob) {
    notifierJob.stop();
    notifierJob = null;
    console.log('🛑 [Token Notifier] Service stopped');
  }
}

export {
  startTokenExpiryNotifier,
  stopTokenExpiryNotifier,
  checkExpiringTokens,
  keepTokenAlive,
  REFRESH_TOKEN_LIFETIMES
};

export default {
  startTokenExpiryNotifier,
  stopTokenExpiryNotifier,
  checkExpiringTokens,
  keepTokenAlive
};
