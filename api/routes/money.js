/**
 * Money API (v2, from zero)
 * =========================
 * POST /api/money/capture                 { text, receivedAt? }   a bank or Bizum push notification, verbatim → sighting → ledger
 * GET  /api/money/ledger?since=            reconciled transactions, newest first
 * GET  /api/money/transactions/:id/sightings   the receipts behind one transaction
 * POST /api/money/transactions/:id/verdict { verdict: worth_it | not_me | null }
 * GET  /api/money/recurring                recurring series (recomputed on call)
 * GET  /api/money/forecast                 this month, with a band
 * GET  /api/money/banks?country=ES         Enable Banking coverage (env-gated)
 * POST /api/money/bank/connect { bank? }   start PSD2 authorisation at the bank → { url }
 * GET  /api/money/bank/callback?code&state the bank sends the person back here; accounts are saved
 * GET  /api/money/bank/accounts            connected accounts and when consent expires
 * POST /api/money/bank/pull                pull the feed now (PSD2: four unattended pulls a day)
 *
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';
import { parseCapture, parseStructured } from '../services/money/captureParser.js';
import { ingestSighting, listTransactions, sightingsFor, refreshRecurring, forecast, setVerdict, userForCaptureKey, saveBankAccounts, listBankAccounts, pullBankFeed } from '../services/money/store.js';
import { isConfigured, listBanks, startAuthorisation, createSession } from '../services/money/feeds/enableBanking.js';

const log = createLogger('MoneyRoute');
const router = Router();

/**
 * The phone cannot hold a session. A Shortcut or a listener sends `X-TwinMe-Key: twm_...`,
 * one of the user's API keys (api_keys, SHA-256 hashed, created at POST /api/api-keys).
 * Everything else on this router uses the normal session.
 */
async function authenticateUserOrKey(req, res, next) {
  const key = req.get('x-twinme-key') || (typeof req.query.key === 'string' ? req.query.key : null);
  if (!key) return authenticateUser(req, res, next);
  try {
    const userId = await userForCaptureKey(crypto.createHash('sha256').update(key).digest('hex'));
    if (!userId) return res.status(401).json({ success: false, error: 'Invalid capture key' });
    req.user = { id: userId };
    return next();
  } catch (error) {
    log.error('capture key check failed', { error: error.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

router.post('/capture', authenticateUserOrKey, async (req, res) => {
  const { text, receivedAt, merchant, amount, card, date, direction } = req.body || {};
  let parsed = null;
  let ref = null;
  if (typeof text === 'string' && text.length >= 4) {
    if (text.length > 2000) return res.status(400).json({ success: false, error: 'text must be under 2000 chars' });
    parsed = parseCapture(text, { receivedAt });
    ref = `${parsed?.source || 'phone'}:${crypto.createHash('sha256').update(text).digest('hex').slice(0, 32)}`;
  } else if (amount !== undefined) {
    parsed = parseStructured({ merchant, amount, card, date, direction });
    if (parsed) ref = `phone:${crypto.createHash('sha256').update(`${merchant}|${amount}|${card}|${date}`).digest('hex').slice(0, 32)}`;
  } else {
    return res.status(400).json({ success: false, error: 'Send text (the notification) or { merchant, amount, card, date }' });
  }
  if (!parsed) return res.status(422).json({ success: false, error: 'No amount found' });
  try {
    const result = await ingestSighting(req.user.id, { ...parsed, source_ref: ref });
    res.status(result.action === 'create' ? 201 : 200).json({ success: true, data: { action: result.action, transaction: result.transaction, sighting: { id: result.sighting.id, parse_confidence: result.sighting.parse_confidence } } });
  } catch (error) {
    log.error('capture failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.use(authenticateUser);

router.get('/ledger', async (req, res) => {
  try {
    const data = await listTransactions(req.user.id, { since: typeof req.query.since === 'string' ? req.query.since : undefined });
    res.json({ success: true, data });
  } catch (error) {
    log.error('ledger failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/transactions/:id/sightings', async (req, res) => {
  try { res.json({ success: true, data: await sightingsFor(req.user.id, req.params.id) }); }
  catch (error) { log.error('sightings failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/transactions/:id/verdict', async (req, res) => {
  const { verdict = null } = req.body || {};
  if (verdict !== null && !['worth_it', 'not_me'].includes(verdict)) {
    return res.status(400).json({ success: false, error: 'verdict must be worth_it, not_me or null' });
  }
  try { res.json({ success: true, data: await setVerdict(req.user.id, req.params.id, verdict) }); }
  catch (error) { log.error('verdict failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/recurring', async (req, res) => {
  try { res.json({ success: true, data: await refreshRecurring(req.user.id) }); }
  catch (error) { log.error('recurring failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/forecast', async (req, res) => {
  try { res.json({ success: true, data: await forecast(req.user.id) }); }
  catch (error) { log.error('forecast failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/banks', async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ success: false, error: 'Bank feed not configured' });
  try { res.json({ success: true, data: await listBanks(typeof req.query.country === 'string' ? req.query.country : 'ES') }); }
  catch (error) { log.error('banks failed', { error: error.message }); res.status(502).json({ success: false, error: 'Bank feed unavailable' }); }
});

/* The bank redirects to the callback without our session; `state` carries the user, signed. */
function signState(userId) {
  const nonce = crypto.randomBytes(8).toString('base64url');
  const body = `${userId}.${nonce}`;
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev').update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev').update(body).digest('base64url');
  return sig === parts[2] ? parts[0] : null;
}

router.post('/bank/connect', async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ success: false, error: 'Bank feed not configured' });
  try {
    const { bank = 'Banco Santander', country = 'ES' } = req.body || {};
    const { url, authorizationId } = await startAuthorisation({ bankName: String(bank).slice(0, 80), country: String(country).slice(0, 2).toUpperCase(), state: signState(req.user.id) });
    res.json({ success: true, data: { url, authorizationId } });
  } catch (error) {
    log.error('bank connect failed', { error: error.message });
    res.status(502).json({ success: false, error: 'Could not start the bank authorisation' });
  }
});

router.get('/bank/accounts', async (req, res) => {
  try { res.json({ success: true, data: await listBankAccounts(req.user.id) }); }
  catch (error) { log.error('bank accounts failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/bank/pull', async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ success: false, error: 'Bank feed not configured' });
  try { res.json({ success: true, data: await pullBankFeed(req.user.id, { since: typeof req.body?.since === 'string' ? req.body.since : undefined }) }); }
  catch (error) { log.error('bank pull failed', { error: error.message }); res.status(502).json({ success: false, error: 'Bank feed unavailable' }); }
});

export default router;

/** Mounted before the session check: the bank's redirect carries no cookie. */
export const bankCallback = Router();
bankCallback.get('/bank/callback', async (req, res) => {
  const userId = readState(req.query.state);
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!userId || !code) return res.status(400).send('This link is not valid.');
  try {
    const session = await createSession(code);
    await saveBankAccounts(userId, session);
    res.redirect(302, '/portrait?bank=connected');
  } catch (error) {
    log.error('bank callback failed', { error: error.message });
    res.status(502).send('The bank connection could not be completed. Try again from TwinMe.');
  }
});
