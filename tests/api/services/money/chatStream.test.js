/**
 * The streamed answer says the same things in the same order, only sooner. These tests hold
 * the contract the app depends on: prose before figures, a sentence never taken back, and a
 * gateway that cannot stream still producing one text event and the figures after it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const complete = vi.fn();
const streamCall = vi.fn();
vi.mock('../../../../api/services/llmGateway.js', () => ({
  complete: (...a) => complete(...a),
  stream: (...a) => streamCall(...a),
  TIER_CHAT: 'chat',
}));
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {} }) }));

const store = {
  listTransactions: vi.fn(), months: vi.fn(), forecast: vi.fn(), categorySpend: vi.fn(), refreshRecurring: vi.fn(),
  listReadings: vi.fn(), listFacts: vi.fn(), questionsFor: vi.fn(), listPlaces: vi.fn(),
  setVerdict: vi.fn(), setPlaceCategory: vi.fn(), answerQuestion: vi.fn(),
};
vi.mock('../../../../api/services/money/store.js', () => store);

const { answerStream, textStreamer, completeSentences } = await import('../../../../api/services/money/chat.js');

const NOW = new Date('2026-09-08T12:00:00Z');
const t = (id, occurred_at, amount, merchant_key, merchant_raw, extra = {}) => ({ id, occurred_at, amount, merchant_key, merchant_raw, channel: 'card', currency: 'EUR', ...extra });

const transactions = [
  t('t1', '2026-09-07T10:00:00Z', -116.76, 'el corte ingles', 'El Corte Ingles'),
  t('t2', '2026-09-04T09:00:00Z', -11.99, 'spotify', 'Spotify', { is_recurring: true }),
  t('t3', '2026-08-04T09:00:00Z', -11.99, 'spotify', 'Spotify', { is_recurring: true }),
  t('t4', '2026-07-04T09:00:00Z', -11.99, 'spotify', 'Spotify', { is_recurring: true }),
  t('t5', '2026-08-20T13:00:00Z', -48.88, 'simply alcala', 'Simply Alcala'),
];
const segments = [
  { month: '2026-09-01', spent: 128.75, received: 0, lines: 2, biggest: { id: 't1', merchant: 'El Corte Ingles', amount: 116.76 }, days_covered: 8 },
  { month: '2026-08-01', spent: 60.87, received: 0, lines: 2, biggest: { id: 't5', merchant: 'Simply Alcala', amount: 48.88 }, days_covered: 31 },
];
const cast = { month: '2026-09-01', spent: 128.75, committed: 11.99, received: 0, days_left: 22, projected_p10: 250, projected_p50: 320.5, projected_p90: 410 };
const recurring = [{ merchant_key: 'spotify', merchant_name: 'Spotify', cadence: 'monthly', typical_amount: 11.99, next_expected: '2026-10-04', charges: [{ id: 't2' }, { id: 't3' }, { id: 't4' }] }];
const places = [
  { merchant_key: 'el corte ingles', name: 'El Corte Ingles', category: 'clothing' },
  { merchant_key: 'spotify', name: 'Spotify', category: 'software' },
  { merchant_key: 'simply alcala', name: 'Simply Alcala', category: 'groceries' },
];
const questions = { opening: [], fromLedger: [], answered: 0 };
const categories = { month: '2026-09-01', total: 128.75, read: 128.75, groups: [{ category: 'clothing', spent: 116.76, share: 91 }, { category: 'software', spent: 11.99, share: 9 }] };

/** Collect every event the service sends, in order. */
function recorder() {
  const events = [];
  return { events, onEvent: (e) => events.push(e) };
}
const phases = (events) => events.map((e) => e.phase);
const textOf = (events) => events.filter((e) => e.phase === 'text').map((e) => e.delta).join('');

/** A gateway that hands its content over in the pieces given, as a real stream would. */
const streamsIn = (pieces) => async ({ onChunk }) => {
  for (const piece of pieces) if (onChunk) onChunk(piece);
  return { content: pieces.join('') };
};

