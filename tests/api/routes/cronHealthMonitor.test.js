/**
 * Tests for /api/cron/health-monitor.
 *
 * The monitor was built to catch the "looks healthy, does no work"
 * pattern that hid three real bugs during the 2026-05-22 audit:
 *   - meeting-debrief running successfully every 30 min for weeks
 *     with debriefsGenerated=0
 *   - pluggy-sync reporting success daily while errors=1, synced=0
 *   - soul-signature-regen reporting "no_eligible_users" daily
 *
 * Tests replay the exact audit-period result_data shapes and assert
 * the monitor flags each as a zombie. Plus the converse: healthy
 * crons with nonzero work counters are NOT flagged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const TEST_CRON_SECRET = 'test_cron_secret_health_monitor';

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = TEST_CRON_SECRET;

// ── shared mock state ────────────────────────────────────────────────────────
let recentRunsToReturn;
let cronLoggerCalls;

beforeEach(() => {
  recentRunsToReturn = [];
  cronLoggerCalls = [];
});

vi.mock('../../../api/services/database.js', () => {
  return {
    supabaseAdmin: {
      from: () => ({
        select: () => ({
          gte: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: recentRunsToReturn, error: null }),
            }),
          }),
        }),
      }),
    },
  };
});

vi.mock('../../../api/services/cronLogger.js', () => ({
  logCronExecution: async (name, status, ms, payload, err) => {
    cronLoggerCalls.push({ name, status, ms, payload, err });
  },
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

const { default: router } = await import('../../../api/routes/cron-health-monitor.js');

function makeApp() {
  const app = express();
  app.use('/cron', router);
  return app;
}

function run(at, jobName, status, resultData, errorMessage = null) {
  return { job_name: jobName, status, result_data: resultData, executed_at: at, error_message: errorMessage };
}

describe('cron /health-monitor', () => {
  describe('auth', () => {
    it('401s without CRON_SECRET', async () => {
      const res = await request(makeApp()).post('/cron');
      expect(res.status).toBe(401);
      expect(cronLoggerCalls).toHaveLength(0);
    });
  });

  describe('zombie detection — the audit-shape inputs all flag', () => {
    it('meeting-debrief: 3 successive runs with debriefsGenerated=0 → ZOMBIE', async () => {
      recentRunsToReturn = [
        run('2026-05-22T09:00:00Z', 'meeting-debrief', 'success', { users: 1, errors: 0, debriefsGenerated: 0 }),
        run('2026-05-22T08:30:00Z', 'meeting-debrief', 'success', { users: 1, errors: 0, debriefsGenerated: 0 }),
        run('2026-05-22T08:00:00Z', 'meeting-debrief', 'success', { users: 1, errors: 0, debriefsGenerated: 0 }),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body.zombies).toBe(1);
      expect(res.body.zombieList[0].job).toBe('meeting-debrief');
    });

    it('pluggy-sync: 3 successive runs with synced=0, ingested=0 → ZOMBIE', async () => {
      recentRunsToReturn = [
        run('2026-05-22T06:00:00Z', 'pluggy-sync', 'success', { errors: 1, synced: 0, ingested: 0 }),
        run('2026-05-21T06:00:00Z', 'pluggy-sync', 'success', { errors: 1, synced: 0, ingested: 0 }),
        run('2026-05-20T06:00:00Z', 'pluggy-sync', 'success', { errors: 1, synced: 0, ingested: 0 }),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.zombieList.map(z => z.job)).toContain('pluggy-sync');
    });

    it('soul-signature-regen: 3 successive runs with processed=0, eligible=0 → ZOMBIE', async () => {
      recentRunsToReturn = [
        run('2026-05-22T06:00:00Z', 'soul-signature-regen', 'success', { reason: 'no_eligible_users', eligible: 0, processed: 0 }),
        run('2026-05-21T06:00:00Z', 'soul-signature-regen', 'success', { reason: 'no_eligible_users', eligible: 0, processed: 0 }),
        run('2026-05-20T06:00:00Z', 'soul-signature-regen', 'success', { reason: 'no_eligible_users', eligible: 0, processed: 0 }),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.zombieList.map(z => z.job)).toContain('soul-signature-regen');
    });
  });

  describe('zombies are NOT flagged when the cron is doing real work', () => {
    it('investment-correlation with scanned > 0 is healthy', async () => {
      recentRunsToReturn = [
        run('2026-05-22T08:00:00Z', 'investment-correlation', 'success', { scanned: 1, retagged: 93, stored: 0 }),
        run('2026-05-21T08:00:00Z', 'investment-correlation', 'success', { scanned: 1, retagged: 93, stored: 0 }),
        run('2026-05-20T08:00:00Z', 'investment-correlation', 'success', { scanned: 1, retagged: 93, stored: 0 }),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.zombies).toBe(0);
      expect(res.body.healthy).toBeGreaterThan(0);
    });

    it('observation-ingestion with users > 0 is healthy', async () => {
      recentRunsToReturn = [
        run('2026-05-22T09:00:00Z', 'observation-ingestion', 'success', { users: 1, ingested: 12 }),
        run('2026-05-22T08:30:00Z', 'observation-ingestion', 'success', { users: 1, ingested: 8 }),
        run('2026-05-22T08:00:00Z', 'observation-ingestion', 'success', { users: 1, ingested: 15 }),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.zombies).toBe(0);
    });
  });

  describe('cleanup crons are excluded from zombie detection', () => {
    it('stripe-webhook-events-cleanup with deleted=0 is healthy (nothing to clean is fine)', async () => {
      recentRunsToReturn = [
        run('2026-05-22T04:00:00Z', 'stripe-webhook-events-cleanup', 'success', { deleted: 0, retentionDays: 30 }),
        run('2026-05-15T04:00:00Z', 'stripe-webhook-events-cleanup', 'success', { deleted: 0, retentionDays: 30 }),
        run('2026-05-08T04:00:00Z', 'stripe-webhook-events-cleanup', 'success', { deleted: 0, retentionDays: 30 }),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.zombies).toBe(0);
      expect(res.body.healthy).toBe(1);
    });

    it('agent-actions-cleanup with deleted=0 is healthy', async () => {
      recentRunsToReturn = [
        run('2026-05-22T02:00:00Z', 'agent-actions-cleanup', 'success', { deleted: 0 }),
        run('2026-05-21T02:00:00Z', 'agent-actions-cleanup', 'success', { deleted: 0 }),
        run('2026-05-20T02:00:00Z', 'agent-actions-cleanup', 'success', { deleted: 0 }),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.zombies).toBe(0);
    });
  });

  describe('quiet-by-design crons are tracked but not flagged', () => {
    it('bank-consent with processed=0 every day → quietByDesign, NOT zombie', async () => {
      recentRunsToReturn = [
        run('2026-05-22T10:00:00Z', 'bank-consent', 'success', { sent: 0, skipped: 0, processed: 0 }),
        run('2026-05-21T10:00:00Z', 'bank-consent', 'success', { sent: 0, skipped: 0, processed: 0 }),
        run('2026-05-20T10:00:00Z', 'bank-consent', 'success', { sent: 0, skipped: 0, processed: 0 }),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.zombies).toBe(0);
      expect(res.body.quietByDesign).toBeGreaterThan(0);
    });
  });

  describe('errored crons are flagged separately', () => {
    it('cron with status=error in every recent run → errored bucket', async () => {
      recentRunsToReturn = [
        run('2026-05-22T07:00:00Z', 'some-cron', 'error', null, 'Connection refused'),
        run('2026-05-22T06:00:00Z', 'some-cron', 'error', null, 'Connection refused'),
        run('2026-05-22T05:00:00Z', 'some-cron', 'error', null, 'Connection refused'),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.errored).toBe(1);
      expect(res.body.erroredList[0].job).toBe('some-cron');
      expect(res.body.erroredList[0].firstError).toContain('Connection refused');
    });
  });

  describe('mixed audit-shape input', () => {
    it('all three audit zombies + healthy crons in one sweep classified correctly', async () => {
      recentRunsToReturn = [
        // 3 zombies
        run('2026-05-22T09:00:00Z', 'meeting-debrief', 'success', { users: 1, errors: 0, debriefsGenerated: 0 }),
        run('2026-05-22T08:30:00Z', 'meeting-debrief', 'success', { users: 1, errors: 0, debriefsGenerated: 0 }),
        run('2026-05-22T08:00:00Z', 'meeting-debrief', 'success', { users: 1, errors: 0, debriefsGenerated: 0 }),
        run('2026-05-22T06:00:00Z', 'pluggy-sync', 'success', { errors: 1, synced: 0, ingested: 0 }),
        run('2026-05-21T06:00:00Z', 'pluggy-sync', 'success', { errors: 1, synced: 0, ingested: 0 }),
        run('2026-05-20T06:00:00Z', 'pluggy-sync', 'success', { errors: 1, synced: 0, ingested: 0 }),
        run('2026-05-22T06:00:00Z', 'soul-signature-regen', 'success', { eligible: 0, processed: 0 }),
        run('2026-05-21T06:00:00Z', 'soul-signature-regen', 'success', { eligible: 0, processed: 0 }),
        run('2026-05-20T06:00:00Z', 'soul-signature-regen', 'success', { eligible: 0, processed: 0 }),
        // healthy
        run('2026-05-22T08:00:00Z', 'investment-correlation', 'success', { scanned: 1, retagged: 93 }),
        run('2026-05-21T08:00:00Z', 'investment-correlation', 'success', { scanned: 1, retagged: 93 }),
        run('2026-05-20T08:00:00Z', 'investment-correlation', 'success', { scanned: 1, retagged: 93 }),
        // cleanup (excluded)
        run('2026-05-22T04:00:00Z', 'stripe-webhook-events-cleanup', 'success', { deleted: 0 }),
        run('2026-05-15T04:00:00Z', 'stripe-webhook-events-cleanup', 'success', { deleted: 0 }),
        run('2026-05-08T04:00:00Z', 'stripe-webhook-events-cleanup', 'success', { deleted: 0 }),
      ];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.zombies).toBe(3);
      const zombieJobs = res.body.zombieList.map(z => z.job).sort();
      expect(zombieJobs).toEqual(['meeting-debrief', 'pluggy-sync', 'soul-signature-regen']);
    });
  });

  describe('observability', () => {
    it('writes a success row to cron_executions with the report', async () => {
      recentRunsToReturn = [
        run('2026-05-22T08:00:00Z', 'investment-correlation', 'success', { scanned: 1 }),
      ];
      await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(cronLoggerCalls).toHaveLength(1);
      expect(cronLoggerCalls[0].name).toBe('cron-health-monitor');
      expect(cronLoggerCalls[0].status).toBe('success');
      expect(cronLoggerCalls[0].payload).toMatchObject({
        cronsInspected: expect.any(Number),
        zombies: expect.any(Number),
        errored: expect.any(Number),
        healthy: expect.any(Number),
      });
    });
  });
});
