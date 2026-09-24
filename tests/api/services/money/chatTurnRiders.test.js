/**
 * The receipts have always ridden inside the figures column; what to ask next rides with them
 * since 2026-09-24, so a reloaded conversation keeps the suggestions its last answer earned.
 * Both directions here: what is written, and what comes back out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
let respond = () => ({ data: null, error: null });
function makeChain(table) {
  const entry = { table, ops: [] };
  calls.push(entry);
  const chain = new Proxy({}, { get(_t, prop) {
    if (prop === 'then') { const pr = Promise.resolve(respond(entry)); return pr.then.bind(pr); }
    return (...args) => { entry.ops.push([prop, ...args]); return chain; };
  } });
  return chain;
}
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: { from: (t) => makeChain(t) }, serverDb: {} }));
vi.mock('../../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));
vi.mock('../../../../api/_app/services/money/twinBridge.js', () => ({ tellTwinTurn: vi.fn(async () => null), tellTwinFact: vi.fn(async () => null) }));

const { saveChatTurn, listChatTurns } = await import('../../../../api/_app/services/money/store.js');
const inserted = () => calls.find((c) => c.table === 'money_chat_turns' && c.ops.some(([op]) => op === 'insert'))?.ops.find(([op]) => op === 'insert')[1];

beforeEach(() => { calls.length = 0; });

describe('what a kept turn carries', () => {
  it('writes the suggestions beside the receipts, and the figures with them', async () => {
    respond = () => ({ data: { id: 't1', created_at: '2026-09-24T10:00:00Z' }, error: null });
    await saveChatTurn('u1', {
      role: 'twin', text: 'Groceries were 40,00 EUR.',
      figures: [{ kind: 'shares' }], receipts: [{ id: 'r1' }], next: ['And groceries last month?', 'Which place took the most?'],
    });
    expect(inserted().figures).toEqual({ figures: [{ kind: 'shares' }], receipts: [{ id: 'r1' }], next: ['And groceries last month?', 'Which place took the most?'] });
  });

  it('writes an envelope for suggestions even when nothing was drawn and nothing was read from', async () => {
    respond = () => ({ data: { id: 't2' }, error: null });
    await saveChatTurn('u1', { role: 'twin', text: 'Noted.', next: ['What changed this week?'] });
    expect(inserted().figures).toEqual({ figures: [], receipts: [], next: ['What changed this week?'] });
  });

  it('leaves a plain turn plain: no envelope, no suggestions', async () => {
    respond = () => ({ data: { id: 't3' }, error: null });
    await saveChatTurn('u1', { role: 'user', text: 'how much on groceries' });
    expect(inserted().figures).toBeNull();
  });

  it('keeps at most three, as the page shows at most two', async () => {
    respond = () => ({ data: { id: 't4' }, error: null });
    await saveChatTurn('u1', { role: 'twin', text: 'x', next: ['a', 'b', 'c', 'd'] });
    expect(inserted().figures.next).toEqual(['a', 'b', 'c']);
  });

  it('reads the suggestions back out, and answers with none for a turn kept before they existed', async () => {
    respond = () => ({ data: [
      { id: 't2', role: 'twin', text: 'newer', figures: { figures: [{ kind: 'months' }], receipts: [{ id: 'r9' }], next: ['Where did the money go?'] }, created_at: '2026-09-24T10:01:00Z' },
      { id: 't1', role: 'twin', text: 'older', figures: [{ kind: 'shares' }], created_at: '2026-09-24T10:00:00Z' },
    ], error: null });
    const turns = await listChatTurns('u1');
    expect(turns.map((t) => t.text)).toEqual(['older', 'newer']);
    expect(turns[0]).toMatchObject({ figures: [{ kind: 'shares' }], receipts: [], next: [] });
    expect(turns[1]).toMatchObject({ figures: [{ kind: 'months' }], receipts: [{ id: 'r9' }], next: ['Where did the money go?'] });
  });
});
