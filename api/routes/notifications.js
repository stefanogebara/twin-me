/**
 * User Notifications API
 *
 * Endpoints for managing user notifications (token expiry warnings, sync issues, etc.)
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Notifications');

const router = express.Router();

// Use the shared supabaseAdmin client (avoids creating a redundant connection pool
// and ensures the correct SUPABASE_URL env var is used)
const supabase = supabaseAdmin;

/**
 * GET /api/notifications
 * Get all notifications for the authenticated user
 * SECURITY FIX: Now requires authentication
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    // SECURITY FIX: Always use authenticated user ID to prevent IDOR
    const userId = req.user.id;

    const { data: notifications, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      log.error('Error fetching notifications:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch notifications'
      });
    }

    // Separate by read status
    const unread = notifications?.filter(n => !n.read) || [];
    const read = notifications?.filter(n => n.read) || [];

    res.json({
      success: true,
      notifications: notifications || [],
      unreadCount: unread.length,
      summary: {
        total: notifications?.length || 0,
        unread: unread.length,
        read: read.length,
        highPriority: notifications?.filter(n => n.priority === 'high' && !n.read).length || 0
      }
    });

  } catch (error) {
    log.error('Notifications fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

/**
 * GET /api/notifications/unread
 * Get only unread notifications (for badge count)
 * SECURITY FIX: Now requires authentication
 */
router.get('/unread', authenticateUser, async (req, res) => {
  try {
    // SECURITY FIX: Always use authenticated user ID to prevent IDOR
    const userId = req.user.id;

    const { data: notifications, error } = await supabase
      .from('user_notifications')
      .select('id, type, title, platform, priority, created_at')
      .eq('user_id', userId)
      .eq('read', false)
      .eq('dismissed', false)
      .order('priority', { ascending: false }) // high priority first
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      log.error('Error fetching unread notifications:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch notifications'
      });
    }

    res.json({
      success: true,
      notifications: notifications || [],
      count: notifications?.length || 0
    });

  } catch (error) {
    log.error('Unread notifications fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark a notification as read
 * SECURITY FIX: Now requires authentication
 */
router.post('/:id/read', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    // SECURITY FIX: Always use authenticated user ID to prevent IDOR
    const userId = req.user.id;

    const { error } = await supabase
      .from('user_notifications')
      .update({
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      log.error('Error marking notification as read:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    log.error('Mark read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

/**
 * POST /api/notifications/:id/dismiss
 * Dismiss a notification (hide it permanently)
 * SECURITY FIX: Now requires authentication
 */
router.post('/:id/dismiss', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    // SECURITY FIX: Always use authenticated user ID to prevent IDOR
    const userId = req.user.id;

    const { error } = await supabase
      .from('user_notifications')
      .update({
        dismissed: true,
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      log.error('Error dismissing notification:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to dismiss notification'
      });
    }

    res.json({
      success: true,
      message: 'Notification dismissed'
    });

  } catch (error) {
    log.error('Dismiss error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to dismiss notification'
    });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 * SECURITY FIX: Now requires authentication
 */
router.post('/read-all', authenticateUser, async (req, res) => {
  try {
    // SECURITY FIX: Always use authenticated user ID to prevent IDOR
    const userId = req.user.id;

    const { error } = await supabase
      .from('user_notifications')
      .update({
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      log.error('Error marking all as read:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to mark all notifications as read'
      });
    }

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });

  } catch (error) {
    log.error('Mark all read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read'
    });
  }
});

/**
 * POST /api/notifications/check-expiring
 * Manually trigger token expiry check (admin/testing)
 */
router.post('/check-expiring', authenticateUser, async (req, res) => {
  try {
    log.info('Manual token expiry check triggered');
    // Dynamic import: tokenExpiryNotifier starts a cron job at module load time.
    // Lazy-loading here keeps it out of the cold-start path for the main notification routes.
    const { checkExpiringTokens } = await import('../services/tokenExpiryNotifier.js');
    await checkExpiringTokens();

    res.json({
      success: true,
      message: 'Token expiry check completed'
    });

  } catch (error) {
    log.error('Token expiry check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check expiring tokens',
      ...(process.env.NODE_ENV !== 'production' && { details: error.message }),
    });
  }
});

export default router;
