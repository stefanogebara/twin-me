/**
 * Location Routes
 * ===============
 * Privacy-first location clustering endpoint.
 * Raw GPS never stored — only anonymized cluster summaries (centroid + visit patterns).
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { ingestLocationClusters } from '../services/observationIngestion.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Location');

let supabaseAdmin = null;
async function getSupabase() {
  if (!supabaseAdmin) {
    const mod = await import('../services/database.js');
    supabaseAdmin = mod.supabaseAdmin;
  }
  return supabaseAdmin;
}

const router = express.Router();

// POST /api/location/clusters — upsert clusters + trigger NL observations async
router.post('/clusters', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    let { clusters } = req.body;

    if (!Array.isArray(clusters) || clusters.length === 0) {
      return res.status(400).json({ error: 'clusters must be a non-empty array' });
    }

    // Cap at 20 clusters per request
    clusters = clusters.slice(0, 20);

    const db = await getSupabase();
    const upsertResults = await Promise.allSettled(
      clusters.map((c) =>
        db.from('user_location_clusters').upsert(
          {
            user_id: userId,
            cluster_key: String(c.cluster_key).slice(0, 64),
            centroid_lat: Number(c.centroid_lat),
            centroid_lng: Number(c.centroid_lng),
            label_hint: c.label_hint ? String(c.label_hint).slice(0, 20) : null,
            visit_count: Math.max(1, Math.floor(Number(c.visit_count) || 1)),
            typical_hours: Array.isArray(c.typical_hours) ? c.typical_hours.slice(0, 24) : [],
            typical_days: Array.isArray(c.typical_days) ? c.typical_days.slice(0, 7) : [],
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,cluster_key' }
        )
      )
    );

    const failed = upsertResults.filter((r) => r.status === 'rejected' || r.value?.error);
    if (failed.length > 0) {
      log.warn(`${failed.length}/${clusters.length} cluster upserts failed for user ${userId}`);
    }

    // Fire-and-forget NL ingestion — don't block the response
    ingestLocationClusters(userId, clusters).catch((err) =>
      log.error('ingestLocationClusters error:', err.message)
    );

    res.json({ success: true, clustersReceived: clusters.length });
  } catch (err) {
    log.error('POST /clusters error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/location/current — lightweight upsert of current lat/lng + sun phase
// Called by frontend SunContext when location is resolved (debounced, ~1x per session)
router.post('/current', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, timezone, sunPhase, source } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'latitude and longitude are required numbers' });
    }

    // Clamp to valid ranges
    const lat = Math.max(-90, Math.min(90, latitude));
    const lng = Math.max(-180, Math.min(180, longitude));

    const locationData = {
      latitude: lat,
      longitude: lng,
      timezone: typeof timezone === 'string' ? timezone.slice(0, 64) : null,
      sun_phase: typeof sunPhase === 'string' ? sunPhase.slice(0, 16) : null,
      source: typeof source === 'string' ? source.slice(0, 16) : 'unknown',
      updated_at: new Date().toISOString(),
    };

    const db = await getSupabase();
    const { error } = await db
      .from('users')
      .update({ last_location: locationData })
      .eq('id', userId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    log.error('POST /current error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/location/current — retrieve last known location (used by twin-chat)
router.get('/current', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getSupabase();
    const { data, error } = await db
      .from('users')
      .select('last_location')
      .eq('id', userId)
      .single();

    if (error) throw error;

    res.json({ success: true, location: data?.last_location || null });
  } catch (err) {
    log.error('GET /current error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/location/status — cluster count for user
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getSupabase();
    const { count, error } = await db
      .from('user_location_clusters')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true, clusterCount: count ?? 0 });
  } catch (err) {
    log.error('GET /status error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
