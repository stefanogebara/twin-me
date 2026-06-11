/**
 * Integration tests for the generic raw-transaction ingest seam.
 *
 * ingestRawTransactions(userId, sourceMeta, transactions) is the single entry
 * point every non-aggregator source (CSV upload, WhatsApp statements, Gmail
 * OFX courier) feeds. Tests run the REAL Supabase round-trip (insert +
 * select-back + delete) with the LLM/side-effect services mocked — same
 * harness pattern as pluggyIngestion.integration.test.js.
 *
 * The memory-write case is the regression guard for the 2026-06-10 bug where
 * the dual-write selected a non-existent column and silently wrote nothing:
 * it exercises the real transaction_emotional_context embed.
 */

import { describe, it, expect, vi, afterAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env.production') });

// ── mock LLM / side-effecting downstream services ────────────────────────────
vi.mock('../../../api/services/transactions/transactionEmotionTagger.js', () => ({
  tagTransactionsBatch: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../api/services/transactions/transactionNudgeService.js', () => ({
  maybeNudgeForTransactions: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../api/services/transactions/recurrenceDetector.js', () => ({
  detectAndMarkRecurring: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addPlatformObservation: vi.fn().mockResolvedValue({}),
}));

const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const RUN = Date.now();
const extId = (k) => `rawingest-test-${RUN}-${k}`;

afterAll(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await sb.from('user_transactions').delete().like('external_id', `rawingest-test-${RUN}-%`);
});

describe('ingestRawTransactions (generic seam)', { timeout: 30_000 }, () => {
  it('inserts rows, normalizes merchants, and returns inserted ids', async () => {
    const { ingestRawTransactions } = await import(
      '../../../api/services/transactions/rawIngestion.js'
    );

    const result = await ingestRawTransactions(
      TEST_USER_ID,
      { source: 'whatsapp_statement', sourceBank: 'nubank', platform: 'bank_statement' },
      [
        {
          external_id: extId('a'),
          amount: -35.5,
          currency: 'BRL',
          merchant_raw: 'UBER BV *TRIP HELP.UBER.COM',
          transaction_date: '2026-05-02',
          account_type: 'credit_card',
        },
      ],
    );

    expect(result.inserted).toBe(1);
    expect(result.insertedIds).toHaveLength(1);

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await sb
      .from('user_transactions')
      .select('merchant_normalized, category, source, source_bank, amount')
      .eq('external_id', extId('a'))
      .eq('user_id', TEST_USER_ID)
      .single();
    expect(data?.merchant_normalized).toBe('Uber');
    expect(data?.category).toBe('transport');
    expect(data?.source).toBe('whatsapp_statement');
    expect(data?.source_bank).toBe('nubank');
    expect(data?.amount).toBe(-35.5);
  });

  it('writes a memory observation for a material outflow (>= 50) — real schema', async () => {
    const { ingestRawTransactions } = await import(
      '../../../api/services/transactions/rawIngestion.js'
    );
    const { addPlatformObservation } = await import(
      '../../../api/services/memoryStreamService.js'
    );
    addPlatformObservation.mockClear();

    await ingestRawTransactions(
      TEST_USER_ID,
      { source: 'whatsapp_statement', sourceBank: 'nubank', platform: 'bank_statement' },
      [
        {
          external_id: extId('b'),
          amount: -210,
          currency: 'BRL',
          merchant_raw: 'SUPERMERCADO ZAFFARI',
          transaction_date: '2026-05-03',
          account_type: 'checking',
        },
      ],
    );

    expect(addPlatformObservation).toHaveBeenCalledTimes(1);
    const [userArg, contentArg, platformArg] = addPlatformObservation.mock.calls[0];
    expect(userArg).toBe(TEST_USER_ID);
    expect(platformArg).toBe('bank_statement');
    expect(contentArg).toMatch(/210/);
  });

  it('drops garbage amounts (out of range, NaN) and reports them as skipped', async () => {
    const { ingestRawTransactions } = await import(
      '../../../api/services/transactions/rawIngestion.js'
    );

    const result = await ingestRawTransactions(
      TEST_USER_ID,
      { source: 'whatsapp_statement', sourceBank: 'itau', platform: 'bank_statement' },
      [
        { external_id: extId('c1'), amount: 2_000_000, currency: 'BRL', merchant_raw: 'GARBAGE BIG', transaction_date: '2026-05-04' },
        { external_id: extId('c2'), amount: 0.001, currency: 'BRL', merchant_raw: 'GARBAGE TINY', transaction_date: '2026-05-04' },
        { external_id: extId('c3'), amount: 'NaN', currency: 'BRL', merchant_raw: 'GARBAGE NAN', transaction_date: '2026-05-04' },
        { external_id: extId('c4'), amount: -12, currency: 'BRL', merchant_raw: 'PADARIA REAL', transaction_date: '2026-05-04' },
      ],
    );

    expect(result.inserted).toBe(1);
    expect(result.skipped).toHaveLength(3);
  });

  it('is idempotent: re-ingesting the same external_id does not duplicate', async () => {
    const { ingestRawTransactions } = await import(
      '../../../api/services/transactions/rawIngestion.js'
    );

    const tx = {
      external_id: extId('d'),
      amount: -20,
      currency: 'BRL',
      merchant_raw: 'FARMACIA PANVEL',
      transaction_date: '2026-05-05',
    };
    const meta = { source: 'whatsapp_statement', sourceBank: 'nubank', platform: 'bank_statement' };
    await ingestRawTransactions(TEST_USER_ID, meta, [tx]);
    await ingestRawTransactions(TEST_USER_ID, meta, [tx]);

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await sb
      .from('user_transactions')
      .select('id')
      .eq('external_id', extId('d'))
      .eq('user_id', TEST_USER_ID);
    expect(data).toHaveLength(1);
  });
});
