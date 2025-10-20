/**
 * Server-Sent Events (SSE) Service
 * Browser-friendly alternative to WebSockets for server-to-client real-time updates
 *
 * Benefits over WebSocket:
 * - Simpler protocol (HTTP-based)
 * - Auto-reconnect built into browser
 * - Works through most proxies/firewalls
 * - No need for special server infrastructure
 *
 * Use Cases:
 * - Real-time platform sync notifications
 * - Token refresh status updates
 * - Data extraction progress
 * - Connection status changes
 */

import { createClient } from '@supabase/supabase-js';

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

// Store active SSE connections: userId -> response object
const connections = new Map();

// Store last event ID for each user (for resume capability)
const lastEventIds = new Map();

/**
 * Initialize SSE connection for a user
 * This is called when a client connects to the SSE endpoint
 */
function initializeSSEConnection(userId, res) {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Store connection
  connections.set(userId, res);

  console.log(`📡 SSE connection established for user: ${userId}`);
  console.log(`📊 Active SSE connections: ${connections.size}`);

  // Send initial connection success event
  sendSSE(userId, {
    type: 'connected',
    message: 'SSE connection established',
    timestamp: new Date().toISOString(),
  });

  // Send initial platform status
  sendPlatformStatus(userId);

  // Send periodic heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    if (connections.has(userId)) {
      sendSSE(userId, {
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      });
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000); // Every 30 seconds

  // Clean up on connection close
  res.on('close', () => {
    connections.delete(userId);
    clearInterval(heartbeatInterval);
    console.log(`👋 SSE connection closed for user: ${userId}`);
    console.log(`📊 Active SSE connections: ${connections.size}`);
  });

  return res;
}

/**
 * Send SSE message to a specific user
 * Format: data: {"type":"...", "message":"...", ...}\n\n
 */
function sendSSE(userId, data) {
  const res = connections.get(userId);

  if (!res) {
    console.warn(`⚠️  No SSE connection found for user: ${userId}`);
    return false;
  }

  try {
    // Generate unique event ID
    const eventId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    lastEventIds.set(userId, eventId);

    // Format SSE message
    const eventData = {
      ...data,
      timestamp: data.timestamp || new Date().toISOString(),
    };

    // Write SSE format:
    // id: event-id
    // event: event-type (optional)
    // data: json-data
    // (blank line to signal end of event)
    res.write(`id: ${eventId}\n`);

    if (data.type) {
      res.write(`event: ${data.type}\n`);
    }

    res.write(`data: ${JSON.stringify(eventData)}\n\n`);

    return true;
  } catch (error) {
    console.error(`❌ Error sending SSE to user ${userId}:`, error);
    connections.delete(userId);
    return false;
  }
}

/**
 * Broadcast to all connected clients
 */
function broadcastSSE(data) {
  let successCount = 0;

  connections.forEach((res, userId) => {
    if (sendSSE(userId, data)) {
      successCount++;
    }
  });

  console.log(`📢 Broadcast sent to ${successCount}/${connections.size} clients`);

  return successCount;
}

/**
 * Send platform status to a user
 */
async function sendPlatformStatus(userId) {
  try {
    const { data: platformConnections, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Error fetching platform status:', error);
      return;
    }

    sendSSE(userId, {
      type: 'platform_status',
      platforms: platformConnections,
      message: `${platformConnections.length} platforms connected`,
    });
  } catch (error) {
    console.error('❌ Error sending platform status:', error);
  }
}

/**
 * Notify user about platform sync
 */
function notifyPlatformSync(userId, platform, result) {
  return sendSSE(userId, {
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
  return sendSSE(userId, {
    type: 'token_refresh',
    platform,
    message: `${platform} token refreshed automatically`,
  });
}

/**
 * Notify user about extraction progress
 */
function notifyExtractionProgress(userId, progress) {
  return sendSSE(userId, {
    type: 'extraction_progress',
    progress,
    message: `Extraction ${progress.percentage}% complete`,
  });
}

/**
 * Notify user about new data available
 */
function notifyNewData(userId, platform, dataType, count) {
  return sendSSE(userId, {
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
  return sendSSE(userId, {
    type: 'connection_status',
    platform,
    status,
    message,
  });
}

/**
 * Notify user about webhook received
 */
function notifyWebhookReceived(userId, platform, event, data) {
  return sendSSE(userId, {
    type: 'webhook_received',
    platform,
    event,
    data,
    message: `Webhook received: ${platform} ${event}`,
  });
}

/**
 * Get connected clients count
 */
function getConnectedClientsCount() {
  return connections.size;
}

/**
 * Check if user has active SSE connection
 */
function hasActiveConnection(userId) {
  return connections.has(userId);
}

/**
 * Close connection for a user
 */
function closeConnection(userId) {
  const res = connections.get(userId);

  if (res) {
    try {
      res.end();
    } catch (error) {
      console.error(`❌ Error closing SSE connection for ${userId}:`, error);
    }

    connections.delete(userId);
    lastEventIds.delete(userId);

    console.log(`🔌 Closed SSE connection for user: ${userId}`);

    return true;
  }

  return false;
}

/**
 * Get last event ID for a user (for reconnection)
 */
function getLastEventId(userId) {
  return lastEventIds.get(userId);
}

/**
 * Health check - get service statistics
 */
function getServiceStats() {
  return {
    activeConnections: connections.size,
    userIds: Array.from(connections.keys()),
    lastEventIds: Object.fromEntries(lastEventIds),
    uptime: process.uptime(),
  };
}

export {
  initializeSSEConnection,
  sendSSE,
  broadcastSSE,
  notifyPlatformSync,
  notifyTokenRefresh,
  notifyExtractionProgress,
  notifyNewData,
  notifyConnectionStatus,
  notifyWebhookReceived,
  getConnectedClientsCount,
  hasActiveConnection,
  closeConnection,
  getLastEventId,
  getServiceStats,
  sendPlatformStatus,
};
