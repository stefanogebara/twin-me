/**
 * Cron: claim at most three due owners each hour; each owner is due after eight hours.
 * =======================================
 * Until this existed, a ledger only moved when somebody pressed something. A person who
 * opened the app on Thursday saw Monday, and the product's whole promise is that it knows
 * what the month is doing.
 *
 * PSD2 allows four unattended reads of a consent per 24 hours and Santander answers 429
 * past that, so due owners are spread across hourly runs, normally eight hours apart.
 * A database reservation prevents concurrent runs spending the same budget. `pullBankFeed` checks the budget itself and
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
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';
import { pullBankFeed, enrichPlaces, refreshReadings, refreshRecurring, learn, bankFeedUserIds, finishBankFeedJob } from '../services/money/store.js';
import { isConfigured } from '../services/money/feeds/enableBanking.js';
import { learnFromLedger } from '../services/money/predictions.js';
import { refreshIfStale as refreshCalendar } from '../services/money/calendar.js';

const log = createLogger('CronMoneyPull');
const router = express.Router();

/** Places looked up per user per run: enough to clear a day's new shops, cheap enough to fit. */
export const PLACE_LOOKUPS_PER_RUN = 1;
/** The run before this hour (UTC) is the day's first, and recomputes every reading. */
export const DAILY_REFRESH_BEFORE_HOUR = 8;
/* How the minute is shared. The bank read ran until 45 seconds and the loop that writes
   the day down and scores it ran last, on whatever was left: on 19 September the read took
   37 seconds, the loop's gate was shut, and the day was not written down -- silently,
   because a skip was not an error. The bank now stops at 30 so the loop always has the
   time it needs, and a read that is cut short continues next hour from its checkpoint. */
export const PULL_BY_MS = 30000;
export const LEARN_BY_MS = 50000;
export const isDailyRun = (now = new Date()) => now.getUTCHours() < DAILY_REFRESH_BEFORE_HOUR;
/** Merchants looked up on the day's first run whether or not the bank had news. */
export const DAILY_PLACE_LOOKUPS = 1;

router.all('/', async (req, res) => {
  const startedAt = Date.now();
  try {
    const auth = verifyCronSecret(req);
    if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

    if (!isConfigured()) {
      return res.json({ success: true, read: 0, reason: 'bank feed not configured' });
    }
    const userIds = await bankFeedUserIds();

    const daily = isDailyRun();
    let read = 0;
    let created = 0;
    let skipped = 0;
    let refreshed = 0;
    let failed = 0;
    let partial = 0;
    let processed = 0;
    let learned = 0;
    let learnSkipped = 0;
    for (const userId of userIds) {
      if (Date.now()-startedAt > 35000) break; // unstarted leases expire for the next hourly run
      processed++;
      let fresh = 0;
      let outcome = 'ok';
      try {
        const pulled = await pullBankFeed(userId, { deadline: Math.min(startedAt+PULL_BY_MS,Date.now()+15000) });
        const expectedPause = new Set(['continuation_pending', 'time_budget_exhausted', 'already_reading', 'feed_budget_spent']);
        if (pulled.some((p) => p.error && !expectedPause.has(p.error))) { outcome = 'error'; failed++; }
        else if (pulled.some((p) => p.error || p.complete === false)) { outcome = 'partial'; partial++; }
        read += 1;
        fresh = pulled.reduce((n, p) => n + (p.created || 0), 0);
        created += fresh;
        if (fresh > 0 && Date.now()-startedAt < 20000) {
          await enrichPlaces(userId, { limit: 1 })
            .catch((e) => log.warn('places after pull failed', { userId, error: e.message }));
        }
      } catch (err) {
        outcome = 'error';
        /* A spent budget is the normal state near the end of a day, not a failure. */
        if (err.code === 'feed_budget_spent' || err.code === 'bank_session_unreachable') skipped += 1;
        else { failed++; log.warn('pull failed', { userId, error: err.message }); }
      }
      /* New rows, or the day's first run: what the ledger says is recomputed. A bank that
         refused the read does not stop the clock-driven readings from moving. */
      /* The calendar's read, once a day, so the diary cost and the covariates move for a
         person who never opens the calendar. Google or a pasted link; quiet without either.
         And one place nobody has looked up yet, so "not read yet" is a merchant
         no provider knows and never a lookup that did not happen. */
      if (daily && Date.now()-startedAt < 20000) {
        await refreshCalendar(userId)
          .catch((e) => log.warn('calendar refresh failed', { userId, error: e.message }));
        if (fresh === 0) {
          await enrichPlaces(userId, { limit: 1 })
            .catch((e) => log.warn('daily places failed', { userId, error: e.message }));
        }
      }
      if ((fresh > 0 || daily) && Date.now()-startedAt < 30000) {
        /* What comes back, recomputed before anything reads it. This ran only when a page was
           opened, so for a person who stops opening the app every next_expected date fell into
           the past, the projection dropped the series, and the month lost its standing charges
           (2026-09-16). It is pure arithmetic over rows already in hand. */
        await refreshRecurring(userId)
          .catch((e) => log.warn('recurring refresh failed', { userId, error: e.message }));
        const ok = await refreshReadings(userId).then(() => true)
          .catch((e) => { log.warn('readings refresh failed', { userId, error: e.message }); return false; });
        if (ok) refreshed += 1;
      }
      /* The places, the rhythms and what it expects next: also a page-open job until now, so
         the twin could quote a gap measured weeks ago. No model, no network. */
      if (daily && Date.now()-startedAt < 20000) {
        await learn(userId)
          .catch((e) => log.warn('learning failed', { userId, error: e.message }));
      }
      /* Whether or not the bank had news, a day has passed: what it said for today is
         written down, and what it said for yesterday is scored against what happened. */
      await finishBankFeedJob(userId,outcome);
      if (Date.now()-startedAt < LEARN_BY_MS) {
        await learnFromLedger(userId)
          .then(() => { learned++; })
          .catch((e) => log.warn('learning after pull failed', { userId, error: e.message }));
      } else {
        /* Said out loud: a day that was not written down looks exactly like a quiet day. */
        learnSkipped++;
        log.warn('learning skipped: no time left', { userId, elapsedMs: Date.now()-startedAt });
      }
    }

    const elapsed = Date.now() - startedAt;
    log.info('money pull complete', { users: userIds.length, read, created, skipped, refreshed, learned, learnSkipped, daily, elapsedMs: elapsed });
    const success = failed === 0;
    const summary = { users: userIds.length, read, created, skipped, refreshed, failed, partial, learned, learnSkipped, daily, deferred: userIds.length - processed };
    await logCronExecution('money-pull', success ? 'success' : 'error', elapsed, summary);
    return res.status(success ? 200 : 503).json({ success, ...summary, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    await logCronExecution('money-pull', 'error', elapsed, null, err.message);
    log.error('cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
