/**
 * Transactions API — Financial-Emotional Twin (Phase 2A)
 * =======================================================
 * POST /api/transactions/upload  — parse CSV/OFX, insert, kick off emotion tagging
 * GET  /api/transactions         — list recent transactions with emotional context
 * GET  /api/transactions/summary — 30-day totals + emotional-spend ratio
 */

import express from 'express';
import multer from 'multer';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { parseBankStatement } from '../services/transactions/parserDispatcher.js';
import { tagTransactionsBatch } from '../services/transactions/transactionEmotionTagger.js';
import { normalizeMerchant } from '../services/transactions/merchantNormalizer.js';
import { detectAndMarkRecurring } from '../services/transactions/recurrenceDetector.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('transactions-api');
const router = express.Router();

// File upload config — memory storage, 10MB max. CSV/OFX text files are tiny.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|ofx|txt)$/i.test(file.originalname) ||
      ['text/csv', 'text/plain', 'application/x-ofx', 'application/octet-stream'].includes(file.mimetype);
    if (!ok) return cb(new Error('Only CSV or OFX files are supported'));
    cb(null, true);
  },
});

/**
 * POST /api/transactions/upload
 * multipart/form-data with a `file` field (CSV or OFX).
 */
router.post('/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'file is required (multipart field name: file)' });
    }

    const { buffer, originalname } = req.file;
    const parsed = await parseBankStatement(buffer, { filename: originalname });

    if (!parsed.transactions.length) {
      return res.status(400).json({
        success: false,
        error: 'No transactions parsed from file',
        detail: parsed.errors,
        format: parsed.format,
      });
    }

    // Annotate rows for insert — normalize merchant + infer category at ingest time
    const rows = parsed.transactions.map((t) => {
      const { brand, category } = normalizeMerchant(t.merchant_raw);
      return {
        user_id: userId,
        external_id: t.external_id,
        amount: t.amount,
        currency: t.currency || 'BRL',
        merchant_raw: t.merchant_raw,
        merchant_normalized: brand,
        category,
        transaction_date: t.transaction_date,
        source_bank: parsed.sourceBank,
        source_file_hash: parsed.fileHash,
        account_type: t.account_type,
      };
    });

    // Upsert on (user_id, external_id) — idempotent reimports
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('user_transactions')
      .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: false })
      .select('id, transaction_date, amount, merchant_raw');

    if (insertErr) {
      log.error('insert failed', insertErr);
      return res.status(500).json({ success: false, error: 'Failed to save transactions', detail: insertErr.message });
    }

    const insertedIds = (inserted || []).map((r) => r.id);

    // Detect recurring charges BEFORE tagging so stress-shop rule can exclude them.
    // Netflix monthly, gym, Friday iFood habit = not impulses. Fast — single
    // query + in-memory grouping, no external calls.
    try {
      await detectAndMarkRecurring(userId);
    } catch (err) {
      log.warn(`recurrence detector failed (non-fatal): ${err.message}`);
    }

    // Await tagging synchronously so the response reflects final state.
    // Vercel kills serverless lambdas after response returns — fire-and-forget
    // tagging gets truncated. Batch tagger is ~2-3s for 20 rows (prefetches
    // platform_data once then joins in memory), well within maxDuration 60s.
    let tagResult = { tagged: 0, errors: 0 };
    try {
      tagResult = await tagTransactionsBatch(userId, insertedIds);
    } catch (err) {
      log.warn(`tagger failed (non-fatal): ${err.message}`);
    }

    return res.json({
      success: true,
      format: parsed.format,
      source_bank: parsed.sourceBank,
      account_type: parsed.accountType,
      inserted: insertedIds.length,
      tagged: tagResult.tagged,
      tag_errors: tagResult.errors,
      parse_errors: parsed.errors,
      file_hash: parsed.fileHash,
    });
  } catch (err) {
    log.error('upload error', err);
    return res.status(500).json({ success: false, error: err.message || 'upload failed' });
  }
});

