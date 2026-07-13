/**
 * Starvation-aware fallback in the observation-ingestion cron.
 * =============================================================
 * Live incident (2026-06-23 -> 2026-07-13): the cron fanned out Inngest events
 * and logged success every 30 minutes while ZERO functions executed (app sync
 * rejected over a plan cap; later, events still unconsumed). The existing
 * inline fallback only triggers when inngest.send() THROWS - "send succeeded,
 * nobody consumed" is invisible to it. Ingestion was dead for three weeks.
 *
 * The fix: after a successful fan-out, ask the raw-data layer whether eligible
 * users actually got extracted recently (user_platform_data.extracted_at). If
 * any are starved, run the bounded inline path for the most-starved few - the
 * cron verifies OUTCOMES instead of trusting the enqueue. Self-healing against
 * any consumer failure, with cost capped at the old pre-fanout inline budget.
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

vi.mock('../../../api/middleware/verifyCronSecret.js', () => ({
  verifyCronSecret: () => ({ authorized: true }),
}));
vi.mock('../../../api/services/cronLogger.js', () => ({
  logCronExecution: vi.fn().mockResolvedValue(undefined),
}));

const handler = (await import('../../../api/routes/cron-observation-ingestion.js')).default;

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  runIngestionMock.mockResolvedValue({ observationsStored: 0, errors: [], processedUserIds: [] });
  eligibleMock.mockResolvedValue(['u1', 'u2', 'u3', 'u4']);
  starvedMock.mockResolvedValue([]);
  sendMock.mockResolvedValue({ ids: [] });
});

describe('observation-ingestion cron - starvation fallback', () => {
  it('healthy fan-out with fresh extractions: no inline run', async () => {
    const res = fakeRes();
    await handler({ query: {} }, res);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(runIngestionMock).not.toHaveBeenCalled();
    expect(res.body.mode).toBe('inngest-fanout');
    expect(res.body.success).toBe(true);
  });

  it('fan-out "succeeds" but users are extraction-starved: bounded inline runs for the most starved', async () => {
    starvedMock.mockResolvedValue(['u1', 'u2', 'u3', 'u4']); // all starved
    const res = fakeRes();
    await handler({ query: {} }, res);
    expect(sendMock).toHaveBeenCalledTimes(1); // fan-out still attempted
    expect(runIngestionMock).toHaveBeenCalledTimes(1);
    const arg = runIngestionMock.mock.calls[0][0];
    expect(arg.targetUserIds.length).toBeLessThanOrEqual(3); // pre-fanout inline budget
    expect(arg.targetUserIds).toEqual(['u1', 'u2', 'u3']);
    expect(res.body.mode).toBe('inngest-fanout+starvation-fallback');
    expect(res.body.starved).toBe(4);
  });

  it('inngest.send throws: the original inline-fallback path is preserved', async () => {
    sendMock.mockRejectedValue(new Error('no event key'));
    const res = fakeRes();
    await handler({ query: {} }, res);
    expect(runIngestionMock).toHaveBeenCalledTimes(1);
    expect(runIngestionMock.mock.calls[0][0]).toEqual({});
    expect(res.body.mode).toBe('inline-fallback');
  });

  it('starvation check itself failing does not break the cron (fanout result stands)', async () => {
    starvedMock.mockRejectedValue(new Error('db blip'));
    const res = fakeRes();
    await handler({ query: {} }, res);
    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBe('inngest-fanout');
  });
});
