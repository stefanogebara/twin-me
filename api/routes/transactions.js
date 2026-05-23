/**
 * Transactions API — Financial-Emotional Twin (Phase 2A)
 * =======================================================
 * POST /api/transactions/upload  — parse CSV/OFX, insert, kick off emotion tagging
 * GET  /api/transactions         — list recent transactions with emotional context
 * GET  /api/transactions/summary — 30-day totals + emotional-spend ratio
 */

import express from 'express';
import multer from 'multer';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { parseBankStatement } from '../services/transactions/parserDispatcher.js';
import { tagTransactionsBatch } from '../services/transactions/transactionEmotionTagger.js';
import { syncAllSignals } from '../services/transactions/platformSignalExtractor.js';
import { normalizeMerchant } from '../services/transactions/merchantNormalizer.js';
import { detectAndMarkRecurring, isNonSubscriptionRow } from '../services/transactions/recurrenceDetector.js';
import { STRESS_HIGH, NUDGE_TRIGGER, DEFAULT_CURRENCY } from '../config/financialThresholds.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('transactions-api');
const router = express.Router();

/**
 * Build a 500 error body that never leaks Postgres / 3rd-party error text to
 * the client in production. Caller is responsible for logging the full
 * err.message server-side; this helper just shapes the response so table /
 * column / constraint names and token shapes don't end up in browser DevTools
 * or referrer chains.
 */
function safeError(staticMessage, err) {
  return process.env.NODE_ENV !== 'production'
    ? { success: false, error: err?.message || staticMessage }
    : { success: false, error: staticMessage };
}

/**
 * audit-2026-05-08 M1: parse a `window` or `window_days` query param into a
 * concrete day count. Accepts:
 *   ?window_days=30   (numeric, original contract)
 *   ?window=30d
 *   ?window=12w        (weeks)
 *   ?window=3mo | 12mo (months ≈ 30 days each)
 *   ?window=1y         (years)
 * Falls back to `defaultDays` on invalid/missing input. Clamped to [1, 365].
 *
 * audit-2026-05-12 H7: default raised from 30 → 90. Users upload statements
 * with transactions stretching back 1-3 months; a 30-day window made /money
 * silently drop most of the data (visible list ≠ totals card ≠ chart).
 */
function parseWindowDays(query, defaultDays = 90) {
  const raw = query?.window_days ?? query?.window;
  if (raw === undefined || raw === null || raw === '') return defaultDays;
  if (typeof raw === 'number') return Math.min(Math.max(Math.round(raw), 1), 365);
  const s = String(raw).trim().toLowerCase();
  // Plain integer like "30"
  if (/^\d+$/.test(s)) return Math.min(Math.max(parseInt(s, 10), 1), 365);
  // <N><unit> form
  const m = s.match(/^(\d+)\s*(d|day|days|w|week|weeks|m|mo|month|months|y|year|years)$/);
  if (!m) return defaultDays;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  let days = n;
  if (unit.startsWith('w')) days = n * 7;
  else if (unit === 'm' || unit.startsWith('mo')) days = n * 30;
  else if (unit.startsWith('y')) days = n * 365;
  return Math.min(Math.max(days, 1), 365);
}

// File upload config — memory storage, 10MB max. CSV/OFX text files are tiny.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|ofx|txt|xlsx)$/i.test(file.originalname) ||
      ['text/csv', 'text/plain', 'application/x-ofx', 'application/octet-stream',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.mimetype);
    if (!ok) {
      // audit-2026-05-08 M2: tag the error so the route handler can map to 415
      // instead of leaking 500 + errorType: MulterError to the client.
      const err = new Error('Only CSV, OFX or XLSX files are supported');
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

/**
 * audit-2026-05-08 M2: convert multer's LIMIT_FILE_SIZE → 413 and our
 * UNSUPPORTED_FILE_TYPE → 415. Without this wrapper, multer surfaces both
 * as 500s with `errorType: "MulterError"` leaking into the JSON body.
 *
 * Express middleware semantics: if the wrapped middleware (multer) calls
 * next(err), we intercept here. If it succeeds, we call next() with no
 * error so the actual route handler runs.
 */
function uploadSingleFile(field) {
  const inner = upload.single(field);
  return (req, res, next) => {
    inner(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'File is too large. The maximum size is 10 MB.',
          code: 'LIMIT_FILE_SIZE',
        });
      }
      if (err.code === 'UNSUPPORTED_FILE_TYPE') {
        return res.status(415).json({
          success: false,
          error: 'Only CSV, OFX or XLSX files are supported',
          code: 'UNSUPPORTED_FILE_TYPE',
        });
      }
      // Anything else: 400 with a generic message; never leak errorType.
      return res.status(400).json({
        success: false,
        error: 'Upload failed',
        detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
      });
    });
  };
}