/**
 * GET /api/transactions
 * Query: limit (default 50, max 200), offset (default 0), account_type, since (ISO date)
 * Returns transactions with emotional_context joined.
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const accountType = typeof req.query.account_type === 'string' ? req.query.account_type : null;
    const since = typeof req.query.since === 'string' ? req.query.since : null;

    let query = supabaseAdmin
      .from('user_transactions')
      .select(`
        id, amount, currency, merchant_raw, merchant_normalized, category,
        transaction_date, source_bank, account_type, is_recurring, created_at,
        emotional_context:transaction_emotional_context (
          hrv_score, recovery_score, sleep_score, music_valence, calendar_load,
          computed_stress_score, is_stress_shop_candidate, signals_found
        )
      `)
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (accountType) query = query.eq('account_type', accountType);
    if (since) query = query.gte('transaction_date', since);

    const { data, error } = await query;
    if (error) throw error;

    // Supabase returns emotional_context as an array (1-to-1 relation) — flatten
    const flattened = (data || []).map((row) => ({
      ...row,
      emotional_context: Array.isArray(row.emotional_context) ? row.emotional_context[0] ?? null : row.emotional_context,
    }));

    return res.json({ success: true, transactions: flattened, limit, offset });
  } catch (err) {
    log.error('list error', err);
    return res.status(500).json({ success: false, error: err.message || 'list failed' });
  }
});

/**
 * GET /api/transactions/summary
 * Returns: total outflow last 30 days, emotional-spend ratio, stress-shop count.
 */
router.get('/summary', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('user_transactions')
      .select(`
        amount,
        currency,
        account_type,
        emotional_context:transaction_emotional_context (
          computed_stress_score, is_stress_shop_candidate
        )
      `)
      .eq('user_id', userId)
      .gte('transaction_date', thirtyDaysAgo);

    if (error) throw error;

    const rows = data || [];
    let totalOutflow = 0;
    let totalInflow = 0;
    let stressShopCount = 0;
    let stressShopTotal = 0;
    let highStressOutflow = 0;

    // Per-currency breakdown so the frontend can render mixed-currency users
    // correctly. Each bucket: { currency: 'BRL', outflow: n, inflow: n, count: n }.
    const byCurrency = new Map();
    function bucket(cur) {
      const k = (cur || 'BRL').toUpperCase();
      if (!byCurrency.has(k)) byCurrency.set(k, { currency: k, outflow: 0, inflow: 0, count: 0, stress_shop_total: 0 });
      return byCurrency.get(k);
    }

    for (const t of rows) {
      const b = bucket(t.currency);
      b.count++;
      if (t.amount < 0) { totalOutflow += Math.abs(t.amount); b.outflow += Math.abs(t.amount); }
      else { totalInflow += t.amount; b.inflow += t.amount; }

      const ec = Array.isArray(t.emotional_context) ? t.emotional_context[0] : t.emotional_context;
      if (ec?.is_stress_shop_candidate) {
        stressShopCount++;
        if (t.amount < 0) {
          stressShopTotal += Math.abs(t.amount);
          b.stress_shop_total += Math.abs(t.amount);
        }
      }
      if (ec?.computed_stress_score !== null && ec?.computed_stress_score >= 0.6 && t.amount < 0) {
        highStressOutflow += Math.abs(t.amount);
      }
    }

    const emotionalSpendRatio = totalOutflow > 0 ? highStressOutflow / totalOutflow : null;
    const currencies = [...byCurrency.values()]
      .map((b) => ({
        currency: b.currency,
        outflow: Math.round(b.outflow * 100) / 100,
        inflow: Math.round(b.inflow * 100) / 100,
        count: b.count,
        stress_shop_total: Math.round(b.stress_shop_total * 100) / 100,
      }))
      .sort((a, b) => b.outflow - a.outflow);

    return res.json({
      success: true,
      window_days: 30,
      transaction_count: rows.length,
      total_outflow: Math.round(totalOutflow * 100) / 100,
      total_inflow: Math.round(totalInflow * 100) / 100,
      stress_shop_count: stressShopCount,
      stress_shop_total: Math.round(stressShopTotal * 100) / 100,
      high_stress_outflow: Math.round(highStressOutflow * 100) / 100,
      emotional_spend_ratio: emotionalSpendRatio,
      // Phase 3 multi-currency: per-currency breakdown. Sorted by outflow desc
      // so [0] is the dominant currency.
      currencies,
    });
  } catch (err) {
    log.error('summary error', err);
    return res.status(500).json({ success: false, error: err.message || 'summary failed' });
  }
});

/**
 * POST /api/transactions/retag
 * Re-runs emotion tagging for all user transactions. Useful after connecting
 * a new platform (Whoop, Spotify, Calendar) — picks up new signals.
 */
