/**
 * Money API (v2, from zero)
 * =========================
 * POST /api/money/capture                 { text, receivedAt? }   a bank or Bizum push notification, verbatim → sighting → ledger
 * GET  /api/money/ledger?since=            reconciled transactions, newest first
 * GET  /api/money/transactions/:id/sightings   the receipts behind one transaction
 * POST /api/money/transactions/:id/verdict { verdict: worth_it | not_me | null }
 * GET  /api/money/recurring                recurring series (recomputed on call)
 * GET  /api/money/forecast                 this month, with a band
 * POST /api/money/statement                a bank statement (xlsx/csv) becomes sightings
 * GET  /api/money/categories[?month=]      where a month went, by kind of place
 * GET  /api/money/places                   the places behind the ledger
 * POST /api/money/places/lookup            look up the merchants not yet placed
 * POST /api/money/places/:key/category     a person's correction to a category
 * GET  /api/money/stream                   the pipeline as it runs, one event per real step
 * POST /api/money/chat/stream              one answer as it is written, a sentence at a time
 * GET  /api/money/questions                what the ledger cannot answer and should ask
 * POST /api/money/questions/answer         an answer, checked against the ledger
 * POST /api/money/questions/:id/skip       a question declined stops being asked
 * GET  /api/money/facts                    what the person has said about their money
 * GET  /api/money/usage                    were the subscriptions used, and what cannot be checked
 * GET  /api/money/months                   money in and out per calendar month
 * GET  /api/money/readings[?refresh=1]     what the ledger says, with its receipts
 * POST /api/money/readings/:id/verdict     true | not_me | null
 * GET  /api/money/bank/budget              unattended reads left in the rolling day
 * GET  /api/money/banks?country=ES         Enable Banking coverage (env-gated)
 * POST /api/money/bank/connect { bank? }   start PSD2 authorisation at the bank → { url }
 * GET  /api/money/bank/callback?code&state the bank sends the person back here; accounts are saved
 * GET  /api/money/bank/accounts            connected accounts and when consent expires
 * POST /api/money/calendar/feed { url }    a Canvas, Blackboard or .ics link, read with the calendar
 * DELETE /api/money/calendar/feed/:id      forget a link
 * POST /api/money/bank/pull                pull the feed now (PSD2: four unattended pulls a day)
 * POST /api/money/chat { message, history? } a question or a correction, answered with figures and receipts
 * POST /api/money/chat/act { action }      run an action the person confirmed from a chat reply
 * POST /api/money/channel/opt-in           WhatsApp linked from the You page: consent to answer there, recorded
 *
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */

