/**
 * Cron: the morning line, once a day at 06:30 UTC.
 * ================================================
 * Everyone in the beta lives in Madrid, where that is 08:30 in summer and 07:30 in winter, so
 * one daily run is enough and an hourly one is not justified. No model runs here: the line is
 * computed (services/money/morningLine.js) and leaves as an approved utility template, the only
 * thing WhatsApp lets a business send outside the day a person last wrote. One line a person a
 * day is held by a unique row, not by this job running once.
 */
import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';
import { gather } from '../services/money/chat.js';
import { morningLine, MORNING_TEMPLATE } from '../services/money/morningLine.js';
import { morningRecipients, claimMorningSend, finishMorningSend } from '../services/money/channelStore.js';
import { sendWhatsAppTemplate } from '../services/whatsappService.js';
import { dayIn } from '../services/money/zone.js';

const log = createLogger('CronMoneyMorning');
const router = express.Router();
export const BUDGET_MS = 50000;

const DEFAULT_DEPS = { morningRecipients, gather, morningLine, claimMorningSend, finishMorningSend, sendTemplate: sendWhatsAppTemplate };

export async function runMorning({ now = new Date(), deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const startedAt = Date.now();
  const day = dayIn(now);
  const people = await d.morningRecipients();
  let sent = 0; let skipped = 0; let failed = 0;
  for (const { userId, phone } of people) {
    if (Date.now() - startedAt > BUDGET_MS) { skipped += 1; continue; }
    try {
      const line = d.morningLine(await d.gather(userId, now), now);
      if (!line) { skipped += 1; continue; }
      const id = await d.claimMorningSend(userId, day, { template: MORNING_TEMPLATE, language: line.language });
      if (!id) { skipped += 1; continue; }
      const r = await d.sendTemplate(phone, MORNING_TEMPLATE, line.language, line.variables);
      if (r?.success && !r.suppressed) { await d.finishMorningSend(id, { providerMessageId: r.messageId || null }); sent += 1; }
      else if (r?.suppressed) { await d.finishMorningSend(id, { error: 'suppressed' }); skipped += 1; }
      else { await d.finishMorningSend(id, { error: r?.error || 'send failed' }); failed += 1; }
    } catch (err) {
      failed += 1;
      log.warn('morning line failed', { userId, error: err.message });
    }
  }
  return { recipients: people.length, sent, skipped, failed };
}

router.all('/', async (req, res) => {
  const startedAt = Date.now();
  try {
    const auth = verifyCronSecret(req);
    if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
    const summary = await runMorning();
    const elapsed = Date.now() - startedAt;
    log.info('money morning complete', { ...summary, elapsedMs: elapsed });
    const success = summary.failed === 0;
    await logCronExecution('money-morning', success ? 'success' : 'error', elapsed, summary);
    return res.status(success ? 200 : 503).json({ success, ...summary, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    await logCronExecution('money-morning', 'error', elapsed, null, err.message);
    log.error('cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
});

export default router;