router.post('/retag', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    // Fetch full rows so we can also backfill merchant_normalized + category
    const { data: txns, error } = await supabaseAdmin
      .from('user_transactions')
      .select('id, merchant_raw, merchant_normalized, category')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .limit(500);

    if (error) throw error;

    // Backfill merchant + category for rows that lack it
    const backfillUpdates = [];
    for (const t of txns || []) {
      if (!t.merchant_normalized || !t.category || t.category === 'other') {
        const { brand, category } = normalizeMerchant(t.merchant_raw);
        if (brand || (category && category !== 'other')) {
          backfillUpdates.push({ id: t.id, merchant_normalized: brand, category });
        }
      }
    }
    let backfilled = 0;
    for (const u of backfillUpdates) {
      const { error: updErr } = await supabaseAdmin
        .from('user_transactions')
        .update({ merchant_normalized: u.merchant_normalized, category: u.category })
        .eq('id', u.id)
        .eq('user_id', userId);
      if (!updErr) backfilled++;
    }

    // Re-detect recurring before tagging so the rule picks up newly-recurring patterns
    let recurringStats = { scanned: 0, marked_recurring: 0 };
    try {
      recurringStats = await detectAndMarkRecurring(userId);
    } catch (err) {
      log.warn(`recurrence detector failed (non-fatal): ${err.message}`);
    }

    const ids = (txns || []).map((r) => r.id);
    const result = await tagTransactionsBatch(userId, ids);
    return res.json({
      success: true,
      ...result,
      merchants_backfilled: backfilled,
      recurring_scan: recurringStats,
    });
  } catch (err) {
    log.error('retag error', err);
    return res.status(500).json({ success: false, error: err.message || 'retag failed' });
  }
});

/**
 * GET /api/transactions/by-category
 * Returns 30-day spending breakdown grouped by category.
 */
router.get('/by-category', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('user_transactions')
      .select('amount, category')
      .eq('user_id', userId)
      .lt('amount', 0) // outflows only
      .gte('transaction_date', thirtyDaysAgo);

    if (error) throw error;

    const totals = {};
    for (const row of data || []) {
      const cat = row.category || 'other';
      totals[cat] = (totals[cat] || 0) + Math.abs(row.amount);
    }

    const breakdown = Object.entries(totals)
      .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    return res.json({ success: true, window_days: 30, breakdown });
  } catch (err) {
    log.error('by-category error', err);
    return res.status(500).json({ success: false, error: err.message || 'by-category failed' });
  }
});

/**
 * GET /api/transactions/patterns
 * The UVP-defining endpoint: returns the top 3 stress-spending patterns detected
 * across the last 90 days. Plain-language headlines like "dias de stress alto =
 * 2.1x mais delivery". Only surfaces patterns with n>=4 samples and ratio>=1.5x.
 */
router.get('/patterns', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const { getSpendingPatterns } = await import('../services/transactions/spendingPatternService.js');
    const result = await getSpendingPatterns(userId);
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error('patterns error', err);
    return res.status(500).json({ success: false, error: err.message || 'patterns failed' });
  }
});

/**
 * GET /api/transactions/stress-shop-score
 * Returns the user's CURRENT real-time stress-shop risk score based on the
 * last 24h of biology/mood/calendar signals. Called by the browser extension
 * content script when a user lands on a checkout page.
 *
 * Response:
 *   {
 *     success: true,
 *     score: 0.72,                 // 0-1, higher = more stressed
 *     signals_found: 3,            // number of signal types contributing
 *     signals: { recovery, music_valence, calendar_load_12h, sleep },
 *     should_nudge: true,          // true when score >= 0.65
 *     reason: "HRV dropped and you have 3 meetings today"
 *   }
 */
