/**
 * Tests for api/services/morningBriefingService.js
 *
 * Focuses on H8 regression: recordBriefingEmailSent must set delivered_at
 * (not just delivered=true) so audit queries that filter on
 * `delivered_at IS NOT NULL` correctly count the row as delivered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture inserted rows for assertions
const insertedRows = [];

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn((row) => {
        insertedRows.push(row);
        return Promise.resolve({ data: null, error: null });
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        })),
      })),
    })),
  },
}));

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
}));

vi.mock('../../../api/services/tokenRefreshService.js', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue({ success: false }),
}));

// inSilicoEngine mock removed — the engine was deleted (replan-2026-06-10 cycle 4).

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { recordBriefingEmailSent } = await import(
  '../../../api/services/morningBriefingService.js'
);

describe('recordBriefingEmailSent (H8 regression)', () => {
  beforeEach(() => {
    insertedRows.length = 0;
  });

  it('writes delivered_at alongside delivered=true so audit queries see the row as delivered', async () => {
    const userId = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
    const before = Date.now();

    await recordBriefingEmailSent(userId);

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0];

    expect(row.user_id).toBe(userId);
    expect(row.category).toBe('briefing_email');
    expect(row.delivered).toBe(true);

    // H8 root cause: delivered_at was missing — audit query for
    // `delivered_at IS NOT NULL` reported 0/19 delivered.
    expect(row.delivered_at).toBeDefined();
    expect(row.delivered_at).not.toBeNull();

    // Must be a valid ISO timestamp roughly matching "now"
    const insertedAt = new Date(row.delivered_at).getTime();
    expect(insertedAt).toBeGreaterThanOrEqual(before);
    expect(insertedAt).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
