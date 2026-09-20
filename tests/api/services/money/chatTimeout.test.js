/** A model that did not answer in time is not a ledger that lacks the number: the chat says which, and asks the gateway for fifty seconds. */
import { describe, expect, it, vi } from 'vitest';
const complete = vi.fn();
vi.mock('../../../../api/services/llmGateway.js', () => ({ complete: (...a) => complete(...a), TIER_CHAT: 'chat' }));
vi.mock('../../../../api/services/money/store.js', async (orig) => ({ ...(await orig()), listTransactions: async () => [{ id: 't1', occurred_at: '2026-09-19T10:00:00Z', amount: -12.5, currency: 'EUR', merchant_key: 'cafe', merchant_raw: 'Cafe' }], months: async () => [], refreshRecurring: async () => [], listReadings: async () => [], listFacts: async () => [], questionsFor: async () => ({ opening: [], fromLedger: [], answered: 0 }), listPlaces: async () => [], listBankAccounts: async () => [], userLanguage: async () => 'en', categorySpend: async () => ({ groups: [] }), saveChatTurn: async () => null, listChatTurns: async () => [] }));
vi.mock('../../../../api/services/money/forecastService.js', () => ({ forecast: async () => null, months: async () => [] }));
import { answer } from '../../../../api/services/money/chat.js';

describe('when the model does not answer', () => {
  it('says the answer took too long, not that the ledger lacks it, and asked for fifty seconds', async () => {
    complete.mockRejectedValueOnce(new Error('[LLM Gateway] Request timed out after 50000ms for chat/deepseek (money-chat)'));
    const r = await answer('00000000-0000-4000-8000-000000000001', 'The Cafe payment of 12,50 is not mine, my flatmate used my card');
    expect(r.text).toBe('That took too long to answer. Ask it again.');
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ tier: 'chat', timeoutMs: 50000 }));
  });
  it('keeps the old line for any other failure', async () => {
    complete.mockRejectedValueOnce(new Error('boom'));
    const r = await answer('00000000-0000-4000-8000-000000000001', 'The Cafe payment of 12,50 is not mine');
    expect(r.text).toBe('The ledger cannot answer that from what it has.');
  });
});