router.get('/stress-shop-score', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Use the same prefetch pattern as the batch tagger.
    const { data: rows, error } = await supabaseAdmin
      .from('user_platform_data')
      .select('platform, data_type, raw_data, extracted_at')
      .eq('user_id', userId)
      .in('platform', ['whoop', 'oura', 'garmin', 'fitbit', 'spotify', 'calendar', 'google_calendar'])
      .gte('extracted_at', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('extracted_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    const { getEffectiveEventTime } = await import('../services/transactions/transactionEmotionTagger.js');

    const components = [];
    let signalsFound = 0;
    const signals = { recovery: null, hrv: null, music_valence: null, calendar_load_12h: null, sleep: null };
    const reasons = [];

    // Biology: take the most recent row within 24h
    const bioRows = (rows || []).filter((r) =>
      ['whoop', 'oura', 'garmin', 'fitbit'].includes(r.platform) &&
      getEffectiveEventTime(r) &&
      getEffectiveEventTime(r) >= twentyFourHoursAgo,
    );
    if (bioRows.length) {
      const latest = bioRows.sort((a, b) => (getEffectiveEventTime(b) - getEffectiveEventTime(a)))[0];
      const d = latest.raw_data || {};
      signals.recovery = d.recovery_score ?? null;
      signals.hrv = d.hrv_rmssd_milli ?? d.hrv ?? null;
      signals.sleep = d.sleep_performance_percentage ?? d.sleep_score ?? null;
      if (signals.recovery !== null) {
        components.push({ weight: 0.45, value: 1 - signals.recovery / 100 });
        signalsFound++;
        if (signals.recovery < 50) reasons.push(`recovery at ${Math.round(signals.recovery)}%`);
      } else if (signals.hrv !== null) {
        const hrvStress = Math.max(0, Math.min(1, 1 - (signals.hrv - 20) / 80));
        components.push({ weight: 0.45, value: hrvStress });
        signalsFound++;
      }
    }

    // Calendar: count events in last 12h
    const calRows = (rows || []).filter((r) => {
      if (!['calendar', 'google_calendar'].includes(r.platform)) return false;
      const t = getEffectiveEventTime(r);
      return t && t >= twelveHoursAgo && t <= now;
    });
    signals.calendar_load_12h = calRows.length;
    if (calRows.length >= 3) {
      components.push({ weight: 0.30, value: Math.min(1, (calRows.length - 2) / 5) });
      signalsFound++;
      reasons.push(`${calRows.length} meetings in last 12h`);
    }

    // Music: avg valence in last 2h
    const musicRows = (rows || []).filter((r) => {
      if (r.platform !== 'spotify') return false;
      const t = getEffectiveEventTime(r);
      return t && t >= twoHoursAgo && t <= now;
    });
    const valences = musicRows.map((r) => r.raw_data?.valence).filter((v) => typeof v === 'number');
    if (valences.length) {
      signals.music_valence = valences.reduce((s, v) => s + v, 0) / valences.length;
      components.push({ weight: 0.25, value: 1 - signals.music_valence });
      signalsFound++;
      if (signals.music_valence < 0.3) reasons.push('music mood is low');
    }

    let score = null;
    if (components.length) {
      const totalWeight = components.reduce((s, c) => s + c.weight, 0);
      score = components.reduce((s, c) => s + c.weight * c.value, 0) / totalWeight;
    }

    const shouldNudge = score !== null && score >= 0.65;

    return res.json({
      success: true,
      score,
      signals_found: signalsFound,
      signals,
      should_nudge: shouldNudge,
      reason: reasons.length ? reasons.join(' · ') : null,
    });
  } catch (err) {
    log.error('stress-shop-score error', err);
    return res.status(500).json({ success: false, error: err.message || 'score failed' });
  }
});

/**
 * GET /api/transactions/savings
 * Returns savings attribution: how much the user saved by following
 * stress-shop nudges. For each "waited" outcome, estimates the prevented
 * spend using the user's median discretionary purchase in that category
 * (or falls back to the amount passed at nudge-time if provided).
 *
 * Response: { success, window_days, waited_count, proceeded_count,
 *             dismissed_count, total_saved, biggest_save }
 */
router.get('/savings', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const windowDays = Math.min(Number(req.query.window_days) || 30, 365);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // Pull nudge outcomes from the platform-data stream
    const { data: nudges, error: nudgeErr } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'twinme')
      .eq('data_type', 'stress_shop_nudge')
      .gte('extracted_at', since)
      .order('extracted_at', { ascending: false });

    if (nudgeErr) throw nudgeErr;

    const rows = nudges || [];
    let waitedCount = 0;
    let proceededCount = 0;
    let dismissedCount = 0;
    const savedAmounts = [];

    // Estimate median discretionary purchase per user (last 90 days) as fallback
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: txns } = await supabaseAdmin
      .from('user_transactions')
      .select('amount, category')
      .eq('user_id', userId)
      .in('category', ['food_delivery', 'shopping', 'streaming', 'entertainment'])
      .lt('amount', 0)
      .gte('transaction_date', ninetyDaysAgo);

    const amounts = (txns || []).map(t => Math.abs(t.amount)).sort((a, b) => a - b);
    const medianAmount = amounts.length
      ? amounts[Math.floor(amounts.length / 2)]
      : 80; // reasonable default R$80 for BR discretionary

    for (const n of rows) {
      const d = n.raw_data || {};
      if (d.outcome === 'waited') {
        waitedCount++;
        const prevented = typeof d.amount === 'number' && d.amount > 0 ? d.amount : medianAmount;
        savedAmounts.push(prevented);
      } else if (d.outcome === 'proceeded') {
        proceededCount++;
      } else if (d.outcome === 'dismissed') {
        dismissedCount++;
      }
    }

    const totalSaved = savedAmounts.reduce((s, a) => s + a, 0);
    const biggestSave = savedAmounts.length ? Math.max(...savedAmounts) : 0;

    return res.json({
      success: true,
      window_days: windowDays,
      waited_count: waitedCount,
      proceeded_count: proceededCount,
      dismissed_count: dismissedCount,
      total_saved: Math.round(totalSaved * 100) / 100,
      biggest_save: Math.round(biggestSave * 100) / 100,
      median_discretionary_amount: Math.round(medianAmount * 100) / 100,
    });
  } catch (err) {
    log.error('savings error', err);
    return res.status(500).json({ success: false, error: err.message || 'savings failed' });
  }
});

