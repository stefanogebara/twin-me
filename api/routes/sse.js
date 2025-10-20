/**
 * Server-Sent Events (SSE) API Routes
 * Provides real-time server-to-client updates via HTTP
 *
 * Usage:
 * Frontend: const eventSource = new EventSource('/api/sse/stream?userId=xxx');
 */

import express from 'express';
import {
  initializeSSEConnection,
  sendSSE,
  broadcastSSE,
  getConnectedClientsCount,
  hasActiveConnection,
  closeConnection,
  getServiceStats,
} from '../services/sseService.js';

const router = express.Router();

/**
 * SSE Stream Endpoint
 * GET /api/sse/stream?userId=xxx
 *
 * Opens a persistent SSE connection for real-time updates
 */
router.get('/stream', (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      error: 'Missing userId parameter',
      message: 'userId is required to establish SSE connection'
    });
  }

  console.log(`📡 SSE stream requested for user: ${userId}`);

  // Check if user already has an active connection
  if (hasActiveConnection(userId)) {
    console.warn(`⚠️  User ${userId} already has an active SSE connection - closing old one`);
    closeConnection(userId);
  }

  // Initialize SSE connection
  initializeSSEConnection(userId, res);
});

/**
 * Send Custom Message to User
 * POST /api/sse/send
 *
 * Allows backend services to send custom messages to specific users
 */
router.post('/send', express.json(), (req, res) => {
  const { userId, type, message, data } = req.body;

  if (!userId) {
    return res.status(400).json({
      error: 'Missing userId',
      message: 'userId is required'
    });
  }

  if (!hasActiveConnection(userId)) {
    return res.status(404).json({
      error: 'No active connection',
      message: `User ${userId} does not have an active SSE connection`
    });
  }

  const success = sendSSE(userId, {
    type: type || 'custom',
    message: message || 'Custom notification',
    data: data || {},
  });

  if (success) {
    res.json({
      success: true,
      message: 'Event sent successfully'
    });
  } else {
    res.status(500).json({
      error: 'Failed to send event',
      message: 'Event could not be delivered'
    });
  }
});

/**
 * Broadcast to All Clients
 * POST /api/sse/broadcast
 *
 * Send a message to all connected clients
 */
router.post('/broadcast', express.json(), (req, res) => {
  const { type, message, data } = req.body;

  const count = broadcastSSE({
    type: type || 'broadcast',
    message: message || 'Broadcast notification',
    data: data || {},
  });

  res.json({
    success: true,
    message: `Broadcast sent to ${count} clients`,
    recipientCount: count
  });
});

/**
 * Close Connection for User
 * POST /api/sse/close
 *
 * Manually close SSE connection for a user
 */
router.post('/close', express.json(), (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      error: 'Missing userId',
      message: 'userId is required'
    });
  }

  const closed = closeConnection(userId);

  if (closed) {
    res.json({
      success: true,
      message: `SSE connection closed for user ${userId}`
    });
  } else {
    res.status(404).json({
      error: 'No active connection',
      message: `User ${userId} does not have an active SSE connection`
    });
  }
});

/**
 * Get SSE Service Statistics
 * GET /api/sse/stats
 *
 * Returns information about active connections and service health
 */
router.get('/stats', (req, res) => {
  const stats = getServiceStats();

  res.json({
    success: true,
    stats,
    message: `${stats.activeConnections} active SSE connections`
  });
});

/**
 * Health Check
 * GET /api/sse/health
 *
 * Check if SSE service is running
 */
router.get('/health', (req, res) => {
  const count = getConnectedClientsCount();

  res.json({
    status: 'ok',
    service: 'sse',
    timestamp: new Date().toISOString(),
    activeConnections: count,
    message: 'SSE service is operational'
  });
});

/**
 * Check Connection Status
 * GET /api/sse/status/:userId
 *
 * Check if a specific user has an active SSE connection
 */
router.get('/status/:userId', (req, res) => {
  const { userId } = req.params;

  const hasConnection = hasActiveConnection(userId);

  res.json({
    userId,
    connected: hasConnection,
    message: hasConnection
      ? 'User has an active SSE connection'
      : 'User does not have an active SSE connection'
  });
});

export default router;
