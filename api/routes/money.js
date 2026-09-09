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
 * POST /api/money/bank/pull                pull the feed now (PSD2: four unattended pulls a day)
 * POST /api/money/chat { message, history? } a question or a correction, answered with figures and receipts
 * POST /api/money/chat/act { action }      run an action the person confirmed from a chat reply
 *
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';
import { parseCapture, parseStructured } from '../services/money/captureParser.js';
import { ingestSighting, ingestSightings, listTransactions, sightingsFor, refreshRecurring, forecast, setVerdict, userForCaptureKey, saveBankAccounts, listBankAccounts, pullBankFeed, refreshReadings, listReadings, setReadingVerdict, months, feedBudget, categorySpend, listPlaces, setPlaceCategory, enrichPlaces, subscriptionUsage, questionsFor, answerQuestion, skipQuestion, listFacts, learn } from '../services/money/store.js';
import { parseDelimited, parseWorkbook, toSightings } from '../services/money/statements/importer.js';
import { isConfigured, listBanks, startAuthorisation, createSession } from '../services/money/feeds/enableBanking.js';
import { answer as chatAnswer, act as chatAct } from '../services/money/chat.js';
import { ahead as calendarAhead, learnEventSpend } from '../services/money/calendar.js';
import { todayAllowance } from '../services/money/allowance.js';
import { guessHome, savedHome, searchAreas, staticMap, saveHome } from '../services/money/home.js';
import { encryptState } from '../services/encryption.js';
import { getAppUrl } from '../utils/oauthUtils.js';
import { getGoogleWorkspaceScopes } from '../config/googleWorkspaceScopes.js';

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
  try {
    const data = await pullBankFeed(req.user.id, { since: typeof req.body?.since === 'string' ? req.body.since : undefined });
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

router.post('/statement', upload.single('file'), async (req, res) => {
  if (!req.file?.buffer?.length) return res.status(400).json({ success: false, error: 'No file received' });
  try {
    const name = req.file.originalname || '';
    const rows = /\.(xlsx|xls)$/i.test(name)
      ? parseWorkbook(req.file.buffer)
      : parseDelimited(req.file.buffer.toString('utf8'));
    const { sightings, skipped, header } = toSightings(rows, {});
    if (!sightings.length) {
      return res.status(422).json({
        success: false,
        error: header ? 'No rows in that file could be read as payments.' : 'That file has no statement header this reads yet.',
        data: { skipped: skipped.length },
      });
    }
    const result = await ingestSightings(req.user.id, sightings);
    await refreshRecurring(req.user.id).catch((e) => log.warn('recurring after statement failed', { error: e.message }));
    await refreshReadings(req.user.id).catch((e) => log.warn('readings after statement failed', { error: e.message }));
    log.info('statement imported', { userId: req.user.id, rows: sightings.length, created: result.created });
    res.json({ success: true, data: { read: sightings.length, created: result.created, attached: result.attached, skipped: skipped.length } });
  } catch (error) {
    log.error('statement import failed', { error: error.message });
    res.status(500).json({ success: false, error: 'That statement could not be read.' });
  }
});

/** Where a month went, by kind of place. */
router.get('/categories', async (req, res) => {
  try { res.json({ success: true, data: await categorySpend(req.user.id, { month: typeof req.query.month === 'string' ? req.query.month : null }) }); }
  catch (error) { log.error('categories failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/** Look up the merchants not yet placed. Repeat until `left` is zero. */
router.post('/places/lookup', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.body?.limit ?? '12'), 10) || 12, 1), 40);
  try { res.json({ success: true, data: await enrichPlaces(req.user.id, { limit }) }); }
  catch (error) { log.error('place lookup failed', { error: error.message }); res.status(502).json({ success: false, error: 'The place lookup did not answer.' }); }
});