beforeEach(() => {
  complete.mockReset();
  streamCall.mockReset();
  for (const fn of Object.values(store)) fn.mockReset();
  store.listTransactions.mockResolvedValue(transactions);
  store.months.mockResolvedValue(segments);
  store.forecast.mockResolvedValue(cast);
  store.categorySpend.mockResolvedValue(categories);
  store.refreshRecurring.mockResolvedValue(recurring);
  store.listReadings.mockResolvedValue([]);
  store.listFacts.mockResolvedValue([]);
  store.questionsFor.mockResolvedValue(questions);
  store.listPlaces.mockResolvedValue(places);
});

describe('reading the text field out of a JSON object as it arrives', () => {
  it('reveals the prose and nothing of the wrapper', () => {
    const r = textStreamer();
    let seen = '';
    for (const piece of ['{"te', 'xt":"Cloth', 'ing took 116,76 EUR.', '","figures":[]}']) seen += r.push(piece);
    expect(seen).toBe('Clothing took 116,76 EUR.');
    expect(r.done).toBe(true);
  });

  it('holds an escape that a chunk cut in half', () => {
    const r = textStreamer();
    let seen = '';
    for (const piece of ['{"text":"He said \\', '"yes\\", then \\', 'u20ac12.', '"}']) seen += r.push(piece);
    expect(seen).toBe('He said "yes", then €12.');
  });

  it('reveals nothing at all when the model did not answer with an object', () => {
    const r = textStreamer();
    const seen = r.push('Clothing was the biggest, at 116,76 EUR.');
    expect(seen).toBe('');
    expect(r.started).toBe(false);
  });

  it('separates finished sentences from the one still being written', () => {
    expect(completeSentences('One. Two! Thr')).toEqual([['One.', 'Two!'], 'Thr']);
    expect(completeSentences('Nothing finished yet')).toEqual([[], 'Nothing finished yet']);
  });
});

