import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/platforms/status
 *
 * Returns the current connection status of all platforms for the authenticated user.
 * Includes connection state, last sync time, data quality, and extracted data points.
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch platform connections from database
    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching platform connections:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch platform connections'
      });
    }

    // Transform database records to frontend format
    const platforms = (connections || []).map(conn => ({
      platform: conn.platform,
      name: conn.platform,
      connected: conn.connected_at != null, // Derive boolean from timestamp
      connected_at: conn.connected_at,
      last_sync: conn.last_sync_at, // Fixed: use last_sync_at column
      sync_status: conn.sync_status || 'idle',
      error_message: conn.error_message,
      data_points: conn.data_points || 0,
      data_quality: conn.data_quality || 'low',
      next_sync_at: conn.next_sync_at,
      access_token: undefined, // Never send tokens to frontend
      refresh_token: undefined
    }));

    res.json({
      success: true,
      platforms,
      total_count: platforms.length,
      connected_count: platforms.filter(p => p.connected).length
    });

  } catch (error) {
    console.error('Platform status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/platforms/sync/:platform
 *
 * Triggers a data sync for a specific platform.
 * Updates last_sync timestamp and sets sync_status to 'syncing'.
 */
router.post('/sync/:platform', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.params;

    // Check if platform is connected
    const { data: connection, error: fetchError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (fetchError || !connection) {
      return res.status(404).json({
        success: false,
        error: `Platform ${platform} not found or not connected`
      });
    }

    if (!connection.connected_at) {
      return res.status(400).json({
        success: false,
        error: `Platform ${platform} is not connected`
      });
    }

    // Update sync status
    const { error: updateError } = await supabase
      .from('platform_connections')
      .update({
        sync_status: 'syncing',
        last_sync_at: new Date().toISOString(), // Fixed: use last_sync_at column
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    if (updateError) {
      console.error('Error updating sync status:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to trigger sync'
      });
    }

    // TODO: Trigger actual data extraction job here
    // This would typically:
    // 1. Queue a background job
    // 2. Use platform API to fetch new data
    // 3. Process and store the data
    // 4. Update sync_status to 'success' or 'error'
    // 5. Update data_points and data_quality

    // For now, simulate successful sync
    setTimeout(async () => {
      await supabase
        .from('platform_connections')
        .update({
          sync_status: 'success',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('platform', platform);
    }, 2000);

    res.json({
      success: true,
      message: `Sync initiated for ${platform}`,
      platform,
      sync_status: 'syncing'
    });

  } catch (error) {
    console.error('Platform sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/platforms/list
 *
 * Returns list of all available platforms (not just connected ones).
 */
router.get('/list', async (req, res) => {
  try {
    const availablePlatforms = [
      // Personal/Entertainment
      { platform: 'spotify', category: 'personal', name: 'Spotify', icon: '🎵', hasAPI: true },
      { platform: 'netflix', category: 'personal', name: 'Netflix', icon: '🎬', hasAPI: false },
      { platform: 'youtube', category: 'personal', name: 'YouTube', icon: '📺', hasAPI: true },
      { platform: 'steam', category: 'personal', name: 'Steam', icon: '🎮', hasAPI: true },
      { platform: 'twitch', category: 'personal', name: 'Twitch', icon: '📡', hasAPI: true },
      { platform: 'discord', category: 'personal', name: 'Discord', icon: '💬', hasAPI: true },
      { platform: 'reddit', category: 'personal', name: 'Reddit', icon: '🤖', hasAPI: true },
      { platform: 'goodreads', category: 'personal', name: 'Goodreads', icon: '📚', hasAPI: true },
      { platform: 'instagram', category: 'personal', name: 'Instagram', icon: '📸', hasAPI: false },
      { platform: 'tiktok', category: 'personal', name: 'TikTok', icon: '🎭', hasAPI: false },

      // Professional
      { platform: 'gmail', category: 'professional', name: 'Gmail', icon: '📧', hasAPI: true },
      { platform: 'google-calendar', category: 'professional', name: 'Google Calendar', icon: '📅', hasAPI: true },
      { platform: 'slack', category: 'professional', name: 'Slack', icon: '💼', hasAPI: true },
      { platform: 'microsoft-teams', category: 'professional', name: 'Microsoft Teams', icon: '👥', hasAPI: true },
      { platform: 'linkedin', category: 'professional', name: 'LinkedIn', icon: '🔗', hasAPI: true },
      { platform: 'google-drive', category: 'professional', name: 'Google Drive', icon: '📁', hasAPI: true },

      // Creative
      { platform: 'github', category: 'creative', name: 'GitHub', icon: '💻', hasAPI: true }
    ];

    res.json({
      success: true,
      platforms: availablePlatforms,
      total_count: availablePlatforms.length
    });

  } catch (error) {
    console.error('Platform list error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
