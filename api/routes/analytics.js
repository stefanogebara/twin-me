import express from 'express';
import { supabaseAdmin as supabase } from '../config/supabase.js';
import rateLimit from 'express-rate-limit';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Analytics');

const router = express.Router();

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many analytics requests, please try again later.' }
});

router.post('/events', analyticsLimiter, async (req, res) => {
  try {
    // Reject oversized payloads (prevent storage abuse)
    const bodySize = JSON.stringify(req.body).length;
    if (bodySize > 10_000) {
      return res.status(413).json({ error: 'Payload too large (max 10KB)' });
    }

    const {
      event_type,
      event_data,
      session_id,
      timestamp,
      page_url,
      user_agent,
      referrer
    } = req.body;

    if (!event_type || !session_id) {
      return res.status(400).json({ error: 'event_type and session_id are required' });
    }

    // Validate field types and lengths
    if (typeof event_type !== 'string' || event_type.length > 100) {
      return res.status(400).json({ error: 'event_type must be a string (max 100 chars)' });
    }
    if (typeof session_id !== 'string' || session_id.length > 200) {
      return res.status(400).json({ error: 'session_id must be a string (max 200 chars)' });
    }
    if (event_data && (typeof event_data !== 'object' || Array.isArray(event_data))) {
      return res.status(400).json({ error: 'event_data must be an object' });
    }

    // Resolve user_id from JWT only — never trust the body-supplied user_id
    // (anonymous events are fine; authenticated events get the correct user)
    let resolvedUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = await import('jsonwebtoken');
        const payload = jwt.default.verify(authHeader.slice(7), process.env.JWT_SECRET);
        resolvedUserId = payload.id || payload.userId || null;
      } catch {
        // Invalid / expired token — treat as anonymous
      }
    }

    const { data, error } = await supabase
      .from('analytics_events')
      .insert([{
        event_type,
        event_data: event_data || {},
        user_id: resolvedUserId,
        session_id,
        timestamp: timestamp || new Date().toISOString(),
        page_url: page_url || null,
        user_agent: user_agent || null,
        referrer: referrer || null,
        created_at: new Date().toISOString()
      }]);

    if (error) {
      log.error('Analytics insert error:', error);
      return res.status(500).json({ error: 'Failed to store analytics event' });
    }

    res.status(201).json({ success: true, data });
  } catch (error) {
    log.error('Analytics event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/session-end', analyticsLimiter, async (req, res) => {
  try {
    const { session_id, end_time } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    // Resolve user_id from JWT only — never trust body-supplied user_id
    let resolvedUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = await import('jsonwebtoken');
        const payload = jwt.default.verify(authHeader.slice(7), process.env.JWT_SECRET);
        resolvedUserId = payload.id || payload.userId || null;
      } catch {
        // Invalid / expired token — treat as anonymous
      }
    }

    const upsertData = {
      session_id,
      user_id: resolvedUserId,
      ended_at: end_time || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    log.info('Upserting session data:', JSON.stringify(upsertData));

    const { data, error } = await supabase
      .from('analytics_sessions')
      .upsert([upsertData], {
        onConflict: 'session_id'
      });

    if (error) {
      log.error('Session end error:', error);
      return res.status(500).json({ error: 'Failed to update session' });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    log.error('Session end error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dashboard', authenticateUser, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    let query = supabase
      .from('analytics_events')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .eq('user_id', user_id);

    const { data: events, error } = await query.order('timestamp', { ascending: false });

    if (error) {
      log.error('Analytics dashboard error:', error);
      return res.status(500).json({ error: 'Failed to fetch analytics data' });
    }

    const analytics = {
      total_events: events.length,
      unique_users: new Set(events.filter(e => e.user_id).map(e => e.user_id)).size,
      unique_sessions: new Set(events.map(e => e.session_id)).size,
      event_types: events.reduce((acc, event) => {
        acc[event.event_type] = (acc[event.event_type] || 0) + 1;
        return acc;
      }, {}),
      daily_activity: events.reduce((acc, event) => {
        const date = new Date(event.timestamp).toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {}),
      popular_pages: events
        .filter(e => e.event_type === 'page_view')
        .reduce((acc, event) => {
          const page = event.event_data?.page || 'unknown';
          acc[page] = (acc[page] || 0) + 1;
          return acc;
        }, {}),
      twin_interactions: events
        .filter(e => e.event_type === 'twin_interaction')
        .reduce((acc, event) => {
          const twinId = event.event_data?.twin_id;
          if (twinId) {
            acc[twinId] = (acc[twinId] || 0) + 1;
          }
          return acc;
        }, {}),
      conversation_stats: events
        .filter(e => e.event_type === 'conversation_session')
        .reduce((acc, event) => {
          const data = event.event_data;
          acc.total_conversations = (acc.total_conversations || 0) + 1;
          acc.total_messages = (acc.total_messages || 0) + (data.message_count || 0);
          acc.total_duration = (acc.total_duration || 0) + (data.duration_seconds || 0);
          acc.engagement_levels = acc.engagement_levels || { high: 0, medium: 0, low: 0 };
          acc.engagement_levels[data.engagement_level || 'low']++;
          return acc;
        }, {})
    };

    res.json({ success: true, analytics, period_days: days });
  } catch (error) {
    log.error('Analytics dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;