/**
 * audit-2026-05-08 M3: per-user rate limit on /retag. Each call SELECTs up to
 * 500 rows + N UPDATEs + recurrence detector + tag batch — about 1-3 seconds
 * of Vercel time and several hundred Supabase queries. A misbehaving client
 * could pin a function and degrade the DB for everyone. 5 retags / 15 minutes
 * per user is generous (the FE invokes this on demand, typically when the
 * user just connected a new integration).
 */
const retagLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Key by user.id when authenticated (which they are — authenticateUser
  // runs before this); fall back to IP using the helper that handles IPv6
  // properly so we don't trip ERR_ERL_KEY_GEN_IPV6.
  keyGenerator: (req, res) => req.user?.id || ipKeyGenerator(req, res),
  message: { success: false, error: 'too_many_retag_requests', code: 'RATE_LIMITED' },
});

/**
 * audit-2026-05-23 M2: symmetric limiter on /upload. Each call parses a CSV/OFX
 * file (multi-MB), inserts N rows, runs detectAndMarkRecurring, syncAllSignals,
 * and an awaited tagTransactionsBatch (multi-second on 200+ rows). N rapid uploads
 * × that pipeline easily exceeds 60s Vercel maxDuration and burns OpenAI tokens.
 * Same 5 / 15min budget as retag — onboarding flows fit comfortably under it.
 */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => req.user?.id || ipKeyGenerator(req, res),
  message: { success: false, error: 'too_many_upload_requests', code: 'RATE_LIMITED' },
});

/**
 * POST /api/transactions/upload
 * multipart/form-data with a `file` field (CSV or OFX).
 */
