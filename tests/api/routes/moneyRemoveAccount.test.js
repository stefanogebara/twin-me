import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const f = vi.hoisted(() => ({ remove: vi.fn(), del: vi.fn(), recurring: vi.fn(), readings: vi.fn() }));
vi.mock('../../../api/_app/services/money/store.js', async (importOriginal) => ({ ...(await importOriginal()), removeBankAccount: (...a) => f.remove(...a), refreshRecurring: (...a) => f.recurring(...a), refreshReadings: (...a) => f.readings(...a) }));
vi.mock('../../../api/_app/services/money/feeds/enableBanking.js', async (importOriginal) => ({ ...(await importOriginal()), deleteSession: (...a) => f.del(...a) }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: 'u1' }; next(); } }));
const router = (await import('../../../api/_app/routes/money.js')).default;
const app = express(); app.use(express.json()); app.use('/money', router);
const ACC = '11111111-1111-4111-8111-111111111111';

beforeEach(() => { f.remove.mockReset(); f.del.mockReset(); f.recurring.mockReset().mockResolvedValue([]); f.readings.mockReset().mockResolvedValue([]); });

describe('DELETE /money/bank/accounts/:id', () => {
  it('removes the account, ends the consent through the feed, and recomputes what the ledger says', async () => {
    f.remove.mockImplementation(async (userId, id, { endConsent }) => { await endConsent('sess-1'); return { id, name: 'Santander', transactions: 9, sightings: 12, consent_ended: true }; });
    f.del.mockResolvedValue(true);
    const res = await request(app).delete(`/money/bank/accounts/${ACC}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ transactions: 9, sightings: 12, consent_ended: true });
    expect(f.remove).toHaveBeenCalledWith('u1', ACC, expect.objectContaining({ endConsent: expect.any(Function) }));
    expect(f.del).toHaveBeenCalledWith('sess-1');
    expect(f.recurring).toHaveBeenCalledWith('u1');
    expect(f.readings).toHaveBeenCalledWith('u1');
  });
  it('is a 404 for an account that is not theirs, and a 400 for a bad id', async () => {
    f.remove.mockResolvedValue(null);
    expect((await request(app).delete(`/money/bank/accounts/${ACC}`)).status).toBe(404);
    expect((await request(app).delete('/money/bank/accounts/not-a-uuid')).status).toBe(400);
    expect(f.recurring).not.toHaveBeenCalled();
  });
});
