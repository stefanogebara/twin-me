/**
 * Memory Health Dashboard API
 * ============================
 * GET /api/memory-health
 *
 * Returns quality metrics about the user's memory stream:
 * - Composition by type (fact / reflection / conversation / platform_data)
 * - Average importance by type
 * - Retrieval coverage (% accessed at least once)
 * - Staleness (% older than 90 days)
 * - Expert breakdown (memories per platform expert)
 * - Forgetting preview (what the next weekly cron would do)
 * - Top 10 memories by importance
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { get as redisGet, set as redisSet } from '../services/redisClient.js';
import { getTwinReadinessScore } from '../services/memoryStreamService.js';

const router = express.Router();
const CACHE_TTL_SECONDS = 5 * 60; // 5-minute cache — health data doesn't need sub-second freshness

router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Cache check — avoid 8 parallel full-table scans on every dashboard load
    const cacheKey = `memoryHealth:${userId}`;
    const cached = await redisGet(cacheKey);
    if (cached) {
      return res.json({ success: true, ...cached, cached: true });
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel (readiness score runs alongside DB queries)
    // Memory types to count — avoids Supabase's 1000-row default cap
    const MEMORY_TYPES = ['fact', 'reflection', 'conversation', 'platform_data', 'observation'];

    const [
      totalCountResult,
      ...perTypeResults
    ] = await Promise.all([
      // 0. Exact total count
      supabaseAdmin
        .from('user_memories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),

      // 1-5. Per-type exact counts + avg importance (no 1000-row cap)
      ...MEMORY_TYPES.map(type =>
        supabaseAdmin.rpc('get_type_stats', { p_user_id: userId, p_type: type })
      ),
    ]);

    // Gather remaining queries in parallel
    const [
      retrievalResult,
      staleResult,
      expertResult,
      forgettingT1Result,
      forgettingT2Result,
      forgettingT3Result,
      topMemoriesResult,
      readinessResult,
    ] = await Promise.all([
      // Retrieval coverage: exact count with retrieval_count > 0
      supabaseAdmin
        .from('user_memories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('retrieval_count', 0),

      // 3. Staleness: count older than 90 days
      supabaseAdmin
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lt('created_at', ninetyDaysAgo),

      // 4. Expert breakdown: reflections grouped by expert in metadata
      supabaseAdmin
        .from('user_memories')
        .select('metadata')
        .eq('user_id', userId)
        .eq('memory_type', 'reflection')
        .not('metadata', 'is', null),

      // 5. Forgetting T1 preview: conversation > 30d + importance ≤ 3 + retrieval_count < 3
      supabaseAdmin
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('memory_type', 'conversation')
        .lt('created_at', thirtyDaysAgo)
        .lte('importance_score', 3)
        .lt('retrieval_count', 3),

      // 6. Forgetting T2 preview: platform_data > 14d + importance ≤ 4 + never retrieved
      supabaseAdmin
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('memory_type', 'platform_data')
        .lt('created_at', fourteenDaysAgo)
        .lte('importance_score', 4)
        .eq('retrieval_count', 0),

      // 7. Forgetting T3 preview: fact > 90d + importance ≤ 5 + retrieval_count < 3
      supabaseAdmin
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('memory_type', 'fact')
        .lt('created_at', ninetyDaysAgo)
        .lte('importance_score', 5)
        .lt('retrieval_count', 3),

      // 8. Top 10 memories by importance
      supabaseAdmin
        .from('user_memories')
        .select('id, memory_type, content, importance_score, retrieval_count, created_at, metadata')
        .eq('user_id', userId)
        .order('importance_score', { ascending: false })
        .limit(10),

      // 9. Twin Readiness Score — uses its own getMemoryStats internally
      getTwinReadinessScore(userId),
    ]);

    // Process composition from per-type exact counts
    const totalCount = totalCountResult.count ?? 0;
    const composition = {};
    const avgImportanceByType = {};

    for (let i = 0; i < MEMORY_TYPES.length; i++) {
      const type = MEMORY_TYPES[i];
      const result = perTypeResults[i];
      const row = result.data?.[0];
      if (row && row.cnt > 0) {
        composition[type] = row.cnt;
        avgImportanceByType[type] = parseFloat((row.avg_importance || 0).toFixed(2));
      }
    }

    // Retrieval coverage (exact count, no 1000-row cap)
    const retrievedCount = retrievalResult.count || 0;
    const retrievalCoverage = totalCount > 0 ? parseFloat((retrievedCount / totalCount).toFixed(3)) : 0;

    // Staleness
    const staleCount = staleResult.count || 0;
    const stalePct = totalCount > 0 ? parseFloat((staleCount / totalCount).toFixed(3)) : 0;

    // Expert breakdown
    const expertBreakdown = {};
    for (const row of (expertResult.data || [])) {
      const meta = row.metadata || {};
      const expertName = meta.expert || meta.expertType || 'Unknown';
      expertBreakdown[expertName] = (expertBreakdown[expertName] || 0) + 1;
    }

    // Format top memories
    const topMemories = (topMemoriesResult.data || []).map(m => ({
      id: m.id,
      type: m.memory_type,
      excerpt: (m.content || '').slice(0, 120),
      importance: m.importance_score,
      retrievalCount: m.retrieval_count || 0,
      agedays: Math.floor((now - new Date(m.created_at)) / (1000 * 60 * 60 * 24)),
    }));

    const responseData = {
      totalCount,
      composition,
      avgImportanceByType,
      retrievalCoverage,
      stalePct,
      staleCount,
      expertBreakdown,
      forgettingPreview: {
        wouldArchiveConversation: forgettingT1Result.count || 0,
        wouldArchivePlatformData: forgettingT2Result.count || 0,
        wouldDecayFact: forgettingT3Result.count || 0,
      },
      topMemories,
      readiness: {
        score: readinessResult.score,
        label: readinessResult.label,
        breakdown: readinessResult.breakdown,
      },
    };

    // Cache for 5 minutes — non-blocking write
    redisSet(cacheKey, responseData, CACHE_TTL_SECONDS).catch(() => {});

    res.json({ success: true, ...responseData, cached: false });
  } catch (err) {
    console.error('[memory-health] Error:', err.message);
    res.status(500).json({ error: process.env.NODE_ENV === 'development' ? err.message : 'Failed to load memory health data' });
  }
});

export default router;
