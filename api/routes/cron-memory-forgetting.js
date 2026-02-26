/**
 * Vercel Cron Job: Multi-Tier Memory Forgetting
 * ==============================================
 * Runs weekly (Sunday 3am UTC). Implements tiered forgetting to maintain
 * memory quality over time — lower-signal memories fade, higher-signal ones
 * persist. Different tiers use different time windows and actions.
 *
 * Tier 1 — Aggressive (conversation): >30 days + importance ≤3 → archive
 * Tier 2 — Moderate (platform_data):  >14 days + importance ≤4 + retrieval_count=0 → archive
 * Tier 3 — Gentle (fact):             >90 days + importance ≤5 → decay importance by 20%
 *
 * Protected (NEVER touched):
 *   - importance ≥ 8 (explicitly high-value)
 *   - retrieval_count ≥ 3 (frequently accessed)
 *   - memory_type = 'reflection' (generated insights are never auto-purged)
 *
 * This complements the existing daily cron-memory-archive.js (which archives
 * any type >6 months + importance ≤5 for users with >5K memories).
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';

const router = express.Router();

// How many memories to process per batch (avoid timeout on large tables)
const BATCH_SIZE = 500;

router.post('/', async (req, res) => {
  try {
    // Verify cron secret
    const cronSecret = req.headers['x-vercel-cron-secret'] || req.headers['authorization'];
    const expectedSecret = process.env.CRON_SECRET;
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (!isDevelopment) {
      if (!expectedSecret) {
        return res.status(500).json({ error: 'CRON_SECRET not configured' });
      }
      if (cronSecret !== expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    console.log('[Cron] memory-forgetting: starting weekly pass');
    const startTime = Date.now();

    const stats = {
      tier1Archived: 0,
      tier2Archived: 0,
      tier3Decayed: 0,
      errors: [],
    };

    // ── Tier 1: Conversation memories > 30 days + importance ≤ 3 → archive ──
    try {
      const tier1Cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: tier1Rows } = await supabaseAdmin
        .from('user_memories')
        .select('id, user_id, content, memory_type, metadata, importance_score, created_at, last_accessed_at')
        .eq('memory_type', 'conversation')
        .lt('created_at', tier1Cutoff)
        .lte('importance_score', 3)
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
          console.log(`[Cron] memory-forgetting: Tier 1 archived ${tier1Rows.length} conversation memories`);
        } else {
          console.warn('[Cron] memory-forgetting: Tier 1 archive insert failed:', insertErr.message);
          stats.errors.push(`tier1: ${insertErr.message}`);
        }
      }
    } catch (t1Err) {
      console.warn('[Cron] memory-forgetting: Tier 1 error:', t1Err.message);
      stats.errors.push(`tier1: ${t1Err.message}`);
    }

    // ── Tier 2: Platform data > 14 days + importance ≤ 4 + retrieval_count=0 → archive ──
    try {
      const tier2Cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

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
          console.log(`[Cron] memory-forgetting: Tier 2 archived ${tier2Rows.length} platform_data memories`);
        } else {
          console.warn('[Cron] memory-forgetting: Tier 2 archive insert failed:', insertErr.message);
          stats.errors.push(`tier2: ${insertErr.message}`);
        }
      }
    } catch (t2Err) {
      console.warn('[Cron] memory-forgetting: Tier 2 error:', t2Err.message);
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
        // Batch update: decay by 20%, floor at 1
        for (const row of tier3Rows) {
          const newScore = Math.max(1, Math.round(row.importance_score * 0.8));
          if (newScore < row.importance_score) {
            await supabaseAdmin
              .from('user_memories')
              .update({ importance_score: newScore })
              .eq('id', row.id);
            stats.tier3Decayed++;
          }
        }
        console.log(`[Cron] memory-forgetting: Tier 3 decayed ${stats.tier3Decayed} fact memories`);
      }
    } catch (t3Err) {
      console.warn('[Cron] memory-forgetting: Tier 3 error:', t3Err.message);
      stats.errors.push(`tier3: ${t3Err.message}`);
    }

    const durationMs = Date.now() - startTime;
    console.log(`[Cron] memory-forgetting: done in ${durationMs}ms. t1=${stats.tier1Archived} t2=${stats.tier2Archived} t3=${stats.tier3Decayed}`);

    res.json({
      success: true,
      ...stats,
      durationMs,
    });
  } catch (err) {
    console.error('[Cron] memory-forgetting: unexpected error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
