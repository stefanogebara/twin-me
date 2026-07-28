/**
 * Tier 2b archival must key on `superseded_at`, not `superseded_by`.
 *
 * `superseded_by` is declared `REFERENCES user_memories(id) ON DELETE SET NULL`.
 * So when the replacement row is itself deleted, the row it retired keeps
 * `superseded_at` but loses `superseded_by` — it becomes an ORPHANED retired
 * row. Migration 20260728151001 moved retrieval's liveness test to
 * `superseded_at IS NULL` for exactly this reason, but Tier 2b was left
 * selecting on `superseded_by IS NOT NULL`.
 *
 * That gap is self-inflicting: Tier 2b's own archive+delete is what removes
 * replacement rows, so every run can orphan more rows — and an orphaned row is
 * then invisible to Tier 2b forever. It stays in `user_memories`, where the
 * reflection engine, saliency replay and wiki evidence gathering all read it
 * via direct selects, which is the laundering path Tier 2b exists to close.
 *
 * The mock filters in memory so this is a real reproduction rather than an
 * assertion about query syntax.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const TEST_CRON_SECRET = 'test_cron_secret_forgetting';

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = TEST_CRON_SECRET;

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

// Grace period is 7 days, so "old" must be comfortably past it.
const OLD = ago(30 * DAY);
const RECENT = ago(1 * DAY);

let memoryRows;
let archiveInserts;

function freshRows() {
  return [
    {
      id: 'retired-normal',
      user_id: 'u1',
      content: 'Has a backlog of 40000 unread emails in inbox',
      memory_type: 'platform_data',
      metadata: {},
      importance_score: 4,
      created_at: OLD,
      last_accessed_at: OLD,
      superseded_at: OLD,
      superseded_by: 'replacement-1',
    },
    {
      // The bug: retired, past grace, but its replacement was deleted so the
      // FK was NULLed out.
      id: 'retired-orphaned',
      user_id: 'u1',
      content: 'Has a backlog of 39000 unread emails in inbox',
      memory_type: 'platform_data',
      metadata: {},
      importance_score: 4,
      created_at: OLD,
      last_accessed_at: OLD,
      superseded_at: OLD,
      superseded_by: null,
    },
    {
      // Inside the grace window — must be left alone either way.
      id: 'retired-recent',
      user_id: 'u1',
      content: 'Has a backlog of 41000 unread emails in inbox',
      memory_type: 'platform_data',
      metadata: {},
      importance_score: 4,
      created_at: RECENT,
      last_accessed_at: RECENT,
      superseded_at: RECENT,
      superseded_by: 'replacement-2',
    },
    {
      id: 'live-row',
      user_id: 'u1',
      content: 'Prefers morning meetings',
      memory_type: 'fact',
      metadata: {},
      importance_score: 9,
      created_at: OLD,
      last_accessed_at: OLD,
      superseded_at: null,
      superseded_by: null,
    },
  ];
}

beforeEach(() => {
  memoryRows = freshRows();
  archiveInserts = [];
});

vi.mock('../../../api/services/database.js', () => {
  function makeChain(table) {
    // Predicates accumulate; only the Tier 2b shape (a `lt` on superseded_at)
    // is served with rows. Every other tier resolves empty and no-ops.
    const preds = [];
    let sawSupersededCutoff = false;

    const resolve = () => {
      if (table !== 'user_memories' || !sawSupersededCutoff) {
        return { data: [], error: null };
      }
      const matched = memoryRows.filter((row) =>
        preds.every((p) => {
          const v = row[p.col];
          if (p.op === 'notNull') return v !== null && v !== undefined;
          if (p.op === 'isNull') return v === null || v === undefined;
          if (p.op === 'lt') return v !== null && v !== undefined && v < p.val;
          return true;
        })
      );
      return { data: matched, error: null };
    };

    const chain = {
      select() { return chain; },
      not(col, _op, _val) { preds.push({ col, op: 'notNull' }); return chain; },
      is(col) { preds.push({ col, op: 'isNull' }); return chain; },
      lt(col, val) {
        preds.push({ col, op: 'lt', val });
        if (col === 'superseded_at') sawSupersededCutoff = true;
        return chain;
      },
      gte() { return chain; },
      lte() { return chain; },
      eq() { return chain; },
      in() { return Promise.resolve({ data: [], error: null }); },
      update() { return chain; },
      delete() { return chain; },
      order() { return chain; },
      limit() { return Promise.resolve(resolve()); },
      insert(payload) {
        if (table === 'user_memories_archive') {
          archiveInserts.push(...(Array.isArray(payload) ? payload : [payload]));
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(res) { return Promise.resolve(resolve()).then(res); },
    };
    return chain;
  }
  return { supabaseAdmin: { from: (table) => makeChain(table) }, serverDb: {} };
});

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../api/services/cronLogger.js', () => ({
  logCronExecution: async () => {},
}));

const { default: router } = await import('../../../api/routes/cron-memory-forgetting.js');

function makeApp() {
  const app = express();
  app.use('/cron', router);
  return app;
}

const run = () =>
  request(makeApp()).post('/cron').set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

const archivedIds = () =>
  archiveInserts.filter((r) => r.archive_reason === 'tier2b_superseded').map((r) => r.id);

describe('Tier 2b — superseded archival', () => {
  it('archives a retired row whose replacement was deleted', async () => {
    // The regression: keying on superseded_by drops this row permanently,
    // because ON DELETE SET NULL already cleared the pointer.
    await run();
    expect(archivedIds()).toContain('retired-orphaned');
  });

  it('still archives a normally superseded row', async () => {
    await run();
    expect(archivedIds()).toContain('retired-normal');
  });

  it('respects the grace period', async () => {
    await run();
    expect(archivedIds()).not.toContain('retired-recent');
  });

  it('never archives a live row', async () => {
    await run();
    expect(archivedIds()).not.toContain('live-row');
  });
});
