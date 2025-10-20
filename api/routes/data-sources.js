/**
 * Data Sources API Routes
 * Endpoints for managing platform connections and data sources
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/data-sources/connected
 * Get connected platforms for a user
 */
router.get('/connected', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[API] Fetching connected platforms for user: ${userId}`);

    // Fetch platform connections from database
    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('[API] Error fetching connections:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // Transform connections to expected format
    const formattedConnections = (connections || []).map(conn => ({
      id: conn.id,
      provider: conn.platform,
      status: conn.is_connected ? 'connected' : 'disconnected',
      connected_at: conn.connected_at,
      last_sync: conn.last_sync,
      data_points: conn.data_points || 0,
      metadata: conn.metadata || {}
    }));

    res.json({
      success: true,
      connections: formattedConnections,
      count: formattedConnections.length
    });

  } catch (error) {
    console.error('[API] Error in /data-sources/connected:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/data-sources/status
 * Get overall data source status for a user
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Fetch platform connections
    const { data: connections, error: connError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId);

    if (connError) {
      console.error('[API] Error fetching connections:', connError);
      return res.status(500).json({
        success: false,
        error: connError.message
      });
    }

    // Fetch raw data items count
    const { count: rawDataCount, error: rawError } = await supabase
      .from('raw_data_items')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);

    // Fetch processed text count
    const { count: processedCount, error: procError } = await supabase
      .from('processed_text')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);

    const connectedPlatforms = (connections || []).filter(c => c.is_connected);

    res.json({
      success: true,
      status: {
        connectedPlatforms: connectedPlatforms.length,
        totalConnections: (connections || []).length,
        rawDataItems: rawDataCount || 0,
        processedItems: processedCount || 0,
        platforms: connectedPlatforms.map(c => ({
          name: c.platform,
          connected: true,
          lastSync: c.last_sync,
          dataPoints: c.data_points || 0
        }))
      }
    });

  } catch (error) {
    console.error('[API] Error in /data-sources/status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/data-sources/connect
 * Connect a new data source/platform
 */
router.post('/connect', async (req, res) => {
  try {
    const { userId, platform, credentials } = req.body;

    if (!userId || !platform) {
      return res.status(400).json({
        success: false,
        error: 'userId and platform are required'
      });
    }

    // Check if connection already exists
    const { data: existing } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (existing) {
      // Update existing connection
      const { data, error } = await supabase
        .from('platform_connections')
        .update({
          is_connected: true,
          connected_at: new Date().toISOString(),
          metadata: credentials || {}
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        message: 'Platform reconnected successfully',
        connection: data
      });
    }

    // Create new connection
    const { data, error } = await supabase
      .from('platform_connections')
      .insert({
        user_id: userId,
        platform: platform,
        is_connected: true,
        connected_at: new Date().toISOString(),
        metadata: credentials || {}
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Platform connected successfully',
      connection: data
    });

  } catch (error) {
    console.error('[API] Error in /data-sources/connect:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/data-sources/disconnect
 * Disconnect a data source/platform
 */
router.post('/disconnect', async (req, res) => {
  try {
    const { userId, platform } = req.body;

    if (!userId || !platform) {
      return res.status(400).json({
        success: false,
        error: 'userId and platform are required'
      });
    }

    const { data, error } = await supabase
      .from('platform_connections')
      .update({
        is_connected: false,
        disconnected_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', platform)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Platform disconnected successfully',
      connection: data
    });

  } catch (error) {
    console.error('[API] Error in /data-sources/disconnect:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/data-sources/available
 * Get list of available platforms to connect
 */
router.get('/available', async (req, res) => {
  const availablePlatforms = [
    {
      id: 'gmail',
      name: 'Gmail',
      category: 'professional',
      description: 'Email communication patterns',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'calendar',
      name: 'Google Calendar',
      category: 'professional',
      description: 'Meeting and scheduling patterns',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'spotify',
      name: 'Spotify',
      category: 'personal',
      description: 'Music preferences and listening habits',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'youtube',
      name: 'YouTube',
      category: 'personal',
      description: 'Video interests and learning topics',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'netflix',
      name: 'Netflix',
      category: 'personal',
      description: 'Entertainment preferences',
      hasApi: false,
      requiresExtension: true
    },
    {
      id: 'teams',
      name: 'Microsoft Teams',
      category: 'professional',
      description: 'Team collaboration patterns',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'slack',
      name: 'Slack',
      category: 'professional',
      description: 'Workplace communication',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'discord',
      name: 'Discord',
      category: 'personal',
      description: 'Community engagement',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'reddit',
      name: 'Reddit',
      category: 'personal',
      description: 'Discussion interests',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'github',
      name: 'GitHub',
      category: 'professional',
      description: 'Code contributions and technical skills',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      category: 'professional',
      description: 'Professional network and career',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'steam',
      name: 'Steam',
      category: 'personal',
      description: 'Gaming preferences',
      hasApi: true,
      requiresOAuth: true
    },
    {
      id: 'goodreads',
      name: 'Goodreads',
      category: 'personal',
      description: 'Reading interests',
      hasApi: true,
      requiresOAuth: false
    }
  ];

  res.json({
    success: true,
    platforms: availablePlatforms,
    count: availablePlatforms.length
  });
});

export default router;