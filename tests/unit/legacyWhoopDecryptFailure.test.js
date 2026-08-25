/**
 * An undecryptable legacy Whoop token must flip the connection to
 * needs_reauth instead of being retried on every request.
 *
 * Prod incident 2026-08-24: legacy Whoop rows in platform_connections carry
 * tokens encrypted under an old key/format. decryptToken can never succeed on
 * them, yet getLegacyWhoopContext decrypted on every context warmup, logging
 * "Token decryption error: Invalid encrypted data format" each time. The row
 * is fetched with status='connected', so marking it needs_reauth both stops
 * the retry loop and surfaces the reconnect prompt in the UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updates = [];
let connectionRow;

function makeChain(table) {
  const ctx = { op: 'select', payload: null };
  const chain = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const result =
            ctx.op === 'update'
              ? { data: null, error: null }
              : { data: connectionRow, error: connectionRow ? null : { code: 'PGRST116' } };
          const promise = Promise.resolve(result);
          return promise.then.bind(promise);
        }
        return (...args) => {
          if (prop === 'update') {
            ctx.op = 'update';
            ctx.payload = args[0];
          }
          if (prop === 'eq' && ctx.op === 'update') {
            updates.push({ table, payload: ctx.payload, column: args[0], value: args[1] });
          }
          return chain;
        };
      },
    }
  );
  return chain;
}

vi.mock('../../api/services/database.js', () => ({
  supabaseAdmin: { from: (table) => makeChain(table) },
}));
vi.mock('../../api/services/encryption.js', () => ({
  decryptToken: vi.fn(() => {
    throw new Error('Failed to decrypt token - data may be corrupted or key mismatch');
  }),
}));
const ensureFreshToken = vi.fn();
vi.mock('../../api/services/tokenRefreshService.js', () => ({
  ensureFreshToken: (...args) => ensureFreshToken(...args),
}));
vi.mock('../../api/services/lifeEventInferenceService.js', () => ({
  lifeEventInferenceService: {},
}));
vi.mock('../../api/services/nangoService.js', () => ({
  whoop: {},
  getConnection: vi.fn(),
}));

const userContextAggregator = (await import('../../api/services/userContextAggregator.js')).default;

describe('getLegacyWhoopContext with an undecryptable token', () => {
  beforeEach(() => {
    updates.length = 0;
    ensureFreshToken.mockReset();
    connectionRow = {
      id: 'conn-legacy-1',
      user_id: 'user-1',
      platform: 'whoop',
      status: 'connected',
      access_token: 'old-format-ciphertext',
      refresh_token: 'old-format-ciphertext',
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    };
  });

  it('marks the connection needs_reauth and reports needsReauth', async () => {
    const result = await userContextAggregator.getLegacyWhoopContext('user-1');

    expect(result).toEqual({ connected: false, needsReauth: true });

    const statusUpdate = updates.find(
      (u) => u.table === 'platform_connections' && u.payload?.status === 'needs_reauth'
    );
    expect(statusUpdate).toBeTruthy();
    expect(statusUpdate.column).toBe('id');
    expect(statusUpdate.value).toBe('conn-legacy-1');
  });

  it('does not attempt a token refresh on an undecryptable token', async () => {
    await userContextAggregator.getLegacyWhoopContext('user-1');
    expect(ensureFreshToken).not.toHaveBeenCalled();
  });
});
