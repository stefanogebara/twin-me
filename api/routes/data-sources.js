/**
 * Data Sources Routes - Get connected platform information
 */

import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateUser, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/data-sources/connected
 * Get all connected platforms for a user
 * Query params: userId (required)
 */
router.get('/connected', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.query;

    // Use authenticated user if available, otherwise require userId param
    const targetUserId = req.user?.id || userId;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Convert email to UUID if needed
    let userUuid = targetUserId;
    if (targetUserId && !targetUserId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', targetUserId)
        .single();

      if (userData) {
        userUuid = userData.id;
      } else {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
    }

    // Get connection status from database
    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('platform, connected_at, metadata, last_sync_at, created_at')
      .eq('user_id', userUuid)
      .not('connected_at', 'is', null);

    if (error) {
      console.error('Database error getting connections:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch connections',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    // Transform connections to expected format
    const formattedConnections = (connections || []).map(conn => ({
      provider: conn.platform,
      status: conn.connected_at ? 'connected' : 'disconnected',
      data_points: conn.metadata?.data_points || 0,
      last_sync_at: conn.last_sync_at,
      created_at: conn.created_at,
      metadata: conn.metadata
    }));

    // Return connections in expected format
    res.json({
      success: true,
      connections: formattedConnections,
      count: formattedConnections.length,
      userId: userUuid
    });

  } catch (error) {
    console.error('Error fetching data sources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch data sources',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/data-sources/status/:userId
 * Get connection status for a specific user (alias for compatibility)
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Convert email to UUID if needed
    let userUuid = userId;
    if (userId && !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', userId)
        .single();
      if (userData) userUuid = userData.id;
    }

    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('platform, connected_at, metadata, last_sync_at')
      .eq('user_id', userUuid)
      .not('connected_at', 'is', null);

    if (error) {
      console.error('Database error getting connections:', error);
      throw error;
    }

    // Transform to status object
    const connectionStatus = {};
    connections?.forEach(connection => {
      connectionStatus[connection.platform] = {
        connected: true,
        status: 'connected',
        data_points: connection.metadata?.data_points || 0,
        last_sync_at: connection.last_sync_at,
        metadata: connection.metadata
      };
    });

    // Also return connections array for compatibility
    const formattedConnections = (connections || []).map(conn => ({
      provider: conn.platform,
      status: 'connected',
      data_points: conn.metadata?.data_points || 0,
      last_sync_at: conn.last_sync_at,
      metadata: conn.metadata
    }));

    res.json({
      success: true,
      status: connectionStatus,
      connections: formattedConnections,
      data: connectionStatus // For Settings page compatibility
    });

  } catch (error) {
    console.error('Error getting connection status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connection status',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;
