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
 * a read with new rows pays for placing merchants and recomputing what they say. The
 * readings also carry the clock (a habit gone quiet, an income that has not come, the days
 * left against a cap), so the first run of each day recomputes them for everyone whether
 * or not the bank had news. That is the only place the clock-driven readings move: a page
 * open never waits on a recompute.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution, wasRecentlyRun } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';
import { pullBankFeed, enrichPlaces, refreshReadings, bankFeedUserIds } from '../services/money/store.js';
import { isConfigured } from '../services/money/feeds/enableBanking.js';
import { learnFromLedger } from '../services/money/predictions.js';
import { refreshIfStale as refreshCalendar } from '../services/money/calendar.js';

const log = createLogger('CronMoneyPull');
const router = express.Router();

/** Places looked up per user per run: enough to clear a day's new shops, cheap enough to fit. */
export const PLACE_LOOKUPS_PER_RUN = 8;
/** The run before this hour (UTC) is the day's first, and recomputes every reading. */
export const DAILY_REFRESH_BEFORE_HOUR = 8;
export const isDailyRun = (now = new Date()) => now.getUTCHours() < DAILY_REFRESH_BEFORE_HOUR;
/** Merchants looked up on the day's first run whether or not the bank had news. */
export const DAILY_PLACE_LOOKUPS = 20;

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

    const daily = isDailyRun();
    let read = 0;
    let created = 0;
    let skipped = 0;
    let refreshed = 0;
    for (const userId of userIds) {
      let fresh = 0;
      try {
        const pulled = await pullBankFeed(userId);
        read += 1;
        fresh = pulled.reduce((n, p) => n + (p.created || 0), 0);
        created += fresh;
        if (fresh > 0) {
          await enrichPlaces(userId, { limit: PLACE_LOOKUPS_PER_RUN })
            .catch((e) => log.warn('places after pull failed', { userId, error: e.message }));
        }
      } catch (err) {
        /* A spent budget is the normal state near the end of a day, not a failure. */
        if (err.code === 'feed_budget_spent' || err.code === 'bank_session_unreachable') skipped += 1;
        else log.warn('pull failed', { userId, error: err.message });
      }
      /* New rows, or the day's first run: what the ledger says is recomputed. A bank that
         refused the read does not stop the clock-driven readings from moving. */
      /* The calendar's read, once a day, so the diary cost and the covariates move for a
         person who never opens the calendar. Google or a pasted link; quiet without either.
         And the places nobody has looked up yet, twenty a day, so "not read yet" is a merchant
         no provider knows and never a lookup that did not happen. */
      if (daily) {
        await refreshCalendar(userId)
          .catch((e) => log.warn('calendar refresh failed', { userId, error: e.message }));
        if (fresh === 0) {
          await enrichPlaces(userId, { limit: DAILY_PLACE_LOOKUPS })
            .catch((e) => log.warn('daily places failed', { userId, error: e.message }));
        }
      }
      if (fresh > 0 || daily) {
        const ok = await refreshReadings(userId).then(() => true)
          .catch((e) => { log.warn('readings refresh failed', { userId, error: e.message }); return false; });
        if (ok) refreshed += 1;
      }
      /* Whether or not the bank had news, a day has passed: what it said for today is
         written down, and what it said for yesterday is scored against what happened. */
      await learnFromLedger(userId)
        .catch((e) => log.warn('learning after pull failed', { userId, error: e.message }));
    }

    const elapsed = Date.now() - startedAt;
    log.info('money pull complete', { users: userIds.length, read, created, skipped, refreshed, daily, elapsedMs: elapsed });
    await logCronExecution('money-pull', 'success', elapsed, { users: userIds.length, read, created, skipped, refreshed, daily });
    return res.json({ success: true, users: userIds.length, read, created, skipped, refreshed, daily, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    await logCronExecution('money-pull', 'error', elapsed, null, err.message);
    log.error('cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
