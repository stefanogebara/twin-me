/**
 * Cron: read the bank, three times a day.
 * =======================================
 * Until this existed, a ledger only moved when somebody pressed something. A person who
 * opened the app on Thursday saw Monday, and the product's whole promise is that it knows
 * what the month is doing.
 *
 * PSD2 allows four unattended reads of a consent per 24 hours and Santander answers 429
 * past that, so this takes three (00:00, 08:00, 16:00 UTC) and leaves one for the person
 * who opens the app and wants it fresh now. `pullBankFeed` checks the budget itself and
 * records every read, so a user who has spent theirs is skipped rather than refused.
 *
 * No model runs here. A read that brings nothing new costs one bank call and nothing else;
 * only a read with new rows pays for placing merchants and recomputing what they say.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution, wasRecentlyRun } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';
import { pullBankFeed, enrichPlaces, refreshReadings, bankFeedUserIds } from '../services/money/store.js';
import { isConfigured } from '../services/money/feeds/enableBanking.js';

const log = createLogger('CronMoneyPull');
const router = express.Router();

/** Places looked up per user per run: enough to clear a day's new shops, cheap enough to fit. */
export const PLACE_LOOKUPS_PER_RUN = 8;

router.all('/', async (req, res) => {
  const startedAt = Date.now();
  try {
    const auth = verifyCronSecret(req);
    if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

    if (!isConfigured()) {
      return res.json({ success: true, read: 0, reason: 'bank feed not configured' });
    }
    /* Three runs a day, so a double fire inside seven hours is a mistake, not a schedule. */
    if (await wasRecentlyRun('money-pull', 7 * 60 * 60 * 1000)) {
      return res.json({ success: true, read: 0, reason: 'cooldown' });
    }

    const userIds = await bankFeedUserIds();

    let read = 0;
    let created = 0;
    let skipped = 0;
    for (const userId of userIds) {
      try {
        const pulled = await pullBankFeed(userId);
        read += 1;
        const fresh = pulled.reduce((n, p) => n + (p.created || 0), 0);
        created += fresh;
        if (fresh > 0) {
          await enrichPlaces(userId, { limit: PLACE_LOOKUPS_PER_RUN })
            .catch((e) => log.warn('places after pull failed', { userId, error: e.message }));
          await refreshReadings(userId)
            .catch((e) => log.warn('readings after pull failed', { userId, error: e.message }));
        }
      } catch (err) {
        /* A spent budget is the normal state near the end of a day, not a failure. */
        if (err.code === 'feed_budget_spent' || err.code === 'bank_session_unreachable') skipped += 1;
        else log.warn('pull failed', { userId, error: err.message });
      }
    }

    const elapsed = Date.now() - startedAt;
    log.info('money pull complete', { users: userIds.length, read, created, skipped, elapsedMs: elapsed });
    await logCronExecution('money-pull', 'success', elapsed, { users: userIds.length, read, created, skipped });
    return res.json({ success: true, users: userIds.length, read, created, skipped, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    await logCronExecution('money-pull', 'error', elapsed, null, err.message);
    log.error('cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