/**
 * POST /api/transactions/nudge-outcome
 * Called by the browser extension after a nudge was shown. Records whether
 * the user chose to wait (saved money) or proceed (spent anyway). Used for
 * future savings-tracker + personal-threshold tuning.
 */
router.post('/nudge-outcome', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });
    const { outcome, score, merchant, amount, url } = req.body || {};
    if (!['waited', 'proceeded', 'dismissed'].includes(outcome)) {
      return res.status(400).json({ success: false, error: 'outcome must be waited|proceeded|dismissed' });
    }

    // Persist as a user_platform_data row with platform='twinme' so it flows into
    // the memory stream and future retrains. No schema change needed.
    const { error } = await supabaseAdmin.from('user_platform_data').insert({
      user_id: userId,
      platform: 'twinme',
      data_type: 'stress_shop_nudge',
      raw_data: { outcome, score, merchant, amount, url, emitted_at: new Date().toISOString() },
      extracted_at: new Date().toISOString(),
      processed: false,
    });
    if (error) log.warn(`nudge-outcome insert failed: ${error.message}`);

    return res.json({ success: true });
  } catch (err) {
    log.error('nudge-outcome error', err);
    return res.status(500).json({ success: false, error: err.message || 'nudge-outcome failed' });
  }
});

/**
 * GET /nudge-stats
 * Phase 3.4b — aggregated stress_nudge effectiveness for the affirmation UI.
 * Reads proactive_insights (category=stress_nudge) that have been
 * retrospectively checked by the daily cron.
 *
 * Response:
 *   {
 *     window_days,
 *     total_sent,      // all stress_nudges in window
 *     checked_count,   // had nudge_checked_at set (i.e. past 24h old)
 *     followed_count,  // user paused after receiving nudge
 *     follow_rate,     // followed_count / checked_count (null if nothing checked yet)
 *     est_saved,       // Σ metadata.amount where followed=true — rough "if they
 *                      //   hadn't stopped, they'd have kept this spending pace"
 *     dominant_currency
 *   }
 */
router.get('/nudge-stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const windowDays = Math.min(Number(req.query.window_days) || 30, 365);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: nudges, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, nudge_followed, nudge_checked_at, metadata, created_at')
      .eq('user_id', userId)
      .eq('category', 'stress_nudge')
      .gte('created_at', since);

    if (error) throw error;

    const rows = nudges || [];
    const totalSent = rows.length;
    const checked = rows.filter((n) => n.nudge_checked_at !== null);
    const followed = checked.filter((n) => n.nudge_followed === true);
    const followRate = checked.length > 0 ? followed.length / checked.length : null;

    // Sum the tx amounts where the user followed the nudge — rough saved estimate.
    // Currency mixing is ignored here: the frontend picks the dominant currency
    // symbol for display. Good-enough for affirmation copy ("you saved ~R$400").
    const estSaved = followed.reduce((s, n) => s + (Number(n.metadata?.amount) || 0), 0);

    // Derive dominant currency from the nudged tx records (their underlying
    // user_transactions rows). metadata.currency isn't stored on the nudge
    // payload yet, so we back off to BRL — good enough for the MVP and easy
    // to extend later when we include currency in the nudge metadata.
    const dominantCurrency = 'BRL';

    return res.json({
      success: true,
      window_days: windowDays,
      total_sent: totalSent,
      checked_count: checked.length,
      followed_count: followed.length,
      follow_rate: followRate,
      est_saved: Math.round(estSaved * 100) / 100,
      dominant_currency: dominantCurrency,
    });
  } catch (err) {
    log.error('nudge-stats error', err);
    return res.status(500).json({ success: false, error: 'failed to fetch nudge stats' });
  }
});

export default router;
