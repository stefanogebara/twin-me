/**
 * Integration test: Pluggy webhook → transaction ingestion → merchant_normalized.
 *
 * Tests the full path:
 *   ingestTransactionsByIds(userId, itemId, [txId])
 *     → pluggyClient.getAccounts + getTransaction  [MOCKED — Pluggy HTTP API]
 *     → upsertTransactions → normalizeMerchant
 *     → user_transactions row written                [REAL Supabase]
 *     → assert merchant_normalized populated correctly
 *     → cleanup
 *
 * Downstream LLM/embedding services (tagger, nudge, memory, recurrence) are
 * all mocked so the test is free, fast, and idempotent.
 *
 * Uses .env.production for Supabase creds — same pattern as the manual probe
 * scripts. Writes + deletes a single test row using a deterministic external_id.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env.production') });

// ── mock Pluggy HTTP client ────────────────────────────────────────────────────
const mockGetAccounts = vi.fn();
const mockGetTransaction = vi.fn();

vi.mock('../../../api/services/transactions/pluggyClient.js', () => ({
  getAccounts: (...a) => mockGetAccounts(...a),
  getTransaction: (...a) => mockGetTransaction(...a),
  getApiKey: vi.fn().mockResolvedValue('mock-api-key'),
  getItem: vi.fn(),
  triggerSync: vi.fn(),
  deleteItem: vi.fn(),
  createConnectToken: vi.fn(),
  _resetApiKeyCache: vi.fn(),
}));

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

// ── test constants ────────────────────────────────────────────────────────────
const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const FAKE_ITEM_ID = 'test-item-merchant-norm-001';
const FAKE_ACCOUNT_ID = 'test-acc-merchant-norm-001';
// Deterministic external_id so cleanup is reliable even if test is interrupted.
const FAKE_TX_ID = `tx-merchant-norm-${Date.now()}`;
const EXTERNAL_ID = `pluggy:${FAKE_TX_ID}`;

// ── setup Pluggy mock responses ───────────────────────────────────────────────
beforeAll(() => {
  mockGetAccounts.mockResolvedValue({
    results: [{ id: FAKE_ACCOUNT_ID, type: 'BANK', subtype: 'CHECKING_ACCOUNT' }],
  });
  mockGetTransaction.mockResolvedValue({
    id: FAKE_TX_ID,
    accountId: FAKE_ACCOUNT_ID,
    // amount < MEMORY_MIN_AMOUNT (50 BRL) — keeps test below memory dual-write threshold
    amount: -30,
    type: 'DEBIT',
    date: '2026-04-28',
    currencyCode: 'BRL',
    description: 'DEBITO EM CONTA',
    // Unrecognized merchant — exercises fallbackBrand path
    merchant: { name: 'PLUGGY BRASIL INSTITUICAO DE PAGAMENTO LTDA' },
  });
});

// ── cleanup: remove the test row regardless of pass/fail ─────────────────────
afterAll(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  await sb.from('user_transactions').delete().eq('external_id', EXTERNAL_ID);
});

// ── tests ─────────────────────────────────────────────────────────────────────
// This is a true integration test: real Supabase round-trip per case (insert +
// select-back + delete). The first case also pays for module load — pluggy
// Ingestion.js triggers Supabase + encryption init at import time. 5s default
// is too tight; observed timings sit around 3-4s with another ~1s slack for
// CI noise. 30s gives the network + warmup comfortable headroom while still
// catching a real hang (e.g., Supabase 60s default vs this 30s ceiling).
describe('ingestTransactionsByIds — merchant_normalized written to DB', { timeout: 30_000 }, () => {
  it('populates merchant_normalized via fallbackBrand for unrecognized merchant', async () => {
    const { ingestTransactionsByIds } = await import(
      '../../../api/services/transactions/pluggyIngestion.js'
    );

    const result = await ingestTransactionsByIds(TEST_USER_ID, FAKE_ITEM_ID, [FAKE_TX_ID]);

    // Ingestion should have processed 1 transaction
    expect(result.inserted).toBe(1);

    // Verify the DB row
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await sb
      .from('user_transactions')
      .select('merchant_raw, merchant_normalized, category, amount, source')
      .eq('external_id', EXTERNAL_ID)
      .eq('user_id', TEST_USER_ID)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.merchant_raw).toBe('PLUGGY BRASIL INSTITUICAO DE PAGAMENTO LTDA');
    expect(data.merchant_normalized).toBe('Pluggy Brasil');
    expect(data.category).toBe('other');
    expect(data.amount).toBe(-30);
    expect(data.source).toBe('pluggy_webhook');
  });

  it('resolves known-RULES merchant without fallback (Uber)', async () => {
    const uberTxId = `tx-uber-norm-${Date.now()}`;
    const uberExternalId = `pluggy:${uberTxId}`;

    mockGetTransaction.mockResolvedValueOnce({
      id: uberTxId,
      accountId: FAKE_ACCOUNT_ID,
      amount: -25,
      type: 'DEBIT',
      date: '2026-04-28',
      currencyCode: 'BRL',
      description: 'UBER BV *TRIP',
      merchant: { name: 'Uber BV *TRIP HELP.UBER.COM' },
    });

    const { ingestTransactionsByIds } = await import(
      '../../../api/services/transactions/pluggyIngestion.js'
    );
    await ingestTransactionsByIds(TEST_USER_ID, FAKE_ITEM_ID, [uberTxId]);

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data } = await sb
      .from('user_transactions')
      .select('merchant_normalized, category')
      .eq('external_id', uberExternalId)
      .eq('user_id', TEST_USER_ID)
      .single();

    expect(data?.merchant_normalized).toBe('Uber');
    expect(data?.category).toBe('transport');

    // cleanup this row too
    await sb.from('user_transactions').delete().eq('external_id', uberExternalId);
  });

  it('populates merchant_normalized via description when merchant field absent', async () => {
    const noMerchantTxId = `tx-no-merchant-${Date.now()}`;
    const noMerchantExternalId = `pluggy:${noMerchantTxId}`;

    mockGetTransaction.mockResolvedValueOnce({
      id: noMerchantTxId,
      accountId: FAKE_ACCOUNT_ID,
      amount: -40,
      type: 'DEBIT',
      date: '2026-04-28',
      currencyCode: 'BRL',
      description: 'RESTAURANTE BOA VISTA LTDA',
      // no merchant field
    });

    const { ingestTransactionsByIds } = await import(
      '../../../api/services/transactions/pluggyIngestion.js'
    );
    await ingestTransactionsByIds(TEST_USER_ID, FAKE_ITEM_ID, [noMerchantTxId]);

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data } = await sb
      .from('user_transactions')
      .select('merchant_raw, merchant_normalized, category')
      .eq('external_id', noMerchantExternalId)
      .eq('user_id', TEST_USER_ID)
      .single();

    expect(data?.merchant_raw).toBe('RESTAURANTE BOA VISTA LTDA');
    expect(data?.merchant_normalized).toBe('Restaurante Boa Vista');
    expect(data?.category).toBe('other');

    await sb.from('user_transactions').delete().eq('external_id', noMerchantExternalId);
  });

  it('Pluggy client was called with the right item/tx IDs', () => {
    expect(mockGetAccounts).toHaveBeenCalledWith(FAKE_ITEM_ID);
    expect(mockGetTransaction).toHaveBeenCalledWith(FAKE_TX_ID);
  });

  // Regression (2026-06-10): the memory dual-write selected a non-existent
  // column (transaction_emotional_context.emotion_label), so the query 42703'd,
  // the error was silently ignored, and NO transaction ever reached the memory
  // stream. This case uses a MATERIAL outflow (>= MEMORY_MIN_AMOUNT, 50 BRL) and
  // asserts the observation write actually fires — it runs the real Supabase
  // query, so a schema mismatch fails it again.
  it('writes a memory observation for a material transaction (>= 50 BRL)', async () => {
    const materialTxId = `tx-material-mem-${Date.now()}`;
    const materialExternalId = `pluggy:${materialTxId}`;

    mockGetTransaction.mockResolvedValueOnce({
      id: materialTxId,
      accountId: FAKE_ACCOUNT_ID,
      amount: -120,
      type: 'DEBIT',
      date: '2026-04-28',
      currencyCode: 'BRL',
      description: 'SUPERMERCADO PAGUE MENOS',
      merchant: { name: 'SUPERMERCADO PAGUE MENOS' },
    });

    const { ingestTransactionsByIds } = await import(
      '../../../api/services/transactions/pluggyIngestion.js'
    );
    const { addPlatformObservation } = await import(
      '../../../api/services/memoryStreamService.js'
    );
    addPlatformObservation.mockClear();

    await ingestTransactionsByIds(TEST_USER_ID, FAKE_ITEM_ID, [materialTxId]);

    // The dual-write must fire exactly once for this material outflow, with a
    // human-readable content line naming the merchant and the BRL amount.
    expect(addPlatformObservation).toHaveBeenCalledTimes(1);
    const [userArg, contentArg, platformArg] = addPlatformObservation.mock.calls[0];
    expect(userArg).toBe(TEST_USER_ID);
    expect(platformArg).toBe('pluggy');
    expect(contentArg).toContain('Supermercado Pague Menos');
    expect(contentArg).toMatch(/120/);

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await sb.from('user_transactions').delete().eq('external_id', materialExternalId);
  });
});
