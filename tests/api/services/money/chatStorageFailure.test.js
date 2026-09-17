import { expect, it, vi } from 'vitest';
vi.mock('../../../../api/services/database.js', () => {
  const query = new Proxy({}, { get: (_target, name) => name === 'then'
    ? (resolve) => Promise.resolve({ data: null, error: { message: 'offline' } }).then(resolve)
    : () => query });
  return { supabaseAdmin: { from: () => query }, serverDb: {} };
});
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }) }));
import { listChatTurns, saveChatTurn, listFacts } from '../../../../api/services/money/store.js';

it('distinguishes failed history from a new conversation', async () => {
  await expect(listChatTurns('owner')).rejects.toThrow();
});
it('does not acknowledge a conversation turn that failed to persist', async () => {
  await expect(saveChatTurn('owner', { role: 'user', text: 'This was a one-off' })).rejects.toThrow();
});
it('does not make a failed facts read look like someone has no commitments', async () => {
  await expect(listFacts('owner')).rejects.toThrow();
});
