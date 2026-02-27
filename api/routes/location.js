/**
 * Location Routes
 * ===============
 * Privacy-first location clustering endpoint.
 * Raw GPS never stored — only anonymized cluster summaries (centroid + visit patterns).
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { ingestLocationClusters } from '../services/observationIngestion.js';

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
      console.warn(`[Location] ${failed.length}/${clusters.length} cluster upserts failed for user ${userId}`);
    }

    // Fire-and-forget NL ingestion — don't block the response
    ingestLocationClusters(userId, clusters).catch((err) =>
      console.error('[Location] ingestLocationClusters error:', err.message)
    );

    res.json({ success: true, clustersReceived: clusters.length });
  } catch (err) {
    console.error('[Location] POST /clusters error:', err.message);
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
    console.error('[Location] GET /status error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