router.post('/upload', authenticateUser, uploadLimiter, uploadSingleFile('file'), async (req, res) => {
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

    // audit-2026-05-08 H3: reject obviously-malformed amounts BEFORE persisting.
    // Real-world transactions are not in the millions and aren't sub-cent.
    // Out-of-range rows poison summary/savings totals and break UI rendering.
    // We surface them as parse_errors so the user sees what was dropped.
    const MAX_TX_AMOUNT = 1_000_000;        // BRL/USD/EUR — single tx > 1M is parser garbage
    const MIN_TX_AMOUNT = 0.01;             // sub-cent rows are noise (FX rounding artifacts, etc.)
    const validationErrors = [];
    const validTxns = [];
    for (const t of parsed.transactions) {
      const n = Number(t.amount);
      if (!Number.isFinite(n)) {
        validationErrors.push(`Skipped non-numeric amount for ${t.external_id || t.merchant_raw}: ${t.amount}`);
        continue;
      }
      const abs = Math.abs(n);
      if (abs > MAX_TX_AMOUNT) {
        validationErrors.push(`Skipped out-of-range amount ${n} for ${t.merchant_raw} (>${MAX_TX_AMOUNT})`);
        continue;
      }
      if (abs < MIN_TX_AMOUNT) {
        validationErrors.push(`Skipped sub-cent amount ${n} for ${t.merchant_raw}`);
        continue;
      }
      validTxns.push(t);
    }
    if (!validTxns.length) {
      return res.status(400).json({
        success: false,
        error: 'No valid transactions in file (all amounts were out of range)',
        detail: [...parsed.errors, ...validationErrors],
        format: parsed.format,
      });
    }

    // Annotate rows for insert — normalize merchant + infer category at ingest time
    const rows = validTxns.map((t) => {
      const { brand, category } = normalizeMerchant(t.merchant_raw);
      return {
        user_id: userId,
        external_id: t.external_id,
        amount: t.amount,
        currency: t.currency || DEFAULT_CURRENCY,
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

    // Sync GitHub + Gmail timestamped signals so the tagger can join them.
    // Non-blocking — failures don't affect the upload response.
    try {
      await syncAllSignals(userId);
    } catch (err) {
      log.warn(`signal sync failed (non-fatal): ${err.message}`);
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
      // audit-2026-05-08 H3: include validation errors alongside parser errors
      // so the user sees which rows were dropped for being out of range.
      parse_errors: [...parsed.errors, ...validationErrors],
      file_hash: parsed.fileHash,
    });
  } catch (err) {
    log.error('upload error', err);
    return res.status(500).json(safeError('upload failed', err));
  }
});

/**
 * POST /api/transactions/sync-signals
 * Pulls fresh GitHub events + Gmail message timestamps into user_platform_data,
 * then re-tags all existing transactions with the richer signal set.
 */
router.post('/sync-signals', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const signals = await syncAllSignals(userId);

    // Re-tag all existing transactions
    const { data: txns } = await supabaseAdmin
      .from('user_transactions')
      .select('id')
      .eq('user_id', userId);

    const ids = (txns || []).map(t => t.id);
    let tagResult = { tagged: 0, errors: 0 };
    if (ids.length) {
      tagResult = await tagTransactionsBatch(userId, ids);
    }

    return res.json({ success: true, signals, tagged: tagResult.tagged, tag_errors: tagResult.errors });
  } catch (err) {
    log.error('sync-signals error', err);
    return res.status(500).json(safeError('request failed', err));
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
    return res.status(500).json(safeError('list failed', err));
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

    // audit-2026-05-08 M1: respect ?window or ?window_days; fall back to 30 days.
    const windowDays = parseWindowDays(req.query, 90);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

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
      .gte('transaction_date', since);

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
      const k = (cur || DEFAULT_CURRENCY).toUpperCase();
      if (!byCurrency.has(k)) byCurrency.set(k, { currency: k, outflow: 0, inflow: 0, count: 0, stress_shop_total: 0 });
      return byCurrency.get(k);
    }

    for (const t of rows) {
      const b = bucket(t.currency);
      b.count++;
      if (t.amount < 0) { totalOutflow += Math.abs(t.amount); b.outflow += Math.abs(t.amount); }
      else { totalInflow += t.amount; b.inflow += t.amount; }

      const ec = Array.isArray(t.emotional_context) ? t.emotional_context[0] : t.emotional_context;
      // audit-2026-05-12 H7: "Compras impulsivas" was always 0 because the
      // `is_stress_shop_candidate` flag is a stricter heuristic (requires
      // multiple co-occurring signals) and rarely fires. The card semantics
      // are "transactions made under high stress", which matches the
      // computed_stress_score >= STRESS_HIGH threshold the rest of the
      // codebase uses. Either flag now counts.
      const isHighStressDebit =
        t.amount < 0 &&
        ec?.computed_stress_score !== null &&
        ec?.computed_stress_score !== undefined &&
        ec.computed_stress_score >= STRESS_HIGH;

      if (ec?.is_stress_shop_candidate || isHighStressDebit) {
        stressShopCount++;
        if (t.amount < 0) {
          stressShopTotal += Math.abs(t.amount);
          b.stress_shop_total += Math.abs(t.amount);
        }
      }
      if (isHighStressDebit) {
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
      window_days: windowDays,
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
    return res.status(500).json(safeError('summary failed', err));
  }
});

/**
 * POST /api/transactions/retag
 * Re-runs emotion tagging for all user transactions. Useful after connecting
 * a new platform (Whoop, Spotify, Calendar) — picks up new signals.
 */
