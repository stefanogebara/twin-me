/**
 * Vercel Cron Job: Multi-Tier Memory Forgetting
 * ==============================================
 * Runs weekly (Sunday 3am UTC). Implements tiered forgetting to maintain
 * memory quality over time — lower-signal memories fade, higher-signal ones
 * persist. Different tiers use different time windows and actions.
 *
 * Tier 1 — Moderate (conversation):   >90 days + importance ≤2 → archive
 * Tier 2 — Moderate (platform_data):  >30 days + importance ≤4 + retrieval_count=0 → archive
 * Tier 3 — Gentle (fact):             >90 days + importance ≤5 → decay importance by 20%
 * Tier 6 — Stale reflections:         >90 days + importance <8 + retrieval_count=0 → archive
 *
 * Protected (NEVER touched):
 *   - importance ≥ 8 (explicitly high-value)
 *   - retrieval_count ≥ 3 (frequently accessed)
 *
 * This complements the existing daily cron-memory-archive.js (which archives
 * any type >6 months + importance ≤5 for users with >5K memories).
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronMemoryForgetting');

const router = express.Router();

// How many memories to process per batch (avoid timeout on large tables)
const BATCH_SIZE = 500;

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    // Verify cron secret (timing-safe)
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    log.info('Starting weekly pass');

    const stats = {
      tier1Archived: 0,
      tier2Archived: 0,
      tier3Decayed: 0,
      errors: [],
    };

    // ── Tier 1: Conversation memories > 90 days + importance ≤ 2 → archive ──
    // Extended from 30d/≤3 to 90d/≤2 to retain more conversation context (was only 5.2% of stream)
    try {
      const tier1Cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const { data: tier1Rows } = await supabaseAdmin
        .from('user_memories')
        .select('id, user_id, content, memory_type, metadata, importance_score, created_at, last_accessed_at')
        .eq('memory_type', 'conversation')
        .lt('created_at', tier1Cutoff)
        .lte('importance_score', 2)
        .lt('retrieval_count', 3)  // not frequently accessed
        .limit(BATCH_SIZE);

      if (tier1Rows && tier1Rows.length > 0) {
        // Archive: copy to user_memories_archive, then delete from hot table
        const { error: insertErr } = await supabaseAdmin
          .from('user_memories_archive')
          .insert(tier1Rows.map(r => ({ ...r, archived_at: new Date().toISOString(), archive_reason: 'tier1_conversation_aged' })));

        if (!insertErr) {
          const ids = tier1Rows.map(r => r.id);
          await supabaseAdmin.from('user_memories').delete().in('id', ids);
          stats.tier1Archived = tier1Rows.length;
          log.info('Tier 1 archived conversation memories', { count: tier1Rows.length });
        } else {
          log.warn('Tier 1 archive insert failed', { error: insertErr.message });
          stats.errors.push(`tier1: ${insertErr.message}`);
        }
      }
    } catch (t1Err) {
      log.warn('Tier 1 error', { error: t1Err.message });
      stats.errors.push(`tier1: ${t1Err.message}`);
    }

    // ── Tier 2: Platform data > 30 days + importance ≤ 4 + retrieval_count=0 → archive ──
    try {
      const tier2Cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: tier2Rows } = await supabaseAdmin
        .from('user_memories')
        .select('id, user_id, content, memory_type, metadata, importance_score, created_at, last_accessed_at')
        .eq('memory_type', 'platform_data')
        .lt('created_at', tier2Cutoff)
        .lte('importance_score', 4)
        .eq('retrieval_count', 0)   // never retrieved — truly unused
        .limit(BATCH_SIZE);

      if (tier2Rows && tier2Rows.length > 0) {
        const { error: insertErr } = await supabaseAdmin
          .from('user_memories_archive')
          .insert(tier2Rows.map(r => ({ ...r, archived_at: new Date().toISOString(), archive_reason: 'tier2_platform_data_unread' })));

        if (!insertErr) {
          const ids = tier2Rows.map(r => r.id);
          await supabaseAdmin.from('user_memories').delete().in('id', ids);
          stats.tier2Archived = tier2Rows.length;
          log.info('Tier 2 archived platform_data memories', { count: tier2Rows.length });
        } else {
          log.warn('Tier 2 archive insert failed', { error: insertErr.message });
          stats.errors.push(`tier2: ${insertErr.message}`);
        }
      }
    } catch (t2Err) {
      log.warn('Tier 2 error', { error: t2Err.message });
      stats.errors.push(`tier2: ${t2Err.message}`);
    }

    // ── Tier 3: Fact memories > 90 days + importance ≤ 5 → decay importance by 20% ──
    // Gentle — we don't archive facts, just weaken them so they rank lower in retrieval
    try {
      const tier3Cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const { data: tier3Rows } = await supabaseAdmin
        .from('user_memories')
        .select('id, importance_score')
        .eq('memory_type', 'fact')
        .lt('created_at', tier3Cutoff)
        .lte('importance_score', 5)
        .lt('retrieval_count', 3)   // not frequently accessed
        .limit(BATCH_SIZE);

      if (tier3Rows && tier3Rows.length > 0) {
        // Group by target score to batch updates (instead of row-by-row)
        const scoreGroups = new Map(); // newScore -> [ids]
        for (const row of tier3Rows) {
          const newScore = Math.max(1, Math.round(row.importance_score * 0.8));
          if (newScore < row.importance_score) {
            if (!scoreGroups.has(newScore)) scoreGroups.set(newScore, []);
            scoreGroups.get(newScore).push(row.id);
          }
        }
        for (const [newScore, ids] of scoreGroups) {
          await supabaseAdmin
            .from('user_memories')
            .update({ importance_score: newScore })
            .in('id', ids);
          stats.tier3Decayed += ids.length;
        }
        log.info('Tier 3 decayed fact memories', { count: stats.tier3Decayed, batches: scoreGroups.size });
      }
    } catch (t3Err) {
      log.warn('Tier 3 error', { error: t3Err.message });
      stats.errors.push(`tier3: ${t3Err.message}`);
    }

    // ── Tier 4: STDP exponential co-citation link decay ──
    // Uses exponential decay with 30-day grace period:
    //   new_strength = old_strength * DECAY_FACTOR^max(0, days_since_reinforcement - GRACE_DAYS)
    // Links below PRUNE_THRESHOLD are deleted. Only co_citation links are affected.
    const STDP_DECAY_FACTOR = 0.92; // ~8-day half-life after grace period
    const STDP_GRACE_DAYS = 30;     // no decay within 30 days of reinforcement
    const STDP_PRUNE_THRESHOLD = 0.1;
    stats.tier4LinksDecayed = 0;
    stats.tier4LinksDeleted = 0;
    try {
      // Only consider links not reinforced within the grace period
      const tier4Cutoff = new Date(Date.now() - STDP_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: staleLinks } = await supabaseAdmin
        .from('memory_links')
        .select('id, strength, last_reinforced_at, updated_at')
        .eq('link_type', 'co_citation')
        .lt('last_reinforced_at', tier4Cutoff)
        .limit(BATCH_SIZE);

      if (staleLinks && staleLinks.length > 0) {
        const now = Date.now();
        const toDelete = [];
        const toUpdate = []; // { id, newStrength }
        for (const link of staleLinks) {
          const reinforcedAt = link.last_reinforced_at || link.updated_at;
          const daysSince = (now - new Date(reinforcedAt).getTime()) / 86400000;
          const decayDays = Math.max(0, daysSince - STDP_GRACE_DAYS);
          const newStrength = link.strength * Math.pow(STDP_DECAY_FACTOR, decayDays);

          if (newStrength <= STDP_PRUNE_THRESHOLD) {
            toDelete.push(link.id);
          } else if (newStrength < link.strength - 0.001) {
            toUpdate.push({ id: link.id, strength: parseFloat(newStrength.toFixed(4)) });
          }
        }
        // Batch delete pruned links
        if (toDelete.length > 0) {
          await supabaseAdmin.from('memory_links').delete().in('id', toDelete);
          stats.tier4LinksDeleted = toDelete.length;
        }
        // Batch update decayed links (grouped by rounded strength to reduce queries)
        const strengthGroups = new Map(); // roundedStrength -> [ids]
        for (const item of toUpdate) {
          const key = item.strength;
          if (!strengthGroups.has(key)) strengthGroups.set(key, []);
          strengthGroups.get(key).push(item.id);
        }
        for (const [strength, ids] of strengthGroups) {
          await supabaseAdmin.from('memory_links')
            .update({ strength })
            .in('id', ids);
        }
        stats.tier4LinksDecayed = toUpdate.length;
        log.info('Tier 4 STDP decay complete', { decayed: stats.tier4LinksDecayed, pruned: stats.tier4LinksDeleted });
      }
    } catch (t4Err) {
      log.warn('Tier 4 error', { error: t4Err.message });
      stats.errors.push(`tier4: ${t4Err.message}`);
    }

    // ── Tier 5: Homeostatic importance regulation (per-user) ──
    // Prevent importance score inflation: if a user's mean drifts > 1.0 from 5.0, shift 20% back
    // Never touch scores of 1 or 10 (anchored extremes)
    stats.tier5Shifted = 0;
    stats.tier5UsersProcessed = 0;
    try {
      // Get distinct user_ids with >100 memories
      const { data: activeUsers } = await supabaseAdmin
        .from('user_memories')
        .select('user_id')
        .not('importance_score', 'is', null)
        .limit(5000);

      // Dedupe user IDs
      const userIds = [...new Set((activeUsers || []).map(r => r.user_id))];

      for (const uid of userIds) {
        try {
          const { data: importanceStats } = await supabaseAdmin.rpc('get_importance_stats', { p_user_id: uid });

          if (importanceStats && importanceStats.length > 0) {
            const { mean_importance, total_count } = importanceStats[0];
            if (!mean_importance || total_count < 100) continue;

            const drift = mean_importance - 5.0;

            if (Math.abs(drift) > 1.0) {
              const shiftAmount = drift > 0 ? -1 : 1;
              const direction = drift > 0 ? 'down' : 'up';
              const shiftLimit = Math.min(500, Math.round(total_count * 0.05 * Math.abs(drift)));

              const { data: shiftResult } = await supabaseAdmin.rpc('apply_importance_shift', {
                p_shift: shiftAmount,
                p_limit: shiftLimit,
                p_user_id: uid,
              });

              const shifted = shiftResult?.[0]?.shifted_count || 0;
              stats.tier5Shifted += shifted;
              stats.tier5UsersProcessed++;
              if (shifted > 0) {
                log.info('Tier 5 importance shift', { userId: uid.substring(0, 8), direction, mean: mean_importance.toFixed(2), shifted });
              }
            }
          }
        } catch (userErr) {
          // Non-fatal per-user error
          log.warn('Tier 5 error for user', { userId: uid.substring(0, 8), error: userErr.message });
        }
      }
    } catch (t5Err) {
      log.warn('Tier 5 error', { error: t5Err.message });
      stats.errors.push(`tier5: ${t5Err.message}`);
    }

    // ── Tier 6: Stale reflection archival ──
    // Reflections >90 days old, never retrieved, importance <8 → archive
    // This prevents immortal low-value reflections from dominating the memory stream
    stats.tier6ReflectionsArchived = 0;
    try {
      const tier6Cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: tier6Rows } = await supabaseAdmin
        .from('user_memories')
        .select('id, content, memory_type, importance_score, metadata, created_at')
        .eq('memory_type', 'reflection')
        .lt('created_at', tier6Cutoff)
        .lt('importance_score', 8)
        .eq('retrieval_count', 0)
        .limit(BATCH_SIZE);

      if (tier6Rows?.length > 0) {
        const ids = tier6Rows.map(r => r.id);
        // Follow Tier 1/2 pattern: move to archive table, then delete from user_memories
        await supabaseAdmin
          .from('user_memories_archive')
          .insert(tier6Rows.map(r => ({ ...r, archived_at: new Date().toISOString(), archive_reason: 'tier6_reflection_stale' })));
        await supabaseAdmin
          .from('user_memories')
          .delete()
          .in('id', ids);
        stats.tier6ReflectionsArchived = ids.length;
        log.info('Tier 6 archived stale reflections', { count: ids.length });
      }
    } catch (t6Err) {
      log.warn('Tier 6 error', { error: t6Err.message });
      stats.errors.push(`tier6: ${t6Err.message}`);
    }

    const durationMs = Date.now() - startTime;
    log.info('Weekly pass complete', { durationMs, t1: stats.tier1Archived, t2: stats.tier2Archived, t3: stats.tier3Decayed, t4Decayed: stats.tier4LinksDecayed, t4Deleted: stats.tier4LinksDeleted, t5: stats.tier5Shifted, t5Users: stats.tier5UsersProcessed, t6: stats.tier6ReflectionsArchived });

    await logCronExecution('memory-forgetting', 'success', durationMs, stats);

    res.json({
      success: true,
      ...stats,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logCronExecution('memory-forgetting', 'error', durationMs, null, err.message);
    log.error('Unexpected error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
