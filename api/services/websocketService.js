/**
 * WebSocket Service
 * Provides real-time updates to connected clients
 * Notifies when platforms sync, tokens refresh, or new data is available
 */

import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let wss = null;
const clients = new Map(); // userId -> WebSocket connection

/**
 * Initialize WebSocket server
 */
function initializeWebSocketServer(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  console.log('🔌 WebSocket server initialized on path /ws');

  wss.on('connection', (ws, req) => {
    console.log('📱 New WebSocket connection');

    let userId = null;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle authentication
        if (data.type === 'auth' && data.userId) {
          userId = data.userId;
          clients.set(userId, ws);

          console.log(`✅ WebSocket authenticated for user: ${userId}`);

          // Send confirmation
          ws.send(JSON.stringify({
            type: 'auth_success',
            message: 'WebSocket connection authenticated',
            timestamp: new Date().toISOString(),
          }));

          // Send initial platform status
          sendPlatformStatus(userId);
        }

        // Handle ping/pong for keepalive
        if (data.type === 'ping') {
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString(),
          }));
        }
      } catch (error) {
        console.error('❌ WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      if (userId) {
        clients.delete(userId);
        console.log(`👋 WebSocket disconnected for user: ${userId}`);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      if (userId) {
        clients.delete(userId);
      }
    });
  });

  return wss;
}

/**
 * Send platform status to a user
 */
async function sendPlatformStatus(userId) {
  const ws = clients.get(userId);

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Error fetching platform status:', error);
      return;
    }

    ws.send(JSON.stringify({
      type: 'platform_status',
      data: connections,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error('❌ Error sending platform status:', error);
  }
}

/**
 * Broadcast to a specific user
 */
function sendToUser(userId, message) {
  const ws = clients.get(userId);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      ...message,
      timestamp: new Date().toISOString(),
    }));
  }
}

/**
 * Notify user about platform sync
 */
function notifyPlatformSync(userId, platform, result) {
  sendToUser(userId, {
    type: 'platform_sync',
    platform,
    result,
    message: `${platform} data synced successfully`,
  });
}

/**
 * Notify user about token refresh
 */
function notifyTokenRefresh(userId, platform) {
  sendToUser(userId, {
    type: 'token_refresh',
    platform,
    message: `${platform} token refreshed automatically`,
  });
}

/**
 * Notify user about extraction progress
 */
function notifyExtractionProgress(userId, progress) {
  sendToUser(userId, {
    type: 'extraction_progress',
    progress,
  });
}

/**
 * Notify user that extraction job has started
 */
function notifyExtractionStarted(userId, jobId, platform) {
  sendToUser(userId, {
    type: 'extraction_started',
    jobId,
    platform,
    message: `Starting data extraction from ${platform}`,
  });
}

/**
 * Notify user about extraction job update (items processed)
 */
function notifyExtractionUpdate(userId, jobId, platform, itemsProcessed, totalItems, currentDataType) {
  sendToUser(userId, {
    type: 'extraction_update',
    jobId,
    platform,
    itemsProcessed,
    totalItems,
    currentDataType,
    progress: totalItems > 0 ? Math.round((itemsProcessed / totalItems) * 100) : 0,
    message: `Extracted ${itemsProcessed}${totalItems ? `/${totalItems}` : ''} items from ${platform}`,
  });
}

/**
 * Notify user that extraction job has completed
 */
function notifyExtractionCompleted(userId, jobId, platform, itemsExtracted) {
  sendToUser(userId, {
    type: 'extraction_completed',
    jobId,
    platform,
    itemsExtracted,
    message: `Successfully extracted ${itemsExtracted} items from ${platform}`,
  });
}

/**
 * Notify user that extraction job has failed
 */
function notifyExtractionFailed(userId, jobId, platform, error) {
  sendToUser(userId, {
    type: 'extraction_failed',
    jobId,
    platform,
    error: error.message || error,
    message: `Failed to extract data from ${platform}: ${error.message || error}`,
  });
}

/**
 * Notify user about new data available
 */
function notifyNewData(userId, platform, dataType, count) {
  sendToUser(userId, {
    type: 'new_data',
    platform,
    dataType,
    count,
    message: `${count} new ${dataType} from ${platform}`,
  });
}

/**
 * Notify user about connection status change
 */
function notifyConnectionStatus(userId, platform, status, message) {
  sendToUser(userId, {
    type: 'connection_status',
    platform,
    status,
    message,
  });
}

/**
 * Get connected clients count
 */
function getConnectedClientsCount() {
  return clients.size;
}

/**
 * Broadcast to all connected clients
 */
function broadcastToAll(message) {
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString(),
      }));
    }
  });
}

export {
  initializeWebSocketServer,
  sendToUser,
  notifyPlatformSync,
  notifyTokenRefresh,
  notifyExtractionProgress,
  notifyExtractionStarted,
  notifyExtractionUpdate,
  notifyExtractionCompleted,
  notifyExtractionFailed,
  notifyNewData,
  notifyConnectionStatus,
  getConnectedClientsCount,
  broadcastToAll,
  sendPlatformStatus,
};