router.post('/retag', authenticateUser, retagLimiter, async (req, res) => {
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
    // audit-2026-05-08 M3: parallelize the backfill UPDATEs in chunks of 10
    // instead of looping sequentially. 500 rows could otherwise spend ~1-2 s
    // serially on the DB; 10× concurrency drops it to ~100-200 ms.
    let backfilled = 0;
    const BACKFILL_CONCURRENCY = 10;
    for (let i = 0; i < backfillUpdates.length; i += BACKFILL_CONCURRENCY) {
      const part = backfillUpdates.slice(i, i + BACKFILL_CONCURRENCY);
      const results = await Promise.all(
        part.map((u) =>
          supabaseAdmin
            .from('user_transactions')
            .update({ merchant_normalized: u.merchant_normalized, category: u.category })
            .eq('id', u.id)
            .eq('user_id', userId),
        ),
      );
      for (const r of results) if (!r.error) backfilled++;
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
    return res.status(500).json(safeError('retag failed', err));
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
    // audit-2026-05-08 M1: respect ?window or ?window_days; fall back to 30 days.
    const windowDays = parseWindowDays(req.query, 90);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('user_transactions')
      .select('amount, category')
      .eq('user_id', userId)
      .lt('amount', 0) // outflows only
      .gte('transaction_date', since);

    if (error) throw error;

    const totals = {};
    for (const row of data || []) {
      const cat = row.category || 'other';
      totals[cat] = (totals[cat] || 0) + Math.abs(row.amount);
    }

    const breakdown = Object.entries(totals)
      .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    return res.json({ success: true, window_days: windowDays, breakdown });
  } catch (err) {
    log.error('by-category error', err);
    return res.status(500).json(safeError('by-category failed', err));
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
    return res.status(500).json(safeError('patterns failed', err));
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
 *     should_nudge: true,          // true when score >= NUDGE_TRIGGER (0.65)
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

    // audit-2026-05-08 M4: previously this query pulled THIRTY DAYS of platform
    // data and filtered in-memory, which was 1.9 s p95 even for sparse users.
    // The widest window we actually use is biology @ 24h. We give 48h of
    // extraction-lag slack so a Whoop row that was synced last night for an
    // event this morning still shows up. ~15× less data than the old query.
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const { data: rows, error } = await supabaseAdmin
      .from('user_platform_data')
      .select('platform, data_type, raw_data, extracted_at')
      .eq('user_id', userId)
      .in('platform', ['whoop', 'oura', 'garmin', 'fitbit', 'spotify', 'calendar', 'google_calendar'])
      .gte('extracted_at', fortyEightHoursAgo.toISOString())
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

    const shouldNudge = score !== null && score >= NUDGE_TRIGGER;

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
    return res.status(500).json(safeError('score failed', err));
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

    // audit-2026-05-08 M1: parseWindowDays accepts both ?window_days=N and
    // ?window=30d|3mo|1y so the FE has one consistent way to ask.
    const windowDays = parseWindowDays(req.query, 90);
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
    return res.status(500).json(safeError('savings failed', err));
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
    return res.status(500).json(safeError('nudge-outcome failed', err));
  }
});

/**
 * GET /risk-forecast
 * Phase 3.5 — "before it happens" morning forecast. Returns a status chip
 * and copy explaining whether today's biology + sleep matches the user's
 * historical impulse-spending pattern. Cheap to compute, safe to poll.
 */
