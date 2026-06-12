/**
 * Cron: Weekly Future Simulation — Doctor Strange mode (MiroFish-lite).
 * =====================================================================
 * Sundays 18:00 UTC (vercel.json: 0 18 * * 0). For users who actually talked
 * to their twin in the last 7 days, run the personal swarm (N twin variations
 * simulate the next month) and store the consensus as a proactive insight —
 * it reaches the user through the existing rails (chat "THINGS I NOTICED" +
 * WhatsApp insight delivery).
 *
 * Cost posture: weekly cadence; engaged-users-only gate; cap 5 users/run;
 * per-user 6-day cooldown inside runWeeklySimulation. ~9 TIER_ANALYSIS calls
 * per user (~$0.01) — pennies at any plausible scale.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { runWeeklySimulation } from '../services/futureSimulationService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronFutureSimulation');
const router = express.Router();

const MAX_USERS_PER_RUN = 5;

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Engaged users only: a future simulation for someone who never talks to
    // their twin is a wasted LLM call AND a wasted delivery.
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from('user_memories')
      .select('user_id')
      .eq('memory_type', 'conversation')
      .gte('created_at', since)
      .limit(500);
    if (error) throw new Error(`active-user query failed: ${error.message}`);

    const userIds = [...new Set((rows || []).map((r) => r.user_id))].slice(0, MAX_USERS_PER_RUN);
    const results = [];
    for (const userId of userIds) {
      try {
        const r = await runWeeklySimulation(userId);
        results.push({ userId, ...r });
      } catch (err) {
        log.warn(`simulation failed for ${userId}: ${err.message}`);
        results.push({ userId, error: err.message });
      }
    }

    const stored = results.filter((r) => r.stored).length;
    log.info(`future simulation complete: ${stored}/${userIds.length} users`);
    return res.json({
      success: true,
      activeUsers: userIds.length,
      stored,
      results,
      elapsed_ms: Date.now() - startTime,
    });
  } catch (err) {
    log.error(`future simulation cron failed: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
