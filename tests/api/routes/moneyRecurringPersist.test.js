/**
 * The routes that change a line store the standing charges before they answer (audit C3,
 * 2026-09-26). The page used to store them on every open, inside its own completeness check;
 * it only reads them now, so every path that brings a line in or settles one keeps the stored
 * copy (flags, usage, readings) current: a phone capture, a mail read into the ledger, and a
 * payment review resolved. The two reads that stored them (GET /recurring and the month's sheet,
 * which failed its own check the same way) only read them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const owner = '00000000-0000-4000-8000-000000000001';
const f = vi.hoisted(() => ({ ingest: vi.fn(), persist: vi.fn(), read: vi.fn(), resolve: vi.fn(), mail: vi.fn(), scoped: [] }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: '00000000-0000-4000-8000-000000000001' }; next(); } }));
vi.mock('../../../api/_app/services/money/store.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ingestSighting: (...a) => f.ingest(...a),
  refreshRecurring: (...a) => f.persist(...a),
  recurringSeries: (...a) => f.read(...a),
  /* The refresh reads the ledger in the person's currency and zone, so it runs in their scope. */
  inPersonScope: async (userId, fn) => { f.scoped.push(userId); return fn(); },
  /* What the sheet reads besides the series. */
  listOwnTransactions: async () => [{ id: 't1', occurred_at: '2026-09-20T09:00:00Z', amount: -11.99, currency: 'EUR', merchant_key: 'spotify', merchant_raw: 'Spotify', channel: 'card' }],
  listPlaces: async () => [], userLanguage: async () => 'en', personProfileCached: async () => ({ timezone: 'Europe/Madrid' }), listFacts: async () => [],
}));
vi.mock('../../../api/_app/services/money/reconciliationService.js', async (importOriginal) => ({
  ...(await importOriginal()), resolveReconciliation: (...a) => f.resolve(...a),
  getReconciliationStatus: async () => ({ state: 'clear', unresolvedCount: 0, bySource: {}, revision: 1, financialRevision: 1 }),
}));
vi.mock('../../../api/_app/services/money/inbox.js', async (importOriginal) => ({
  ...(await importOriginal()), isInboxConfigured: () => true, verifySvix: () => true, ingestReceivedEmail: (...a) => f.mail(...a),
}));
const router = (await import('../../../api/_app/routes/money.js')).default;
const app = express(); app.use(express.json()); app.use('/money', router);

const payment = { merchant: 'Spotify', amount: '11,99', date: '2026-09-20T09:00:00Z' };
beforeEach(() => {
  f.ingest.mockReset(); f.persist.mockReset().mockResolvedValue([]); f.read.mockReset().mockResolvedValue([{ merchant_key: 'spotify' }]);
  f.resolve.mockReset(); f.mail.mockReset(); f.scoped = [];
});

describe('a phone capture', () => {
  it.each([['creates', 'create'], ['attaches', 'attach']])('that %s a line stores the series in the person\'s scope before it answers', async (_word, action) => {
    f.ingest.mockResolvedValue({ action, transaction: { id: 't1' }, sighting: { id: 's1', parse_confidence: 1 } });
    const res = await request(app).post('/money/capture').send(payment);
    expect(res.status).toBe(action === 'create' ? 201 : 200);
    expect(f.persist).toHaveBeenCalledWith(owner);
    expect(f.scoped).toContain(owner);
  });
  it.each(['existing', 'deferred', 'ignored_deleted'])('that changes no line (%s) leaves it alone', async (action) => {
    f.ingest.mockResolvedValue({ action, transaction: null, sighting: { id: 's1', parse_confidence: 1 } });
    expect((await request(app).post('/money/capture').send(payment)).status).toBe(200);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it('a store that fails does not fail the capture: the line is in', async () => {
    f.ingest.mockResolvedValue({ action: 'create', transaction: { id: 't1' }, sighting: { id: 's1', parse_confidence: 1 } });
    f.persist.mockRejectedValue(new Error('database unavailable'));
    expect((await request(app).post('/money/capture').send(payment)).status).toBe(201);
  });
});

describe('a mail read into the ledger', () => {
  const event = { type: 'email.received', data: { email_id: 'm1' } };
  it.each([['creates', 'create'], ['attaches', 'attach']])('that %s a line stores the series for its owner', async (_word, action) => {
    f.mail.mockResolvedValue({ outcome: 'read', userId: owner, kind: 'bank_alert', action, transaction_id: 't1' });
    expect((await request(app).post('/money/inbox/resend').send(event)).status).toBe(200);
    expect(f.persist).toHaveBeenCalledWith(owner);
    expect(f.scoped).toEqual([owner]);
  });
  it('a notice, a repeat or an unknown address leaves it alone', async () => {
    for (const result of [{ outcome: 'notice_saved' }, { outcome: 'read', userId: owner, action: 'existing' }, { outcome: 'unknown_address' }]) {
      f.mail.mockResolvedValueOnce(result);
      expect((await request(app).post('/money/inbox/resend').send(event)).status).toBe(200);
    }
    expect(f.persist).not.toHaveBeenCalled();
  });
});

describe('a payment review resolved', () => {
  const sighting = '11111111-1111-4111-8111-111111111111';
  it('stores the series once the observation is a line', async () => {
    f.resolve.mockResolvedValue({ resolved: true, transactionId: 't9', revision: 4 });
    const res = await request(app).post(`/money/reconciliation/${sighting}/resolve`).send({ revision: 3, action: 'separate' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ resolved: true });
    expect(f.persist).toHaveBeenCalledWith(owner);
    expect(f.scoped).toContain(owner);
  });
  it('a review that could not resolve leaves it alone', async () => {
    f.resolve.mockRejectedValue(Object.assign(new Error('Payment evidence changed. Refresh this review.'), { status: 409 }));
    expect((await request(app).post(`/money/reconciliation/${sighting}/resolve`).send({ revision: 3, action: 'separate' })).status).toBe(409);
    expect(f.persist).not.toHaveBeenCalled();
  });
});

describe('the reads that stored them', () => {
  it('GET /recurring reads the series and stores nothing', async () => {
    const res = await request(app).get('/money/recurring');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ merchant_key: 'spotify' }]);
    expect(f.read).toHaveBeenCalledWith(owner);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it('the month\'s sheet reads them inside its own check and stores nothing', async () => {
    const res = await request(app).get('/money/sheet?month=2026-09');
    expect(res.status).toBe(200);
    expect(res.headers['x-rows']).toBe('1');
    expect(f.read).toHaveBeenCalledWith(owner);
    expect(f.persist).not.toHaveBeenCalled();
  });
});