router.get('/risk-forecast', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });
    const { computeRiskForecast } = await import('../services/transactions/financialRiskForecast.js');
    const forecast = await computeRiskForecast(userId);
    return res.json({ success: true, forecast });
  } catch (err) {
    log.error('risk-forecast error', err);
    return res.status(500).json({ success: false, error: 'failed to compute forecast' });
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

    // audit-2026-05-08 M1: parseWindowDays accepts both ?window_days=N and
    // ?window=30d|3mo|1y so the FE has one consistent way to ask.
    const windowDays = parseWindowDays(req.query, 90);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: nudges, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, nudge_followed, nudge_checked_at, metadata, created_at')
      .eq('user_id', userId)
      .eq('category', 'stress_nudge')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

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
    // payload yet, so we back off to the DEFAULT_CURRENCY (BRL in this
    // deployment). Easy to extend once we include currency in nudge metadata.
    const dominantCurrency = DEFAULT_CURRENCY;

    // Recent 5 nudges for inline card rendering. Includes outcome when the
    // retrospective cron has already evaluated them.
    const recent = rows.slice(0, 5).map((n) => ({
      id: n.id,
      title: n.metadata?.title || 'Aviso',
      body: n.metadata?.body || '',
      amount: Number(n.metadata?.amount) || 0,
      merchant: n.metadata?.merchant || '',
      category: n.metadata?.tx_category || null,
      stress_score: Number(n.metadata?.stress_score) || null,
      followed: n.nudge_followed,
      checked: n.nudge_checked_at !== null,
      created_at: n.created_at,
    }));

    return res.json({
      success: true,
      window_days: windowDays,
      total_sent: totalSent,
      checked_count: checked.length,
      followed_count: followed.length,
      follow_rate: followRate,
      est_saved: Math.round(estSaved * 100) / 100,
      dominant_currency: dominantCurrency,
      recent,
    });
  } catch (err) {
    log.error('nudge-stats error', err);
    return res.status(500).json({ success: false, error: 'failed to fetch nudge stats' });
  }
});

/**
 * POST /api/transactions/:id/feedback
 * Store user correction: was this transaction stress-driven or not?
 * Upserts so re-tagging a transaction just updates the existing record.
 */
router.post('/:id/feedback', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const transactionId = req.params.id;
    const { is_stress_driven } = req.body;
    if (typeof is_stress_driven !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_stress_driven must be boolean' });
    }

    // audit-2026-05-08 H1: verify the transaction exists AND belongs to this
    // user before accepting feedback. transaction_feedback.transaction_id is
    // TEXT (no FK) so the DB will not protect us — we have to. Without this
    // check, any authed user could insert phantom feedback rows for arbitrary
    // UUIDs (or any string), polluting downstream nudge-effectiveness rollups.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(transactionId)) {
      return res.status(400).json({ success: false, error: 'invalid transaction id' });
    }
    const { data: tx, error: ownErr } = await supabaseAdmin
      .from('user_transactions')
      .select('id')
      .eq('id', transactionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (ownErr) throw ownErr;
    if (!tx) return res.status(404).json({ success: false, error: 'transaction not found' });

    const { error } = await supabaseAdmin
      .from('transaction_feedback')
      .upsert(
        { user_id: userId, transaction_id: transactionId, is_stress_driven },
        { onConflict: 'user_id,transaction_id' }
      );
    if (error) throw error;

    return res.json({ success: true });
  } catch (err) {
    log.error('transaction feedback error', err);
    return res.status(500).json({ success: false, error: 'failed to save feedback' });
  }
});

/**
 * GET /api/transactions/timeline-analysis
 * Returns daily spend totals + average stress score for the last 30 days.
 * Used by the StressSpendTimeline chart — the visual proof of the "WHY you spend" UVP.
 */
