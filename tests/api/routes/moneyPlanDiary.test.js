/**
 * GET /money/plan must read the facts that hold the diary.
 *
 * `event_spend_meta` is an INTERNAL_FACT_KIND, so `listFacts(userId)` drops it and the diary
 * arrives empty without anything failing. The route did exactly that: the dots for events on
 * a past day (#487) and the term strip (#490) came back empty from a ledger holding 114 days
 * of counts, and both were dead in production from the day they shipped (2026-09-22).
 */
import { expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const owner = '00000000-0000-4000-8000-000000000001';
const f = vi.hoisted(() => ({ listFacts: vi.fn(), listTransactions: vi.fn(), forecast: vi.fn() }));
vi.mock('../../../api/services/money/store.js', () => ({
  ingestSighting: vi.fn(),
  ingestSightings: vi.fn(),
  listTransactions: f.listTransactions,
  transactionPage: vi.fn(),
  sightingsFor: vi.fn(),
  refreshRecurring: vi.fn(),
  forecast: f.forecast,
  setVerdict: vi.fn(),
  userForCaptureKey: vi.fn(),
  saveBankAccounts: vi.fn(),
  listBankAccounts: vi.fn(),
  pullBankFeed: vi.fn(),
  refreshReadings: vi.fn(),
  listReadings: vi.fn(),
  setReadingVerdict: vi.fn(),
  months: vi.fn(),
  feedBudget: vi.fn(),
  categorySpend: vi.fn(),
  listPlaces: vi.fn(),
  setPlaceCategory: vi.fn(),
  enrichPlaces: vi.fn(),
  subscriptionUsage: vi.fn(),
  questionsFor: vi.fn(),
  answerQuestion: vi.fn(),
  skipQuestion: vi.fn(),
  listFacts: f.listFacts,
  deleteFact: vi.fn(),
  recordCallbackFailure: vi.fn(),
  listChatTurns: vi.fn(),
  saveChatTurn: vi.fn(),
  learn: vi.fn(),
  userLanguage: vi.fn(),
  patternsFor: vi.fn(),
}));
vi.mock('../../../api/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: owner }; next(); } }));
import router from '../../../api/routes/money.js';
const app = express(); app.use(express.json()); app.use('/money', router);

/* A diary of two events a day across the window the counts cover. */
const days = {};
for (let t = Date.parse('2026-06-24T12:00:00Z'); t <= Date.parse('2026-10-23T12:00:00Z'); t += 86400000) {
  days[new Date(t).toISOString().slice(0, 10)] = 2;
}
const meta = { kind: 'event_spend_meta', subject: 'meta', value: JSON.stringify({ learned_at: new Date().toISOString(), snapshot: [], past: [], days }) };

beforeEach(() => {
  f.listFacts.mockReset(); f.listTransactions.mockReset(); f.forecast.mockReset();
  f.listTransactions.mockResolvedValue([]);
  f.forecast.mockResolvedValue({ month: null, days: { days: [] } });
  /* The repository's own contract: the internal kinds come back only when asked for. */
  f.listFacts.mockImplementation((_id, opts = {}) => Promise.resolve(opts.includeInternal ? [meta] : []));
});

it('asks for the internal facts, so the diary reaches the page', async () => {
  const res = await request(app).get('/money/plan');
  expect(res.status).toBe(200);
  expect(f.listFacts).toHaveBeenCalledWith(owner, { includeInternal: true });
});

it('answers with the term, and with a count of events on the squares', async () => {
  const res = await request(app).get('/money/plan');
  expect(res.body.data.term).toBeTruthy();
  expect(res.body.data.term.weeks.filter((w) => w.known).length).toBeGreaterThanOrEqual(3);
  expect(res.body.data.cells.filter((c) => (c.events || 0) > 0).length).toBeGreaterThan(0);
});