/** The places behind the ledger, with what each has taken. */
router.get('/places', async (req, res) => {
  try { res.json({ success: true, data: await listPlaces(req.user.id) }); }
  catch (error) { log.error('places failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/places/:merchantKey/category', async (req, res) => {
  const category = req.body?.category ?? null;
  if (category !== null && (typeof category !== 'string' || category.length > 40)) {
    return res.status(400).json({ success: false, error: 'category must be a short word or null' });
  }
  try { res.json({ success: true, data: await setPlaceCategory(req.params.merchantKey, category) }); }
  catch (error) { log.error('place category failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/** How many unattended reads of the consent are left in the rolling day. */
router.get('/bank/budget', async (req, res) => {
  try { res.json({ success: true, data: await feedBudget(req.user.id) }); }
  catch (error) { log.error('budget failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
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
      const { detail = null, count = null, done = false } = result;
      send({ step: name, label, state: 'done', ms: Date.now() - startedAt, detail, count, done });
      return result;
    } catch (error) {
      send({ step: name, label, state: 'failed', detail: 'That step could not run.', ms: Date.now() - startedAt });
      log.warn(`stream step ${name} failed`, { error: error.message });
      return null;
    }
  };

  try {
    const userId = req.user.id;

    await step('bank', 'Reading the bank', async () => {
      const budget = await feedBudget(userId);
      if (budget.left <= 0) {
        return { detail: 'Four reads a day is the limit and today is spent. Using what is stored.', count: 0 };
      }
      const accounts = await listBankAccounts(userId);
      if (!accounts.length) return { detail: 'No account connected yet.', count: 0 };
      /* A read that failed and a bank that was never connected are different things, and
         saying the wrong one sends somebody to reconnect an account that is already there. */
      let pulled;
      try {
        pulled = await pullBankFeed(userId);
      } catch (error) {
        /* The provider's message carries a URL with the account identifier in it. A person
           reading "what it is doing" needs to know the read failed, not to be shown the
           plumbing, and an account uid does not belong on a screen. */
        const why = /429|budget|exceeded/i.test(error.message) ? 'the daily limit is spent'
          : /fetch failed|network|ENOTFOUND|timeout/i.test(error.message) ? 'it could not be reached'
            : 'it refused the read';
        return { detail: `The bank did not answer: ${why}.`, count: 0 };
      }
      const seen = pulled.reduce((n, x) => n + x.seen, 0);
      const created = pulled.reduce((n, x) => n + x.created, 0);
      return { detail: created ? `${created} new` : 'nothing new', count: seen };
    });

    const ledger = await step('ledger', 'Reading the payments', async () => {
      const rows = await listTransactions(userId, { limit: 5000 });
      const named = rows.filter((t) => t.merchant_raw).length;
      return { detail: `${named} named by the bank`, count: rows.length, rows };
    });

    await step('places', 'Working out the places', async () => {
      const r = await enrichPlaces(userId, { limit: 8 });
      if (r.provider === 'none') return { detail: 'Place lookups are off.', count: 0 };
      return { detail: r.left ? `${r.left} still to do` : 'all of them placed', count: r.placed };
    });

    const learned = await step('learn', 'Learning the rhythms', async () => {
      const r = await learn(userId);
      return {
        detail: r.profiles.length ? `${r.predictions.length} expected next` : 'nothing steady yet',
        count: r.profiles.length,
      };
    });

    await step('patterns', 'Reading what it means', async () => {
      const r = await refreshReadings(userId);
      return {
        detail: r.findings.length ? r.findings[0].sentence : 'nothing it can say yet',
        count: r.findings.length,
      };
    });

    await step('gaps', 'Finding what it cannot explain', async () => {
      const q = await questionsFor(userId);
      return { detail: q.fromLedger.length ? q.fromLedger[0].ask : 'nothing left unexplained', count: q.fromLedger.length };
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

router.post('/questions/answer', async (req, res) => {
  const { questionId, kind, subject, subjectLabel, value, amount, day, share } = req.body || {};
  if (!kind) return res.status(400).json({ success: false, error: 'kind is required' });
  try { res.json({ success: true, data: await answerQuestion(req.user.id, { questionId, kind, subject, subjectLabel, value, amount, day, share }) }); }
  catch (error) { log.error('answer failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/questions/:id/skip', async (req, res) => {
  try { res.json({ success: true, data: await skipQuestion(req.user.id, req.params.id) }); }
  catch (error) { log.error('skip failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/facts', async (req, res) => {
  try { res.json({ success: true, data: await listFacts(req.user.id) }); }
  catch (error) { log.error('facts failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

/* The ledger, asked. The numbers are computed; the model only phrases (services/money/chat.js). */
router.post('/chat', async (req, res) => {
  const { message, history } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ success: false, error: 'message is required' });
  if (message.length > 2000) return res.status(400).json({ success: false, error: 'message is too long' });
  try { res.json({ success: true, data: await chatAnswer(req.user.id, message, Array.isArray(history) ? history : []) }); }
  catch (error) { log.error('chat failed', { error: error.message }); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/chat/act', async (req, res) => {
  const { action } = req.body || {};
  if (!action || typeof action !== 'object' || typeof action.kind !== 'string') return res.status(400).json({ success: false, error: 'action is required' });
  try { res.json({ success: true, data: await chatAct(req.user.id, action) }); }
  catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    log.error('chat act failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
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
      savedHome(req.user.id).catch(() => null),
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
    res.json({ success: true, data: { results: await searchAreas(q) } });
  } catch (error) {
    log.error('home search failed', { error: error.message });
    res.status(502).json({ success: false, error: 'The map could not be searched right now.' });
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

router.post('/home', async (req, res) => {
  const { district, city, lat, lng, source } = req.body || {};
  if (!district && !city) return res.status(400).json({ success: false, error: 'district or city is required' });
  try {
    const out = await saveHome(req.user.id, { district, city, lat, lng, source: source === 'guess' ? 'guess' : 'confirmed' });
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

router.post('/readings/:id/verdict', async (req, res) => {
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
  const userId = readState(req.query.state);
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!userId || !code) return res.status(400).send('This link is not valid.');
  try {
    const session = await createSession(code);
    await saveBankAccounts(userId, session);
    /* Back to the page the connection was started from, which is the Money surface. */
    res.redirect(302, '/money?bank=connected');
  } catch (error) {
    log.error('bank callback failed', { error: error.message });
    res.redirect(302, '/money?bank=failed');
  }
});
