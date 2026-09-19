/**
 * Cron: the day, written down and scored, for every person with a ledger.
 *
 * Schedule: daily at 05:30 UTC, after the last bank read of the night. This used to be the
 * last step of the hourly bank cron, on whatever the bank read left of its minute: on
 * 19 September the read took 37 seconds, the gate was shut, and the day was not written
 * down. The bank cron still learns after a read when it has time (a day with news should be
 * scored on the news); this run is the one that cannot be starved, because it does nothing
 * else and runs for everyone -- a person who imports statements has a ledger to score too,
 * and the bank cron never listed them.
 *
 * Nothing here calls a model. learnFromLedger is reads and arithmetic.
 */
import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';
import { moneyUserIds } from '../services/money/transactionRepository.js';
import { learnFromLedger } from '../services/money/predictions.js';

const log = createLogger('CronMoneyLearn');
const router = express.Router();

/** The whole minute is this job's; a person is skipped only when it is genuinely gone. */
export const BUDGET_MS = 50000;

router.all('/', async (req, res) => {
  const startedAt = Date.now();
  try {
    const auth = verifyCronSecret(req);
    if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

    const userIds = await moneyUserIds();
    let learned = 0; let failed = 0; let skipped = 0; let recorded = 0; let scored = 0;
    for (const userId of userIds) {
      if (Date.now() - startedAt > BUDGET_MS) { skipped += 1; continue; }
      try {
        const r = await learnFromLedger(userId);
        learned += 1; recorded += r?.recorded || 0; scored += r?.scored || 0;
      } catch (err) {
        failed += 1;
        log.warn('learning failed', { userId, error: err.message });
      }
    }
    /* Said out loud: a person not written down looks exactly like a quiet day. */
    if (skipped) log.warn('learning skipped: no time left', { skipped, users: userIds.length, elapsedMs: Date.now() - startedAt });
    const elapsed = Date.now() - startedAt;
    const summary = { users: userIds.length, learned, recorded, scored, failed, skipped };
    log.info('money learn complete', { ...summary, elapsedMs: elapsed });
    const success = failed === 0 && skipped === 0;
    await logCronExecution('money-learn', success ? 'success' : 'error', elapsed, summary);
    return res.status(success ? 200 : 503).json({ success, ...summary, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    await logCronExecution('money-learn', 'error', elapsed, null, err.message);
    log.error('cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
