/**
 * Public portfolio — fidelity score exposure (Phase 2, product-truth-review)
 * ==========================================================================
 * The fidelity battery (twin_fidelity_checks) is the only honest proof the
 * twin knows its human. Phase 2 makes it the headline metric: the public
 * share card at /p/:userId carries the latest measured twin accuracy.
 *
 * Pinned here:
 * - the endpoint emits portfolio.fidelity { accuracy, wave, measured_at }
 *   from the latest wave whose twin_accuracy is non-null
 * - fidelity is null (not absent, not an error) when no wave exists —
 *   the fetch is one of the non-critical parallel legs
 * - the is_public gate still 404s before any fidelity read
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';

const tableData = {};
const orderCalls = {};

/** Chainable query stub: every method returns this; awaiting resolves with
 *  the row(s) registered for the table (single() → object, else array). */
function makeQuery(table) {
  const rows = tableData[table] ?? [];
  const chain = {
    single: vi.fn(() =>
      Promise.resolve(
        rows.length > 0
          ? { data: rows[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
      ),
    ),
    then: (resolve, reject) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  for (const m of ['select', 'eq', 'not', 'is', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  // order() is recorded per table so tests can pin the tie-break, which is
  // invisible in the returned rows but decides which wave the public page
  // publishes (see the battery_version regression below).
  chain.order = vi.fn((col, opts) => {
    (orderCalls[table] ??= []).push({ col, ...opts });
    return chain;
  });
  return chain;
}

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn((table) => makeQuery(table)) },
}));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { default: portfolioRoutes } = await import(
  '../../../api/routes/portfolio-public.js'
);

const app = express();
app.use('/api/portfolio', portfolioRoutes);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

beforeEach(() => {
  for (const k of Object.keys(tableData)) delete tableData[k];
  for (const k of Object.keys(orderCalls)) delete orderCalls[k];
  tableData.soul_signatures = [
    {
      archetype_name: 'The Debugging Composer',
      archetype_subtitle: 'Patterns in the noise',
      narrative: 'n',
      defining_traits: [],
      color_scheme: null,
      icon_type: null,
      updated_at: '2026-08-01T00:00:00Z',
    },
  ];
  tableData.users = [{ name: 'Stefano G', first_name: 'Stefano', avatar_url: null }];
});

describe('GET /api/portfolio/public/:userId — fidelity', () => {
  it('includes the latest measured fidelity wave', async () => {
    tableData.twin_fidelity_checks = [
      { twin_accuracy: 0.82, normalized_fidelity: 0.9, wave: 3, created_at: '2026-08-05T00:00:00Z' },
    ];
    const res = await request(app).get(`/api/portfolio/public/${USER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.portfolio.fidelity).toEqual({
      accuracy: 0.82,
      normalized: 0.9,
      self_consistency: null,
      items: null,
      wave: 3,
      measured_at: '2026-08-05T00:00:00Z',
    });
  });

  it('publishes the honest denominator, n and date alongside the score', async () => {
    tableData.twin_fidelity_checks = [
      {
        twin_accuracy: 0.61,
        self_consistency: 0.8,
        normalized_fidelity: 0.7625,
        user_answers: { a: 1, b: 2, c: 3 },
        wave: 2,
        battery_version: 3,
        created_at: '2026-08-12T00:00:00Z',
      },
    ];
    const res = await request(app).get(`/api/portfolio/public/${USER_ID}`);
    const f = res.body.portfolio.fidelity;
    // A number served without auth must carry what makes it interpretable.
    expect(f.normalized).toBe(0.7625);
    expect(f.self_consistency).toBe(0.8);
    expect(f.items).toBe(3);
    expect(f.measured_at).toBe('2026-08-12T00:00:00Z');
  });

  it('orders by battery_version before wave so a revision cannot resurface a retired score', async () => {
    // Regression: every battery revision restarts `wave` at 1, so three real
    // waves sat tied at wave=1 and the retired 20-item v1 score (0.825) was
    // served publicly over the current v3 measurement (0.61).
    tableData.twin_fidelity_checks = [
      { twin_accuracy: 0.61, wave: 1, battery_version: 3, created_at: '2026-08-12T00:00:00Z' },
    ];
    await request(app).get(`/api/portfolio/public/${USER_ID}`);
    const cols = (orderCalls.twin_fidelity_checks || []).map(o => o.col);
    expect(cols[0]).toBe('battery_version');
    expect(cols).toContain('wave');
    expect(cols).toContain('created_at');
    expect((orderCalls.twin_fidelity_checks || []).every(o => o.ascending === false)).toBe(true);
  });

  it('emits fidelity: null when the user has no measured wave', async () => {
    tableData.twin_fidelity_checks = [];
    const res = await request(app).get(`/api/portfolio/public/${USER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.portfolio.fidelity).toBeNull();
  });

  it('still 404s non-public signatures before reading fidelity', async () => {
    tableData.soul_signatures = [];
    tableData.twin_fidelity_checks = [
      { twin_accuracy: 0.9, wave: 1, created_at: '2026-08-05T00:00:00Z' },
    ];
    const res = await request(app).get(`/api/portfolio/public/${USER_ID}`);
    expect(res.status).toBe(404);
  });
});