router.get('/timeline-analysis', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const windowDays = parseWindowDays(req.query, 90);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // audit-2026-05-12 H7: the legacy `get_spending_timeline` RPC hard-coded a
    // 30-day window so the chart silently chopped older transactions out. The
    // y-axis topped out at the highest 30-day-recent spend (often R$ 100)
    // while the totals card disagreed. Computing inline keeps one window
    // applied to every panel on /money.
    const { data: rows, error } = await supabaseAdmin
      .from('user_transactions')
      .select(`
        transaction_date,
        amount,
        emotional_context:transaction_emotional_context (
          computed_stress_score, is_stress_shop_candidate
        )
      `)
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('transaction_date', since);

    if (error) throw error;

    // Group by UTC day. Match the original RPC shape:
    //   { day, spend, stress_avg, stress_shop_count, tx_count }
    const byDay = new Map();
    for (const r of rows || []) {
      const day = new Date(r.transaction_date).toISOString().slice(0, 10);
      const bucket = byDay.get(day) || { day, spend: 0, _stressTotal: 0, _stressN: 0, stress_shop_count: 0, tx_count: 0 };
      bucket.spend += Math.abs(r.amount);
      bucket.tx_count += 1;
      const ec = Array.isArray(r.emotional_context) ? r.emotional_context[0] : r.emotional_context;
      if (ec?.computed_stress_score !== null && ec?.computed_stress_score !== undefined) {
        bucket._stressTotal += ec.computed_stress_score;
        bucket._stressN += 1;
      }
      if (ec?.is_stress_shop_candidate) bucket.stress_shop_count += 1;
      byDay.set(day, bucket);
    }

    const days = [...byDay.values()]
      .map((b) => ({
        day: b.day,
        spend: Math.round(b.spend * 100) / 100,
        stress_avg: b._stressN ? Math.round((b._stressTotal / b._stressN) * 1000) / 1000 : null,
        stress_shop_count: b.stress_shop_count,
        tx_count: b.tx_count,
      }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    return res.json({ success: true, days, window_days: windowDays });
  } catch (err) {
    log.error('timeline-analysis error', err);
    return res.status(500).json({ success: false, error: 'timeline analysis failed' });
  }
});

/**
 * GET /api/transactions/recurring-subscriptions
 *
 * REST surface mirroring the get_recurring_subscriptions twin-chat tool so
 * /money/insights can render the subscriptions audit panel without going
 * through the chat layer. Same grouping / monthly-avg / first-charge-context
 * shape so client code can render either source.
 *
 * Query params:
 *   limit      — Max subscriptions to return (default 15, max 50).
 *   minMonthly — Filter out subs with monthly_avg < this value.
 */