describe('the streamed answer', () => {
  it('says it is reading before it does anything, and ends with done', async () => {
    streamCall.mockImplementation(streamsIn(['{"text":"Clothing took 116,76 EUR.","figures":[],"actions":[]}']));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
    expect(phases(events)[0]).toBe('reading');
    expect(phases(events).at(-1)).toBe('done');
    expect(phases(events)).not.toContain('failed');
  });

  it('never sends a figure before the text is complete', async () => {
    streamCall.mockImplementation(streamsIn([
      '{"text":"Clothing took 116,76 EUR. ', 'Groceries were next. ', 'That is September.","figures":[{"kind":"shares","month":"2026-09"}],"actions":[]}',
    ]));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'where did september go?', [], { now: NOW, onEvent });
    const order = phases(events);
    expect(order.lastIndexOf('text')).toBeLessThan(order.indexOf('figures'));
    expect(order.indexOf('figures')).toBeLessThan(order.indexOf('actions'));
    expect(events.find((e) => e.phase === 'figures').figures[0].kind).toBe('shares');
  });

  it('sends the prose a sentence at a time as it is written', async () => {
    streamCall.mockImplementation(streamsIn([
      '{"text":"Clothing took 116,76 EUR. ', 'Groceries were next.","figures":[],"actions":[]}',
    ]));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
    const deltas = events.filter((e) => e.phase === 'text');
    expect(deltas.length).toBe(2);
    expect(textOf(events)).toBe('Clothing took 116,76 €. Groceries were next.');
  });

  it('writes amounts with the euro sign, as the finished answer does', async () => {
    streamCall.mockImplementation(streamsIn(['{"text":"You spent 128,75 EUR.","figures":[],"actions":[]}']));
    const { events, onEvent } = recorder();
    const reply = await answerStream('u1', 'how much?', [], { now: NOW, onEvent });
    expect(textOf(events)).toBe('You spent 128,75 €.');
    expect(reply.text).toBe('You spent 128,75 €.');
  });

  it('drops a sentence it already said, and keeps the new one', async () => {
    streamCall.mockImplementation(streamsIn([
      '{"text":"Clothing took 116,76 EUR. ', 'Groceries were next.","figures":[],"actions":[]}',
    ]));
    const { events, onEvent } = recorder();
    const history = [{ role: 'user', text: 'and before?' }, { role: 'twin', text: 'Clothing took 116,76 €.' }];
    const reply = await answerStream('u1', 'and now?', history, { now: NOW, onEvent });
    expect(textOf(events)).toBe('Groceries were next.');
    expect(reply.text).toBe('Groceries were next.');
  });

  it('answers with something rather than silence when every sentence was already said', async () => {
    streamCall.mockImplementation(streamsIn(['{"text":"Clothing took 116,76 EUR.","figures":[],"actions":[]}']));
    const { events, onEvent } = recorder();
    const history = [{ role: 'twin', text: 'Clothing took 116,76 €.' }];
    const reply = await answerStream('u1', 'again?', history, { now: NOW, onEvent });
    expect(textOf(events).length).toBeGreaterThan(0);
    expect(reply.text.length).toBeGreaterThan(0);
    expect(phases(events).at(-1)).toBe('done');
  });

  it('still sends one text event and the figures when the gateway cannot stream', async () => {
    /* A gateway with no streaming path calls onChunk never and returns the whole content. */
    streamCall.mockResolvedValue({ content: '{"text":"Clothing took 116,76 EUR.","figures":[{"kind":"months"}],"actions":[]}' });
    const { events, onEvent } = recorder();
    await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
    const deltas = events.filter((e) => e.phase === 'text');
    expect(deltas.length).toBe(1);
    expect(deltas[0].delta).toBe('Clothing took 116,76 €.');
    expect(events.find((e) => e.phase === 'figures').figures[0].kind).toBe('months');
    expect(phases(events).at(-1)).toBe('done');
  });

  it('sends the prose plainly when the model did not answer with an object', async () => {
    streamCall.mockImplementation(streamsIn(['**Clothing** was the biggest, at 116,76 EUR.']));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
    expect(textOf(events)).toBe('Clothing was the biggest, at 116,76 €.');
    expect(phases(events).at(-1)).toBe('done');
  });

  it('fails in one plain sentence when the model could not be reached, and says nothing of why', async () => {
    streamCall.mockRejectedValue(new Error('OpenRouter 502 at https://api.example/v1/x?account=uid-9'));
    const { events, onEvent } = recorder();
    const reply = await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
    expect(reply).toBe(null);
    const failed = events.find((e) => e.phase === 'failed');
    expect(failed.detail).toBe('That could not be read right now.');
    expect(JSON.stringify(events)).not.toMatch(/uid-9|OpenRouter|502/);
    expect(phases(events)).not.toContain('done');
  });

  it('keeps what the person already read when the stream breaks midway', async () => {
    streamCall.mockImplementation(async ({ onChunk }) => {
      onChunk('{"text":"Clothing took 116,76 EUR. ');
      throw new Error('connection reset');
    });
    const { events, onEvent } = recorder();
    const reply = await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
    expect(textOf(events)).toBe('Clothing took 116,76 €.');
    expect(phases(events).at(-1)).toBe('done');
    expect(reply.figures).toEqual([]);
  });

  it('sends only the six named fields, never a row or an id of its own', async () => {
    streamCall.mockImplementation(streamsIn(['{"text":"Clothing took 116,76 EUR.","figures":[{"kind":"months"}],"actions":[],"cites":["t1"]}']));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'where did september go?', [], { now: NOW, onEvent });
    const allowed = new Set(['phase', 'delta', 'figures', 'actions', 'receipts', 'detail']);
    for (const e of events) for (const key of Object.keys(e)) expect(allowed.has(key)).toBe(true);
  });

  it('answers an empty ledger without calling the model at all', async () => {
    store.listTransactions.mockResolvedValue([]);
    const { events, onEvent } = recorder();
    await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
    expect(streamCall).not.toHaveBeenCalled();
    expect(textOf(events)).toMatch(/nothing in the ledger yet/i);
    expect(phases(events).at(-1)).toBe('done');
  });

  it('answers the asks that need no model without calling it', async () => {
    const { events, onEvent } = recorder();
    await answerStream('u1', 'what comes back every month?', [], { now: NOW, onEvent });
    expect(streamCall).not.toHaveBeenCalled();
    expect(textOf(events)).toMatch(/Spotify|comes back/i);
    expect(events.find((e) => e.phase === 'figures').figures[0].kind).toBe('recurring');
    expect(phases(events).at(-1)).toBe('done');
  });
});