import { ledgerCurrency } from '../services/money/currency.js';
import { labelCard } from '../services/money/instruments.js';
import { readPage, accountsView, PAGE_VIEWS } from '../services/money/pageRead.js';
import { listReceiptNotices } from '../services/money/notices.js';
import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { authenticateUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as S from './moneySchemas.js';
import { inboxAddress, inboxDomain, isInboxConfigured, verifySvix, ingestReceivedEmail, listForwardingRequests } from '../services/money/inbox.js';
import { readAttachment, acceptsAttachment, MAX_ATTACHMENT_BYTES } from '../services/money/attachments.js';
import { ATTACHMENT_DEPS } from '../services/money/attachmentDeps.js';
import { accuracy } from '../services/money/predictions.js';
import { createLogger } from '../services/logger.js';
import { captureFromBody } from '../services/money/captureParser.js';
import { capabilitiesFor } from '../services/money/betaCapabilities.js';
const bankClosed = (c) => ({ unconfigured: 'Live bank connections are not set up here. Add a statement instead.', restricted: 'Bank connections open for everyone once our bank access is cleared. Until then, add a statement.', country: 'Bank connections are not available in your country yet. Add a statement instead.', unread: 'Your accounts could not be read. Try again.' })[c.why] || 'Live bank connections are not available. Add a statement instead.';
import { holdUndatedCapture } from '../services/money/legacyCapture.js';
import { recordOptIn } from '../services/money/channelStore.js';
import { isMoneyChannelUser } from '../services/money/channel.js';
import { inPersonScope, personProfileCached, personProfile, ingestSighting, ingestSightings, listTransactions, transactionPage, sightingsFor, refreshRecurring, forecast, setVerdict, userForCaptureKey, saveBankAccounts, listBankAccounts, pullBankFeed, refreshReadings, listReadings, setReadingVerdict, months, feedBudget, categorySpend, listPlaces, setPlaceCategory, enrichPlaces, subscriptionUsage, questionsFor, answerQuestion, skipQuestion, listFacts, deleteFact, recordCallbackFailure, listChatTurns, saveChatTurn, learn, userLanguage, patternsFor } from '../services/money/store.js';
import { parseDelimited, parseWorkbook, toSightings } from '../services/money/statements/importer.js';
import { statementAccounts, createStatementAccount, ownedStatementAccount, checkStatementEvidence, StatementInputError } from '../services/money/statements/accounts.js';
import { isConfigured, listBanks, startAuthorisation, createSession, getSession, applicationInfo } from '../services/money/feeds/enableBanking.js';
import { answer as chatAnswer, answerStream as chatAnswerStream, act as chatAct } from '../services/money/chat.js';
import { ahead as calendarAhead, learnEventSpend, addFeed as addCalendarFeed, removeFeed as removeCalendarFeed, termWeeks } from '../services/money/calendar.js';
import { todayAllowance } from '../services/money/allowanceService.js';
import { monthPlan, planLine } from '../services/money/plan.js';
import { spendingRule } from '../services/money/spending.js';
import { guessHome, savedHome, searchAreas, searchPlaces, staticMap, saveHome, placePoint } from '../services/money/home.js';
import { encryptState } from '../services/encryption.js';
import { signState, readState } from '../services/money/bankState.js';
import { getAppUrl } from '../utils/oauthUtils.js';
import { getGoogleWorkspaceScopes } from '../config/googleWorkspaceScopes.js';
import { quietly } from '../services/money/quietly.js';

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

router.post('/capture', authenticateUserOrKey, validate({ body: S.CAPTURE }), async (req, res) => {
  if (req.body?.ownerId && req.body.ownerId !== req.user.id) return res.status(403).json({ success: false, error: 'Capture belongs to a different account' });
  /* The Android listener sends the notification's text; an iPhone Wallet automation sends the
     merchant and amount it was handed (captureFromBody says which wins and why). */
  const read = captureFromBody(req.body);
  if (read.code === 'CAPTURE_TIME_REQUIRED') {
    try {
      await holdUndatedCapture(req.user.id, req.body);
      return res.status(202).json({ success: true, data: { outcome: 'needs_capture_update', message: 'Saved for review, not counted as a payment. Update the capture app to send the original payment time.' } });
    } catch {
      return res.status(503).set('Retry-After', '60').json({ success: false, error: 'Capture storage unavailable. Retry later.' });
    }
  }
  if (read.error) return res.status(read.status).json({ success: false, error: read.error });
  /* The setup check: the shortcut, run by hand, with nothing to send yet. */
  if (read.ready) return res.json({ success: true, data: { outcome: 'ready', message: 'The key works. Tap a card with your phone and the payment arrives here.' } });
  const { parsed } = read;
  const ref = `${read.refPrefix}:${crypto.createHash('sha256').update(read.refSeed).digest('hex').slice(0, 32)}`;
  try {
    const result = await ingestSighting(req.user.id, { ...parsed, source_ref: ref });
    res.status(result.action === 'create' ? 201 : 200).json({ success: true, data: { action: result.action, transaction: result.transaction, sighting: { id: result.sighting.id, parse_confidence: result.sighting.parse_confidence } } });
  } catch (error) {
    log.error('capture failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * Resend posts here when mail arrives for the money domain. No session: the caller is
 * Resend, proven by the Svix signature over the raw body. Permanent non-receipts return
 * 200; infrastructure failures return 503 so delivery is retried with the same source id.
 */
router.post('/inbox/resend', async (req, res) => {
  if (!isInboxConfigured()) return res.status(503).json({ success: false, error: 'Inbox not configured' });
  const ok = verifySvix({ rawBody: req.rawBody, headers: req.headers, secret: process.env.RESEND_WEBHOOK_SECRET });
  if (!ok) return res.status(401).json({ success: false, error: 'Bad signature' });
  if (req.body?.type !== 'email.received') return res.json({ success: true, data: { outcome: 'ignored' } });
  try {
    const result = await ingestReceivedEmail(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('inbox failed', { error: error.message });
    res.status(503).set('Retry-After', '60').json({ success: false, error: 'Receipt processing temporarily unavailable' });
  }
});

router.use(authenticateUser);
/* Every read and write below runs in the person's own zone (profile.js): the day a payment
   falls on, the day that is "today", the start of the month, all where they are. */
router.use((req, res, next) => { inPersonScope(req.user.id, () => new Promise((resolve) => { res.on('finish', resolve); res.on('close', resolve); next(); })).catch((error) => { log.warn('zone scope failed', { error: error.message }); next(); }); });
router.get('/capabilities', async (req, res) => {
  try { res.json({ success: true, data: await capabilitiesFor(req.user.id) }); }
  catch (error) { log.error('capabilities failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/**
 * The page in one read (M2-3). Every part the three views share, under one authentication,
 * with the names of the parts that could not be read: the page says "could not be read"
 * only when the month, the ledger and the day all failed, and paints the rest.
 */
router.get('/page', async (req, res) => {
  const view = typeof req.query.view === 'string' ? req.query.view : 'today';
  if (!PAGE_VIEWS.has(view)) return res.status(400).json({ success: false, error: 'Unknown view' });
  try {
    const { data, failed } = await readPage(req.user.id, { view });
    if (failed.length) log.warn('page read incomplete', { failed });
    res.json({ success: true, data: { ...data, failed } });
  } catch (error) { log.error('page failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/notices', async (req, res) => {
  try { res.json({ success: true, data: await listReceiptNotices(req.user.id) }); }
  catch { res.status(503).json({ success: false, error: 'Receipt notices temporarily unavailable' }); }
});

/** How well it has been reading this person: the scored record, summarised. Null until scored. */
router.get('/accuracy', async (req, res) => {
  try { res.json({ success: true, data: await accuracy(req.user.id) }); }
  catch (error) { log.error('accuracy failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/** The person's own receipts address, minted on first ask. */
router.get('/inbox', async (req, res) => {
  try {
    const address = await inboxAddress(req.user.id);
    /* Gmail's forwarding confirmations of the last two days ride along: a failed read of them is an empty list, never a failed address. */
    const forwarding = await listForwardingRequests(req.user.id).catch(quietly('inbox/forwarding-read', []));
    res.json({ success: true, data: { address, domain: inboxDomain(), receiving: isInboxConfigured(), forwarding } });
  } catch (error) {
    log.error('inbox address failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/ledger', async (req, res) => {
  try {
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    if (cursor && cursor.length > 250) return res.status(400).json({ success: false, error: 'Invalid ledger cursor' });
    const page = await transactionPage(req.user.id, { since, cursor });
    res.json({ success: true, ...page });
  } catch (error) {
    if (error.name === 'ZodError' || error instanceof SyntaxError) return res.status(400).json({ success: false, error: 'Invalid ledger date or cursor' });
    log.error('ledger failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/transactions/:id/sightings', async (req, res) => {
  try { res.json({ success: true, data: await sightingsFor(req.user.id, req.params.id) }); }
  catch (error) { log.error('sightings failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/transactions/:id/verdict', validate({ params: S.UUID_PARAM, body: S.VERDICT }), async (req, res) => {
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

/**
 * The month as a calendar: what each day cost, what the coming days carry (charges,
 * commitments, money in, diary days with a learned cost, tomorrow's range) and the notes
 * the person wrote on days. ?month=YYYY-MM for another month; the projection's items only
 * apply to the current one. Everything computed; the page draws cells.
 */
router.get('/plan', async (req, res) => {
  try {
    const now = new Date();
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : null;
    const start = month ? `${month}-01T00:00:00Z` : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    /* includeInternal, or Plan cannot see the diary at all: `event_spend_meta` is an internal
       kind, so the day counts and the term came back empty from a ledger that held 114 days
       of them. The dots for events on a past day (#487) and the term strip (#490) were both
       dead in production from the day they shipped, for this one missing argument
       (2026-09-22). `forecast()` already reads its facts this way. */
    const [cast, rows, facts] = await Promise.all([forecast(req.user.id), listTransactions(req.user.id, { since: start, limit: 5000, currency: ledgerCurrency() }), listFacts(req.user.id, { includeInternal: true })]);
    const plan = monthPlan({ forecast: cast, transactions: rows, facts, month, now, isSpending: spendingRule(facts) });
    /* The term either side of this week: the same facts, no second read (2026-09-21). */
    res.json({ success: true, data: { ...plan, line: planLine(plan, { now }), term: termWeeks(facts, { now }) } });
  } catch (error) { log.error('plan failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/banks', async (req, res) => {
  const can = await capabilitiesFor(req.user.id);
  if (!can.bank) return res.status(403).json({ success: false, error: bankClosed(can) });
  if (!isConfigured()) return res.status(503).json({ success: false, error: 'Bank feed not configured' });
  try { res.json({ success: true, data: await listBanks(typeof req.query.country === 'string' ? req.query.country : (await personProfile(req.user.id)).country) }); }
  catch (error) { log.error('banks failed', { error: error.message }); res.status(502).json({ success: false, error: 'Bank feed unavailable' }); }
});

router.post('/bank/connect', validate({ body: S.BANK_CONNECT }), async (req, res) => {
  const can = await capabilitiesFor(req.user.id);
  if (!can.bank) return res.status(403).json({ success: false, error: bankClosed(can) });
  if (!isConfigured()) return res.status(503).json({ success: false, error: 'Bank feed not configured' });
  try {
    const { bank = 'Banco Santander', country = (await personProfile(req.user.id)).country, back = '' } = req.body || {};
    const { url, authorizationId } = await startAuthorisation({ bankName: String(bank).slice(0, 80), country: String(country).slice(0, 2).toUpperCase(), state: signState(req.user.id, typeof back === 'string' ? back : '') });
    res.json({ success: true, data: { url, authorizationId } });
  } catch (error) {
    log.error('bank connect failed', { error: error.message });
    res.status(502).json({ success: false, error: 'Could not start the bank authorisation' });
  }
});

router.get('/bank/accounts', async (req, res) => {
  try { res.json({ success: true, data: await accountsView(req.user.id) }); }
  catch (error) { log.error('bank accounts failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/bank/accounts/:accountId/cards/:last4/type', validate({ params: S.CARD_TYPE_PARAMS, body: S.CARD_TYPE }), async (req, res) => {
  try {
    res.json({ success: true, data: await labelCard(req.user.id, req.params.accountId, req.params.last4, req.body?.type) });
  } catch (error) {
    if (error.status === 400 || error.status === 404) return res.status(error.status).json({ success: false, error: error.message });
    log.error('card label failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Could not save the card type' });
  }
});

/**
 * Who is holding the phone, for the bank. PSD2 counts background reads, four a day; a read
 * made while the person is in the app is not background, and the bank tells the two apart
 * by these two headers alone. Behind Vercel the address is the first in the forwarded list.
 */
function psuOf(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return { ip: forwarded || req.ip || null, userAgent: req.get('user-agent') || null };
}

/* Opening the app should not show a stale month. A read made with the person present is
   not one of the bank's four background reads a day, so the app reads on every open and on
   every pull down, held only to a short cooldown so a page opened twice in a minute does
   not ask the bank twice. The policy lives here rather than in each client, so the phone
   and the web cannot drift apart on what "stale" means. */
export const STALE_AFTER_MINUTES = 10;

router.post('/bank/refresh-if-stale', async (req, res) => {
  if (!isConfigured()) return res.json({ success: true, data: { pulled: false, reason: 'not configured' } });
  try {
    const accounts = await listBankAccounts(req.user.id);
    if (!accounts.length) return res.json({ success: true, data: { pulled: false, reason: 'no account' } });
    const newest = accounts
      .map((a) => a.last_pulled_at)
      .filter(Boolean)
      .sort()
      .pop();
    const ageMinutes = newest ? (Date.now() - new Date(newest).getTime()) / 60000 : Infinity;
    if (ageMinutes < STALE_AFTER_MINUTES) {
      return res.json({ success: true, data: { pulled: false, reason: 'fresh', age_minutes: Math.round(ageMinutes) } });
    }
    const pulled = await pullBankFeed(req.user.id, { attended: true, psu: psuOf(req) });
    const created = pulled.reduce((n, p) => n + (p.created || 0), 0);
    if (created > 0) {
      await enrichPlaces(req.user.id, { limit: 8 }).catch((e) => log.warn('places after refresh failed', { error: e.message }));
      await refreshReadings(req.user.id).catch((e) => log.warn('readings after refresh failed', { error: e.message }));
    }
    res.json({ success: true, data: { pulled: true, attended: true, created, budget: await feedBudget(req.user.id) } });
  } catch (error) {
    if (error.code === 'feed_budget_spent') return res.json({ success: true, data: { pulled: false, reason: 'budget spent' } });
    if (error.code === 'bank_session_expired') {
      return res.json({ success: true, data: { pulled: false, reason: 'needs reconnect', needs_reconnect: true } });
    }
    if (error.code === 'bank_session_unreachable') {
      return res.json({ success: true, data: { pulled: false, reason: 'session belongs to another application' } });
    }
    log.error('refresh-if-stale failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/bank/pull', validate({ body: S.BANK_PULL }), async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ success: false, error: 'Bank feed not configured' });
  try {
    const data = await pullBankFeed(req.user.id, { since: typeof req.body?.since === 'string' ? req.body.since : undefined, attended: true, psu: psuOf(req) });
    /* A read is worth something only once it has been read: place the new merchants, then
       recompute what it says. The lookup is capped so the request still fits in its minute. */
    if (data.some((d) => d.created > 0)) {
      await enrichPlaces(req.user.id, { limit: 8 }).catch((e) => log.warn('places after pull failed', { error: e.message }));
      await refreshReadings(req.user.id).catch((e) => log.warn('readings after pull failed', { error: e.message }));
    }
    res.json({ success: true, data, budget: await feedBudget(req.user.id) });
  } catch (error) {
    if (error.code === 'feed_budget_spent') {
      return res.status(429).json({ success: false, error: error.message, budget: error.budget });
    }
    log.error('bank pull failed', { error: error.message });
    res.status(502).json({ success: false, error: 'Bank feed unavailable' });
  }
});

/* A statement is how the months before the bank's ninety-day window get in. The file is
   parsed in memory and discarded; only the rows it names reach the database. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv|txt|tsv)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Upload a statement exported as Excel or CSV.'), ok);
  },
});

const statementFailure = (res, error) => {
  if (error instanceof StatementInputError) return res.status(error.status).json({ success: false, error: error.message });
  if (error.name === 'ZodError') return res.status(400).json({ success: false, error: 'Check the account name and statement details.' });
  log.error('statement request failed', { error: error.message });
  return res.status(503).json({ success: false, error: 'The statement service is unavailable. Try again.' });
};
router.get('/statement/accounts', async (req, res) => {
  try { res.json({ success: true, data: await statementAccounts(req.user.id) }); }
  catch (error) { statementFailure(res, error); }
});
router.post('/statement/accounts', validate({ body: S.STATEMENT_ACCOUNT }), async (req, res) => {
  try { res.status(201).json({ success: true, data: await createStatementAccount(req.user.id, req.body) }); }
  catch (error) { statementFailure(res, error); }
});
router.post('/statement', upload.single('file'), async (req, res) => {
  if (!req.file?.buffer?.length) return res.status(400).json({ success: false, error: 'No file received' });
  try {
    const account = await ownedStatementAccount(req.user.id, req.body?.accountId);
    const name = req.file.originalname || '';
    const rows = /\.(xlsx|xls)$/i.test(name)
      ? parseWorkbook(req.file.buffer)
      : parseDelimited(req.file.buffer.toString('utf8'));
    const { sightings, skipped, header } = toSightings(rows, { accountId: account.id, defaultCurrency: account.currency });
    if (!sightings.length) {
      return res.status(422).json({
        success: false,
        error: header ? 'No rows in that file could be read as payments.' : 'That file has no statement header this reads yet.',
        data: { skipped: skipped.length },
      });
    }
    await checkStatementEvidence(req.user.id, account, sightings);
    const result = await ingestSightings(req.user.id, sightings);
    await refreshRecurring(req.user.id).catch((e) => log.warn('recurring after statement failed', { error: e.message }));
    await refreshReadings(req.user.id).catch((e) => log.warn('readings after statement failed', { error: e.message }));
    log.info('statement imported', { userId: req.user.id, rows: sightings.length, created: result.created });
    res.json({ success: true, data: { read: sightings.length, created: result.created, attached: result.attached, skipped: skipped.length } });
  } catch (error) {
    statementFailure(res, error);
  }
});

/** Where a month went, by kind of place. */
router.get('/categories', async (req, res) => {
  try { res.json({ success: true, data: await categorySpend(req.user.id, { month: typeof req.query.month === 'string' ? req.query.month : null }) }); }
  catch (error) { log.error('categories failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/** Look up the merchants not yet placed. Repeat until `left` is zero. */
router.post('/places/lookup', validate({ body: S.PLACES_LOOKUP }), async (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.body?.limit ?? '12'), 10) || 12, 1), 40);
  try { res.json({ success: true, data: await enrichPlaces(req.user.id, { limit }) }); }
  catch (error) { log.error('place lookup failed', { error: error.message }); res.status(502).json({ success: false, error: 'The place lookup did not answer.' }); }
});

/** The places behind the ledger, with what each has taken. */
router.get('/places', async (req, res) => {
  try { res.json({ success: true, data: await listPlaces(req.user.id) }); }
  catch (error) { log.error('places failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/places/:merchantKey/category', validate({ params: S.PLACE_CATEGORY_PARAMS, body: S.PLACE_CATEGORY }), async (req, res) => {
  const category = req.body?.category ?? null;
  if (category !== null && (typeof category !== 'string' || category.length > 40)) {
    return res.status(400).json({ success: false, error: 'category must be a short word or null' });
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.slice(0, 120) : null;
  try { res.json({ success: true, data: await setPlaceCategory(req.user.id, String(req.params.merchantKey).slice(0, 120), category, { name }) }); }
  catch (error) { log.error('place category failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/** How many unattended reads of the consent are left in the rolling day. */
router.get('/bank/budget', async (req, res) => {
  try { res.json({ success: true, data: await feedBudget(req.user.id) }); }
  catch (error) { log.error('budget failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/** What the ledger has worked out on its own: the patterns behind what the twin says. */
router.get('/patterns', async (req, res) => {
  try {
    const findings = await patternsFor(req.user.id);
    res.json({ success: true, data: { findings } });
  } catch (error) {
    log.error('patterns failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Those could not be read right now.' });
  }
});

/** Whether the subscriptions were used, and which of them nothing here can check. */
router.get('/usage', async (req, res) => {
  try { res.json({ success: true, data: await subscriptionUsage(req.user.id) }); }
  catch (error) { log.error('usage failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/**
 * The work, as it happens.
 * ========================
 * A person answering questions deserves to see what is being done with the answers, and
 * this streams the real pipeline: the bank read, the narratives parsed, the places looked
 * up, the merchants learned, the patterns found. Every step carries the count it actually
 * produced. Nothing here is staged — a step that did no work says so, and a step that
 * could not run says why. A progress animation over invented work would be the one lie
 * this product cannot afford, because its whole claim is that its numbers are counted.
 */
router.get('/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (payload) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  let closed = false;
  req.on('close', () => { closed = true; });

  const step = async (name, label, run) => {
    if (closed) return null;
    const startedAt = Date.now();
    send({ step: name, label, state: 'working' });
    try {
      const result = (await run()) || {};
      /* Only the four small fields go down the wire. A step that returns rows for the next
         step's use must not have them serialised into the browser: an early version of this
         streamed the entire ledger, 59 KB of it, to draw a one-line progress row. */
      /* `say` is the same line in parts, so the panel can read it in the person's own
         language; `detail` stays for anything that has not been given parts yet. */
      const { detail = null, count = null, done = false, say = null } = result;
      send({ step: name, label, state: 'done', ms: Date.now() - startedAt, detail, count, done, say });
      return result;
    } catch (error) {
      send({ step: name, label, state: 'failed', detail: 'That step could not run.', say: { key: 'That step could not run.' }, ms: Date.now() - startedAt });
      log.warn(`stream step ${name} failed`, { error: error.message });
      return null;
    }
  };

  try {
    const userId = req.user.id;

    await step('bank', 'Reading the bank', async () => {
      const budget = await feedBudget(userId);
      if (budget.left <= 0) {
        return { detail: 'Four reads a day is the limit and today is spent. Using what is stored.', say: { key: 'Four reads a day is the limit and today is spent. Using what is stored.' }, count: 0 };
      }
      const accounts = await listBankAccounts(userId);
      if (!accounts.length) return { detail: 'No account connected yet.', say: { key: 'No account connected yet.' }, count: 0 };
      /* The same ten minutes the rest of the product holds itself to. This step read the bank
         on every mount of Ask, past the one policy that was written down so the phone and the
         web could not drift apart on what stale means (2026-09-16). */
      const newest = accounts.map((a) => a.last_pulled_at).filter(Boolean).sort().pop();
      const ageMinutes = newest ? (Date.now() - new Date(newest).getTime()) / 60000 : Infinity;
      if (ageMinutes < STALE_AFTER_MINUTES) {
        return { detail: 'Read a moment ago; using what is stored.', say: { key: 'Read a moment ago; using what is stored.' }, count: 0 };
      }
      /* A read that failed and a bank that was never connected are different things, and
         saying the wrong one sends somebody to reconnect an account that is already there. */
      let pulled;
      try {
        /* The person is watching this list: an attended read, outside the four a day. */
        pulled = await pullBankFeed(userId, { attended: true, psu: psuOf(req) });
      } catch (error) {
        /* The provider's message carries a URL with the account identifier in it. A person
           reading "what it is doing" needs to know the read failed, not to be shown the
           plumbing, and an account uid does not belong on a screen. */
        const why = /429|budget|exceeded/i.test(error.message) ? 'the daily limit is spent'
          : /fetch failed|network|ENOTFOUND|timeout/i.test(error.message) ? 'it could not be reached'
            : 'it refused the read';
        /* One key per reason, not a hole: a reason pushed through a hole would arrive in
           English inside a translated sentence. */
        const reason = /429|budget|exceeded/i.test(error.message) ? 'The bank did not answer: the daily limit is spent.'
          : /fetch failed|network|ENOTFOUND|timeout/i.test(error.message) ? 'The bank did not answer: it could not be reached.'
            : 'The bank did not answer: it refused the read.';
        return { detail: `The bank did not answer: ${why}.`, say: { key: reason }, count: 0 };
      }
      const seen = pulled.reduce((n, x) => n + x.seen, 0);
      const created = pulled.reduce((n, x) => n + x.created, 0);
      return {
        detail: created ? `${created} new` : 'nothing new',
        say: created ? { key: '{n} new', vars: { n: created } } : { key: 'nothing new' },
        count: seen,
      };
    });

    const ledger = await step('ledger', 'Reading the payments', async () => {
      const rows = await listTransactions(userId, { limit: 5000 });
      const named = rows.filter((t) => t.merchant_raw).length;
      return { detail: `${named} named by the bank`, say: { key: '{n} named by the bank', vars: { n: named } }, count: rows.length, rows };
    });

    await step('places', 'Working out the places', async () => {
      const r = await enrichPlaces(userId, { limit: 8 });
      if (r.provider === 'none') return { detail: 'Place lookups are off.', say: { key: 'Place lookups are off.' }, count: 0 };
      /* "all of them placed, 0" when nothing was looked at said nothing (2026-09-21). */
      const said = r.left ? { key: '{n} still to do', vars: { n: r.left } } : r.looked ? { key: 'all of them placed' } : { key: 'Nothing new to place.' };
      return {
        detail: r.left ? `${r.left} still to do` : r.looked ? 'all of them placed' : 'Nothing new to place.',
        say: said,
        count: r.placed,
      };
    });

    const learned = await step('learn', 'Learning the rhythms', async () => {
      const r = await learn(userId);
      return {
        detail: r.profiles.length ? `${r.predictions.length} expected next` : 'nothing steady yet',
        say: r.profiles.length ? { key: '{n} expected next', vars: { n: r.predictions.length } } : { key: 'nothing steady yet' },
        count: r.profiles.length,
      };
    });

    await step('patterns', 'Reading what it means', async () => {
      const r = await refreshReadings(userId);
      /* The finding's own sentence is English and belongs to the reading, not to this row;
         the panel says how many there are, in the person's language (2026-09-16). */
      return {
        detail: r.findings.length ? r.findings[0].sentence : 'nothing it can say yet',
        say: r.findings.length
          ? { key: r.findings.length === 1 ? '{n} thing to say about this month' : '{n} things to say about this month', vars: { n: r.findings.length } }
          : { key: 'nothing it can say yet' },
        count: r.findings.length,
      };
    });

    await step('gaps', 'Finding what it cannot explain', async () => {
      const q = await questionsFor(userId);
      return {
        detail: q.fromLedger.length ? q.fromLedger[0].ask : 'nothing left unexplained',
        say: q.fromLedger.length
          ? { key: q.fromLedger.length === 1 ? '{n} question it cannot answer on its own' : '{n} questions it cannot answer on its own', vars: { n: q.fromLedger.length } }
          : { key: 'nothing left unexplained' },
        count: q.fromLedger.length,
      };
    });

    send({ step: 'end', label: 'Done', state: 'done', done: true, learned: learned?.count ?? 0, ledger: ledger?.count ?? 0 });
  } catch (error) {
    log.error('money stream failed', { error: error.message });
    send({ step: 'end', label: 'Stopped', state: 'failed', done: true });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

/* The ledger reads rhythm, price and place. It cannot read meaning: who a name on a
   transfer is, what leaves every month whatever happens, what comes in. Those are asked. */
router.get('/questions', async (req, res) => {
  try { res.json({ success: true, data: await questionsFor(req.user.id) }); }
  catch (error) { log.error('questions failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/questions/answer', validate({ body: S.ANSWER }), async (req, res) => {
  const { questionId, kind, subject, subjectLabel, value, amount, day, share, note } = req.body || {};
  if (!kind) return res.status(400).json({ success: false, error: 'kind is required' });
  try { res.json({ success: true, data: await answerQuestion(req.user.id, { questionId, kind, subject, subjectLabel, value, amount, day, share, note: typeof note === 'string' ? note : undefined }) }); }
  catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    log.error('answer failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/questions/:id/skip', validate({ params: S.ID_PARAM }), async (req, res) => {
  try { res.json({ success: true, data: await skipQuestion(req.user.id, req.params.id) }); }
  catch (error) { log.error('skip failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/facts', async (req, res) => {
  try { res.json({ success: true, data: await listFacts(req.user.id) }); }
  catch (error) { log.error('facts failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});
/* Forget one thing they said; its question is open again. */
router.delete('/facts/:id', validate({ params: S.ID_PARAM }), async (req, res) => {
  try { res.json({ success: true, data: await deleteFact(req.user.id, String(req.params.id).slice(0, 64)) }); }
  catch (error) { log.error('fact delete failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/* The ledger, asked. The numbers are computed; the model only phrases (services/money/chat.js). */
/* The conversation so far, oldest first, so Ask opens where it stood. */
router.get('/chat/history', async (req, res) => {
  try { res.json({ success: true, data: await listChatTurns(req.user.id, { limit: 30 }) }); }
  catch (error) { log.error('chat history failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/chat', validate({ body: S.CHAT }), async (req, res) => {
  const { message, history } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ success: false, error: 'message is required' });
  if (message.length > 2000) return res.status(400).json({ success: false, error: 'message is too long' });
  try { res.json({ success: true, data: await chatAnswer(req.user.id, message, Array.isArray(history) ? history : []) }); }
  catch (error) { log.error('chat failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/**
 * The same answer, as it is written.
 * ==================================
 * Five to twelve seconds is a long time to watch one shimmering line. The prose arrives a
 * sentence at a time while the model is still writing; the figures and receipts follow at
 * the end, because they are computed from the ledger and were never the model's to give.
 * Exactly six fields ever go down this wire. The plain /chat endpoint is unchanged and the
 * app falls back to it, so a stream that breaks costs a person nothing but the liveliness.
 */
router.post('/chat/stream', validate({ body: S.CHAT }), async (req, res) => {
  const { message, history } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ success: false, error: 'message is required' });
  if (message.length > 2000) return res.status(400).json({ success: false, error: 'message is too long' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let closed = false;
  req.on('close', () => { closed = true; });
  const send = (payload) => {
    if (closed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    await chatAnswerStream(req.user.id, message, Array.isArray(history) ? history : [], { onEvent: send });
  } catch (error) {
    /* The service reports its own failures as a phase; this is the belt for anything it
       could not catch, and it says nothing about the provider or the account. */
    log.error('chat stream failed', { error: error.message });
    send({ phase: 'failed', detail: 'That could not be read right now.' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

router.post('/chat/act', validate({ body: S.CHAT_ACT }), async (req, res) => {
  const { action } = req.body || {};
  if (!action || typeof action !== 'object' || typeof action.kind !== 'string') return res.status(400).json({ success: false, error: 'action is required' });
  try { res.json({ success: true, data: await chatAct(req.user.id, action) }); }
  catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    log.error('chat act failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/* The person linked WhatsApp from the You page, under the sentence that says what it will send. */
router.post('/channel/opt-in', validate({ body: S.CHANNEL_OPT_IN }), async (req, res) => {
  if (!isMoneyChannelUser(req.user.id)) return res.status(403).json({ success: false, error: 'Not available on this account.' });
  try { await recordOptIn(req.user.id); res.json({ success: true }); }
  catch (error) { log.error('channel opt-in failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/**
 * A photo or a file handed to the conversation: a receipt, a bill, a contract, a bank
 * export. Read in memory on the machinery that already exists (services/money/attachments.js)
 * and dropped; only what it said reaches the ledger. Both turns are kept like any other.
 */
const attach = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, acceptsAttachment(file.originalname, file.mimetype)),
});
const attachOne = (req, res, next) => attach.single('file')(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: 'That file is over 4 MB. A photo of it would come through.' });
  return res.status(400).json({ success: false, error: 'That file could not be received.' });
});

router.post('/chat/attach', attachOne, async (req, res) => {
  if (!req.file?.buffer?.length) return res.status(400).json({ success: false, error: 'It reads photos, PDFs, plain text and bank exports as Excel or CSV.' });
  const note = typeof req.body?.note === 'string' ? req.body.note.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  const name = String(req.file.originalname || 'file').replace(/[\r\n\t]/g, ' ').trim().slice(0, 120) || 'file';
  try {
    const language = await userLanguage(req.user.id).catch(quietly('attach/user-language', null));
    const r = await readAttachment(req.user.id, { buffer: req.file.buffer, filename: name, mimeType: req.file.mimetype, note, language }, ATTACHMENT_DEPS);
    await saveChatTurn(req.user.id, { role: 'user', text: `Sent ${name}${note ? `. ${note}` : ''}` }).catch(quietly('attach/save-user-turn', null));
    await saveChatTurn(req.user.id, { role: 'twin', text: r.said, receipts: r.receipts || null }).catch(quietly('attach/save-twin-turn', null));
    log.info('chat attachment read', { userId: req.user.id, kind: r.kind, bytes: req.file.size });
    if (!res.headersSent) res.json({ success: true, data: { kind: r.kind, said: r.said, receipts: r.receipts || [] } });
  } catch (error) {
    log.error('chat attach failed', { error: error.message });
    /* The request timeout may already have answered 504; a second answer is a crash, not a courtesy. */
    if (!res.headersSent) res.status(500).json({ success: false, error: 'That file could not be read right now.' });
  }
});

/** Money in and out, per calendar month. */
/* The calendar lens: the week ahead with what its kinds of day tend to cost, and the kinds
   the ledger has learned. One request to Google per read; learning rides on the same events
   when the last pass is older than twelve hours. */
router.get('/calendar', async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 31);
    res.json({ success: true, data: await calendarAhead(req.user.id, days) });
  } catch (error) {
    log.error('calendar read failed', { error: error.message });
    res.status(502).json({ success: false, error: 'The calendar could not be read right now.' });
  }
});

/* Where to send the person to connect Google Calendar. The state carries a path back to the
   money page, which the OAuth callback honours for paths on this site. */
router.get('/calendar/connect', async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ success: false, error: 'Calendar connection not configured' });
    const redirectUri = `${getAppUrl(req)}/oauth/callback`;
    const state = encryptState({ provider: 'google_calendar', userId: req.user.id, timestamp: Date.now(), returnUrl: '/money?calendar=connected' }, 'connector');
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?'
      + `client_id=${encodeURIComponent(process.env.GOOGLE_CLIENT_ID)}&`
      + `redirect_uri=${encodeURIComponent(redirectUri)}&`
      + `scope=${encodeURIComponent(getGoogleWorkspaceScopes().join(' '))}&`
      + 'response_type=code&access_type=offline&prompt=consent&'
      + `state=${state}`;
    res.json({ success: true, data: { url } });
  } catch (error) {
    log.error('calendar connect failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Could not start the calendar connection' });
  }
});

/* A Canvas, Blackboard or any .ics link, pasted. Fetched once to prove it reads, then kept
   as one fact and read with the rest of the calendar. Removing it removes the fact. */
router.post('/calendar/feed', validate({ body: S.CALENDAR_FEED }), async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 2000) : '';
  if (!url) return res.status(400).json({ success: false, error: 'Paste the calendar link.' });
  try {
    /* addFeed learns before it returns, with the events it already read: on Vercel the
       function ends with the response, and a read left running in the background never lands. */
    const feed = await addCalendarFeed(req.user.id, url);
    res.json({ success: true, data: feed });
  } catch (error) {
    /* The person hears one of the two sentences about their link, or that four is the most;
       a failure of ours is a 500 and stays in the log. */
    if (error.code === 'feed_unreadable' || error.code === 'feed_not_calendar' || error.code === 'feed_limit') {
      return res.status(400).json({ success: false, error: error.message });
    }
    log.error('calendar feed failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
router.delete('/calendar/feed/:id', validate({ params: S.ID_PARAM }), async (req, res) => {
  try {
    await removeCalendarFeed(req.user.id, String(req.params.id).slice(0, 32));
    res.json({ success: true });
  } catch (error) {
    log.error('calendar feed remove failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/calendar/learn', async (req, res) => {
  try {
    res.json({ success: true, data: await learnEventSpend(req.user.id) });
  } catch (error) {
    log.error('calendar learn failed', { error: error.message });
    res.status(502).json({ success: false, error: 'The calendar could not be read right now.' });
  }
});

/* Where the person lives: the ledger's guess and what they have confirmed. The guess costs one
   geocoding call per fresh point; the map is proxied so the key never reaches a phone. */
router.get('/home', async (req, res) => {
  try {
    const [guess, saved] = await Promise.all([
      guessHome(req.user.id).catch((e) => { log.warn('home guess failed', { error: e.message }); return null; }),
      savedHome(req.user.id).catch(quietly('home/saved', null)),
    ]);
    res.json({ success: true, data: { guess, saved } });
  } catch (error) {
    log.error('home read failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/home/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').slice(0, 80);
    const profile = await personProfile(req.user.id);
    res.json({ success: true, data: { results: await searchAreas(q, { country: profile.country, language: profile.placesLanguage }) } });
  } catch (error) {
    log.error('home search failed', { error: error.message });
    res.status(502).json({ success: false, error: 'The map could not be searched right now.' });
  }
});

/* A campus, a school, an office, by name: for the study and work facts. Places' text search,
   kept to Spain, six results, name and one line of address; no ids or coordinates leave. */
router.get('/places/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').slice(0, 80);
    const profile = await personProfile(req.user.id);
    res.json({ success: true, data: { results: await searchPlaces(q, { country: profile.country, language: profile.placesLanguage }) } });
  } catch (error) {
    log.error('places search failed', { error: error.message });
    res.status(502).json({ success: false, error: 'Places could not be searched right now.' });
  }
});

router.get('/home/map', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const zoom = Math.min(Math.max(parseInt(req.query.zoom, 10) || 14, 10), 17);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ success: false, error: 'lat and lng are required' });
  }
  try {
    const image = await staticMap({ lat, lng, zoom });
    if (!image) return res.status(502).json({ success: false, error: 'The map could not be drawn right now.' });
    res.set('Content-Type', image.contentType);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(image.buffer);
  } catch (error) {
    log.error('home map failed', { error: error.message });
    res.status(502).json({ success: false, error: 'The map could not be drawn right now.' });
  }
});

router.post('/home', validate({ body: S.HOME }), async (req, res) => {
  const { district, city, lat, lng, source, place_id: placeId } = req.body || {};
  if (!district && !city) return res.status(400).json({ success: false, error: 'district or city is required' });
  try {
    /* A prediction carries no coordinates, so the point is read here, once, when the person
       has actually picked one. The ledger needs it to know which shops are near home. */
    let point = { lat, lng };
    if ((!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) && placeId) {
      const found = await placePoint(placeId).catch(quietly('home/place-point', null));
      if (found) point = { lat: found.lat, lng: found.lng };
    }
    const out = await saveHome(req.user.id, { district, city, lat: point.lat, lng: point.lng, source: source === 'guess' ? 'guess' : 'confirmed' });
    res.json({ success: true, data: { said: out.said, value: out.value } });
  } catch (error) {
    log.error('home save failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/* The one number a person opens the app for: what today can carry. Deterministic, three
   reads of the ledger, no model. It answers null with a reason rather than guessing. */
router.get('/today', async (req, res) => {
  try { res.json({ success: true, data: await todayAllowance(req.user.id) }); }
  catch (error) { log.error('today failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/months', async (req, res) => {
  try { res.json({ success: true, data: await months(req.user.id) }); }
  catch (error) { log.error('months failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/** What the ledger says, with the lines that say it. `?refresh=1` recomputes first. */
router.get('/readings', async (req, res) => {
  try {
    if (req.query.refresh === '1') await refreshReadings(req.user.id);
    res.json({ success: true, data: await listReadings(req.user.id) });
  } catch (error) { log.error('readings failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/readings/:id/verdict', validate({ params: S.ID_PARAM, body: S.READING_VERDICT }), async (req, res) => {
  const verdict = req.body?.verdict;
  if (verdict !== null && verdict !== 'true' && verdict !== 'not_me') {
    return res.status(400).json({ success: false, error: 'verdict must be true, not_me or null' });
  }
  try { res.json({ success: true, data: await setReadingVerdict(req.user.id, req.params.id, verdict) }); }
  catch (error) { log.error('reading verdict failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

export default router;

/** Mounted before the session check: the bank's redirect carries no cookie. */
export const bankCallback = Router();
bankCallback.get('/bank/callback', async (req, res) => {
  const read = readState(req.query.state);
  const userId = read ? read.userId : null;
  const back = read ? read.back : '/money/you';
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!userId) return res.status(400).send('This link is not valid.');
  if (!(await capabilitiesFor(userId)).bank) return res.redirect(302, `${back}?bank=failed&why=closed`);
  if (!code) {
    /* The bank or the person said no: Enable Banking comes back with `error` and no code.
       This used to answer a bare "This link is not valid." and keep no record, so a refused
       Revolut looked like a page that never came back. Said on the money page, kept in the
       feed log, and the reason is the bank's word, not a guess. */
    const refused = typeof req.query.error === 'string' ? req.query.error.replace(/[^a-z0-9_ .-]/gi, '').slice(0, 80) : '';
    log.warn('bank authorisation refused', { error: refused || 'no code' });
    await recordCallbackFailure(userId, `refused: ${refused || 'no code'}`).catch(quietly('bank-callback/record-refused', undefined));
    return res.redirect(302, `${back}?bank=failed${refused ? `&why=${encodeURIComponent(refused)}` : ''}`);
  }
  try {
    let session = await createSession(code);
    log.info('bank session created', { bank: session.bankName, accounts: session.accounts.length });
    if (!session.accounts.length && session.sessionId) {
      /* Read it again before calling it empty: some banks list the accounts only on the
         second read. What came back both times is kept in the feed log, not only in a log
         that is gone in an hour. */
      const first = JSON.stringify(session.raw || {});
      await new Promise((r) => setTimeout(r, 1500));
      const again = await getSession(session.sessionId).catch((e) => { log.warn('bank session re-read failed', { error: e.message }); return null; });
      if (again) { log.info('bank session re-read', { accounts: again.accounts.length }); if (again.accounts.length) session = { ...again, sessionId: session.sessionId }; }
      if (!session.accounts.length) {
        /* And the application as Enable Banking sees it: a production app in restricted
           mode reads only the accounts linked in its Control Panel, and its sessions come
           back authorised and empty for everyone else. */
        const app = await applicationInfo().catch((e) => ({ error: e.message.slice(0, 120) }));
        await recordCallbackFailure(userId, `no accounts: ${session.bankName || 'bank'} session=${session.sessionId} first=${first} again=${JSON.stringify(again ? again.raw : null)} app=${JSON.stringify(app)}`, { keepIds: true }).catch(quietly('bank-callback/record-no-accounts', undefined));
      }
    }
    if (!session.accounts.length) {
      /* The bank said yes and listed nothing: a Revolut with no account under the chosen
         kind, or a consent that selected none. Said "connected" here, the page had nothing
         to read and no row to show, which is what a Revolut looked like on 2026-09-15. The
         whole session object goes to the log, so the next one can be read, not guessed. */
      log.warn('bank session without accounts', { session: JSON.stringify(session.raw || {}).slice(0, 1500) });
      if (!session.sessionId) await recordCallbackFailure(userId, `no accounts: ${session.bankName || 'bank'}`).catch(quietly('bank-callback/record-no-session', undefined));
      return res.redirect(302, `${back}?bank=failed&why=${encodeURIComponent('no accounts were shared')}`);
    }
    await saveBankAccounts(userId, session);
    /* Back to Sources, where the connection was started, with the bank's name so the page
       can say which one is connected. */
    res.redirect(302, `${back}?bank=connected${session.bankName ? `&name=${encodeURIComponent(session.bankName)}` : ''}`);
  } catch (error) {
    log.error('bank callback failed', { error: error.message });
    await recordCallbackFailure(userId, error.message).catch(quietly('bank-callback/record-error', undefined));
    res.redirect(302, `${back}?bank=failed`);
  }
});