router.get('/recurring-subscriptions', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '15'), 10) || 15, 1), 50);
    const minMonthly = Math.max(Number(req.query.minMonthly) || 0, 0);

    const { data: rows, error } = await supabaseAdmin
      .from('user_transactions')
      .select(`
        id, amount, currency, merchant_normalized, merchant_raw, category,
        transaction_date, source_bank, account_type,
        emotional_context:transaction_emotional_context (
          recovery_score, computed_stress_score, calendar_load, music_valence
        )
      `)
      .eq('user_id', userId)
      .eq('is_recurring', true)
      .lt('amount', 0)
      .neq('account_type', 'investment')   // brokerage trades own a different surface
      .order('transaction_date', { ascending: false })
      .limit(2000);

    if (error) {
      log.error('recurring-subscriptions query failed', { error: error.message });
      return res.status(500).json({ success: false, error: 'failed to load subscriptions' });
    }
    if (!rows?.length) {
      return res.json({
        success: true,
        count: 0,
        totalMonthly: 0,
        currency: 'USD',
        synthesis: 'No recurring subscriptions detected yet. Connect a bank or upload a statement to start tracking.',
        stressfulSignupCount: 0,
        subscriptions: [],
      });
    }

    // Defensive re-filter: detectAndMarkRecurring is one-shot, so rows
    // marked is_recurring=true before the non-subscription blocklist was
    // added (or before a future entry is added) still come through. Audit
    // 2026-05-21: prod returned KFC $500/mo, Tectra Inc $500/mo, McDonald's
    // $12/mo, Starbucks $4.33/mo as "subscriptions" with a $1,690/mo total
    // because old detector runs flagged them before the merchant blocklist
    // landed. isNonSubscriptionRow honours both the merchant + category
    // blocklists at read time, so the FE never sees the garbage even when
    // the DB still has stale flags.
    const filteredRows = rows.filter(r => !isNonSubscriptionRow(r));

    // Second empty-state guard: the outer rows.length check above runs BEFORE
    // the read-side filter, so a user whose DB still has stale-flagged garbage
    // (all of it caught by isNonSubscriptionRow) would otherwise fall through
    // to the "$0.00 across 0 subscriptions" synthesis — uglier than the
    // friendly no-data message.
    if (!filteredRows.length) {
      return res.json({
        success: true,
        count: 0,
        totalMonthly: 0,
        currency: 'USD',
        synthesis: 'No recurring subscriptions detected yet. Connect a bank or upload a statement to start tracking.',
        stressfulSignupCount: 0,
        subscriptions: [],
      });
    }

    const byMerchant = new Map();
    for (const r of filteredRows) {
      const key = r.merchant_normalized || r.merchant_raw || 'unknown';
      const bucket = byMerchant.get(key) || [];
      bucket.push(r);
      byMerchant.set(key, bucket);
    }

    const subscriptions = [];
    for (const [merchant, txs] of byMerchant.entries()) {
      if (txs.length < 2) continue;
      const sorted = [...txs].sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''));
      const firstCharge = sorted[0];
      const lastCharge = sorted[sorted.length - 1];
      const amounts = txs.map(t => Math.abs(Number(t.amount) || 0));
      const monthlyAvg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      if (monthlyAvg < minMonthly) continue;
      const currency = firstCharge.currency || 'USD';
      const ec = Array.isArray(firstCharge.emotional_context) ? firstCharge.emotional_context[0] : firstCharge.emotional_context;
      const ctxParts = [];
      if (ec?.recovery_score != null) ctxParts.push(`Whoop recovery ${Math.round(ec.recovery_score)}%`);
      if (ec?.computed_stress_score != null && ec.computed_stress_score >= 0.5) ctxParts.push(`stress ${Math.round(ec.computed_stress_score * 100)}%`);
      if (ec?.calendar_load != null && ec.calendar_load >= 3) ctxParts.push(`${ec.calendar_load} meetings that day`);
      if (ec?.music_valence != null && ec.music_valence < 0.3) ctxParts.push('somber music');

      subscriptions.push({
        merchant,
        category: firstCharge.category || null,
        monthlyAvg: Math.round(monthlyAvg * 100) / 100,
        currency,
        chargeCount: txs.length,
        firstChargeDate: firstCharge.transaction_date,
        lastChargeDate: lastCharge.transaction_date,
        totalSpentToDate: Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100,
        firstChargeContext: ctxParts.length ? ctxParts.join(' · ') : null,
        source: firstCharge.source_bank,
      });
    }

    subscriptions.sort((a, b) => b.monthlyAvg - a.monthlyAvg);
    const top = subscriptions.slice(0, limit);

    const stressfulSignups = subscriptions.filter(s => s.firstChargeContext && /stress|low recovery|somber/i.test(s.firstChargeContext));
    const totalMonthly = subscriptions.reduce((s, sub) => s + sub.monthlyAvg, 0);
    const dominantCurrency = subscriptions[0]?.currency || 'USD';
    const totalMonthlyStr = new Intl.NumberFormat('en-US', { style: 'currency', currency: dominantCurrency }).format(totalMonthly);
    // Synthesis: surface the data, no value judgment. The "stressful signup"
    // tag is descriptive (these signups landed on days flagged as high-stress
    // by joined biology/calendar/music signals) — but whether that's good or
    // bad is the user's call. A Cursor signup under deadline pressure may be
    // a smart leverage move; a late-night impulse Netflix could be the
    // opposite. The surface used to read "— worth a look", which is loaded.
    // Dropped per audit 2026-05-22.
    const synthesis = stressfulSignups.length >= 2
      ? `You're paying ${totalMonthlyStr}/month across ${subscriptions.length} subscriptions. ${stressfulSignups.length} of those signups landed on days with elevated stress or low recovery.`
      : `You're paying ${totalMonthlyStr}/month across ${subscriptions.length} subscriptions.`;

    return res.json({
      success: true,
      count: subscriptions.length,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      currency: dominantCurrency,
      synthesis,
      stressfulSignupCount: stressfulSignups.length,
      subscriptions: top,
    });
  } catch (err) {
    log.error('recurring-subscriptions error', err);
    return res.status(500).json({ success: false, error: 'failed to load subscriptions' });
  }
});

export default router;
