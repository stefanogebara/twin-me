/**
 * A failed response write is not a failed fan-out.
 * =================================================
 * Observed in production (2026-08-18, and four times on 2026-08-25):
 *
 *   20:00:46.298  success  inngest-fanout+starvation-fallback
 *   20:01:44.008  success  inline-fallback
 *   20:01:44.449  error    Cannot set headers after they are sent to the client
 *
 * with execution_time_ms between 1,269,031 and 3,648,919 — 21 to 61 minutes,
 * against a 60s Vercel maxDuration.
 *
 * The cascade: the starvation branch finishes its work and logs success, then
 * `return res.json(...)` throws because Vercel already closed the response at
 * the 60s ceiling. That `res.json()` sits INSIDE the inner try, so
 * `catch (fanoutErr)` catches a RESPONSE error and misreads it as an Inngest
 * failure — running a second, full, all-users inline ingestion (real LLM and
 * platform-API spend, already done moments earlier). That fallback then tries
 * to respond on the same dead socket, throws again, and the outer catch tries
 * a third write which throws unhandled.
 *
 * So one closed socket costs a duplicate paid ingestion pass and a poisoned
 * error log. The fix: never let a response failure trigger work, and never
 * write to a response that has already been sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_URL ||= 'https://cron-stub.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'cron-stub-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'cron-stub-service';

const runIngestionMock = vi.fn().mockResolvedValue({ observationsStored: 0, errors: [], processedUserIds: [] });
const eligibleMock = vi.fn().mockResolvedValue(['u1', 'u2', 'u3', 'u4']);
const starvedMock = vi.fn().mockResolvedValue([]);
vi.mock('../../../api/services/observationIngestion.js', () => ({
  runObservationIngestion: (...a) => runIngestionMock(...a),
  getEligibleIngestionUserIds: (...a) => eligibleMock(...a),
  getStarvedIngestionUserIds: (...a) => starvedMock(...a),
}));

const sendMock = vi.fn().mockResolvedValue({ ids: [] });
vi.mock('../../../api/services/inngestClient.js', () => ({
  inngest: { send: (...a) => sendMock(...a) },
  EVENTS: { INGEST_USER_OBSERVATIONS: 'twin/observation.ingest_user' },
}));

const selfHealMock = vi.fn().mockResolvedValue({ attempted: true, status: 200 });
vi.mock('../../../api/services/inngestSelfHeal.js', () => ({
  selfHealInngestRegistration: (...a) => selfHealMock(...a),
}));

vi.mock('../../../api/middleware/verifyCronSecret.js', () => ({
  verifyCronSecret: () => ({ authorized: true }),
}));

const logCronMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../api/services/cronLogger.js', () => ({
  logCronExecution: (...a) => logCronMock(...a),
}));

const handler = (await import('../../../api/routes/cron-observation-ingestion.js')).default;

/**
 * A response that Vercel already closed at the 60s ceiling: every write throws
 * ERR_HTTP_HEADERS_SENT, exactly as Node's ServerResponse does.
 */
function deadRes() {
  const res = { statusCode: 200, body: null, headersSent: true, writes: 0 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = () => {
    res.writes += 1;
    const err = new Error('Cannot set headers after they are sent to the client');
    err.code = 'ERR_HTTP_HEADERS_SENT';
    throw err;
  };
  return res;
}

function liveRes() {
  const res = { statusCode: 200, body: null, headersSent: false, writes: 0 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.writes += 1; res.body = b; res.headersSent = true; return res; };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  runIngestionMock.mockResolvedValue({ observationsStored: 0, errors: [], processedUserIds: [] });
  eligibleMock.mockResolvedValue(['u1', 'u2', 'u3', 'u4']);
  starvedMock.mockResolvedValue([]);
  sendMock.mockResolvedValue({ ids: [] });
  selfHealMock.mockResolvedValue({ attempted: true, status: 200 });
});

describe('observation-ingestion cron: a closed socket must not cost a second ingestion', () => {
  it('does not re-run ingestion when the fan-out response write fails', async () => {
    const res = deadRes();

    await expect(handler({ query: {} }, res)).resolves.not.toThrow();

    // The healthy fan-out path does no inline work. A failed WRITE must not
    // change that — this is the duplicate paid pass seen in production.
    expect(runIngestionMock).not.toHaveBeenCalled();
  });

  it('does not re-run ingestion when the starvation-branch response write fails', async () => {
    starvedMock.mockResolvedValue(['u1', 'u2', 'u3', 'u4']);
    const res = deadRes();

    await expect(handler({ query: {} }, res)).resolves.not.toThrow();

    // Exactly one bounded inline pass (the legitimate starvation fallback),
    // never a second all-users pass caused by the dead socket.
    expect(runIngestionMock).toHaveBeenCalledTimes(1);
    expect(runIngestionMock.mock.calls[0][0].targetUserIds).toEqual(['u1', 'u2', 'u3']);
  });

  it('does not write at all once the response is known to be closed', async () => {
    const res = deadRes(); // headersSent === true, as after a Vercel 60s cutoff

    await expect(handler({ query: {} }, res)).resolves.not.toThrow();

    // Production cascaded three writes: fan-out, inline-fallback, then the
    // outer 500. When headersSent already says the socket is gone, the right
    // number of attempts is zero.
    expect(res.writes).toBe(0);
  });

  it('swallows a write that throws without headersSent, and does not cascade', async () => {
    // The other real shape: the socket is destroyed but headersSent is still
    // false, so the guard cannot pre-empt it and the write itself throws.
    const res = liveRes();
    res.json = () => {
      res.writes += 1;
      throw Object.assign(new Error('Cannot set headers after they are sent to the client'), {
        code: 'ERR_HTTP_HEADERS_SENT',
      });
    };

    await expect(handler({ query: {} }, res)).resolves.not.toThrow();

    expect(res.writes).toBe(1);        // attempted once
    expect(runIngestionMock).not.toHaveBeenCalled(); // and cost no ingestion
  });

  it('does not log a bogus error row for what is only a dead client', async () => {
    const res = deadRes();
    await handler({ query: {} }, res);

    const errorRows = logCronMock.mock.calls.filter(c => c[1] === 'error');
    expect(errorRows).toEqual([]);
  });

  it('still reports the real outcome normally when the socket is alive', async () => {
    const res = liveRes();
    await handler({ query: {} }, res);

    expect(res.writes).toBe(1);
    expect(res.body.mode).toBe('inngest-fanout');
    expect(res.body.success).toBe(true);
    expect(runIngestionMock).not.toHaveBeenCalled();
  });

  it('a genuine inngest.send failure still falls back to inline ingestion', async () => {
    // Guard against over-correcting: only RESPONSE failures are exempt.
    sendMock.mockRejectedValue(new Error('no event key'));
    const res = liveRes();
    await handler({ query: {} }, res);

    expect(runIngestionMock).toHaveBeenCalledTimes(1);
    expect(res.body.mode).toBe('inline-fallback');
  });
});
