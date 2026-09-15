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
  setVerdict: vi.fn(), setPlaceCategory: vi.fn(), answerQuestion: vi.fn(), listBankAccounts: vi.fn(), userLanguage: vi.fn(),
};
/* One kind for a payment, and the real resolver decides it: the month page and the chat
   disagreed about the same euros while each had its own copy, so the mock must not hold a
   second one. Everything else the chat reads from the store is still stubbed. */
vi.mock('../../../../api/services/money/store.js', async (importOriginal) => {
  const { categoryOfPayment } = await importOriginal();
  return { ...store, categoryOfPayment, saveChatTurn: async () => null, listChatTurns: async () => [], deleteFact: async () => ({ deleted: true }) };
});

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
  /* Readings put the amounts these tests speak of into the context: since 2026-09-15 a sentence
     whose amount the ledger does not hold is dropped before it reaches the wire. */
  store.listReadings.mockResolvedValue([
    { sentence: 'You spent 422,20 EUR so far.', detail: null, verdict: null },
    { sentence: 'Taxis came to 58,65 EUR: Cabify 24,65 EUR, Bolt 16,60 EUR.', detail: null, verdict: null },
    { sentence: 'Rent is 200,00 EUR a month.', detail: null, verdict: null },
  ]);
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

  it('reveals plain prose as it is written, because the model often answers that way', () => {
    const r = textStreamer();
    let seen = '';
    for (const piece of ['Clothing was ', 'the biggest, at 116,76 EUR.']) seen += r.push(piece);
    expect(seen).toBe('Clothing was the biggest, at 116,76 EUR.');
    expect(r.started).toBe(true);
  });

  it('cleans prose the way the finished answer cleans it', () => {
    const r = textStreamer();
    let seen = '';
    for (const piece of ['  **Clothing**', ' was\n\n  bigg', 'est.']) seen += r.push(piece);
    expect(seen).toBe('Clothing was biggest.');
  });

  it('keeps a fenced object to itself, and reveals only its text', () => {
    const r = textStreamer();
    let seen = '';
    for (const piece of ['```json\n{"text":"Clothing ', 'took 116,76 EUR."}\n```']) seen += r.push(piece);
    expect(seen).toBe('Clothing took 116,76 EUR.');
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

  it('sends the words as they come when nothing said before could be repeated', async () => {
    streamCall.mockImplementation(streamsIn([
      '{"text":"Clothing took 116,76 EUR. ', 'Groceries were next.","figures":[],"actions":[]}',
    ]));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
    expect(events.filter((e) => e.phase === 'text').length).toBeGreaterThan(1);
    expect(textOf(events)).toBe('Clothing took 116,76 €. Groceries were next.');
  });

  it('holds the words back while they could still finish as a sentence already said', async () => {
    /* A sentence that repeats the last turn is dropped, and a word on the screen cannot be
       taken back, so nothing of it may be shown while it could still turn out to be that
       sentence. */
    streamCall.mockImplementation(streamsIn([
      '{"text":"Clothing took ', '116,76 EUR. ', 'Groceries were next.","figures":[],"actions":[]}',
    ]));
    const { events, onEvent } = recorder();
    const history = [{ role: 'twin', text: 'Clothing took 116,76 €.' }];
    await answerStream('u1', 'and now?', history, { now: NOW, onEvent });
    expect(textOf(events)).toBe('Groceries were next.');
  });

  it('lets the words flow the moment the answer parts company with the last turn', async () => {
    streamCall.mockImplementation(streamsIn([
      '{"text":"Clothing took ', '48,88 EUR at Simply ', 'Alcala this time.","figures":[],"actions":[]}',
    ]));
    const { events, onEvent } = recorder();
    const history = [{ role: 'twin', text: 'Clothing took 116,76 €.' }];
    await answerStream('u1', 'and in August?', history, { now: NOW, onEvent });
    expect(events.filter((e) => e.phase === 'text').length).toBeGreaterThan(1);
    expect(textOf(events)).toBe('Clothing took 48,88 € at Simply Alcala this time.');
  });

  it('never shows a number before the euro sign that follows it has arrived', async () => {
    streamCall.mockImplementation(streamsIn(['{"text":"You spent 422,20 ', 'EUR', ' so far.","figures":[],"actions":[]}']));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'how much?', [], { now: NOW, onEvent });
    for (const e of events.filter((x) => x.phase === 'text')) expect(e.delta).not.toMatch(/EUR/);
    expect(textOf(events)).toBe('You spent 422,20 € so far.');
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

  it('grows a plain prose answer on the screen instead of holding it to the end', async () => {
    /* The model drops the object as soon as there are a few turns behind the question, and
       an answer that only appears when it is finished is the whole thing this route exists
       to stop. */
    streamCall.mockImplementation(streamsIn([
      'Your taxis came to 58,65 EUR. ', 'Cabify took 24,65 EUR. ', 'Bolt took 16,60 EUR.',
    ]));
    const { events, onEvent } = recorder();
    const history = [{ role: 'twin', text: 'Nothing to do with this.' }];
    const reply = await answerStream('u1', 'and the taxis?', history, { now: NOW, onEvent });
    expect(events.filter((e) => e.phase === 'text').length).toBeGreaterThan(1);
    expect(textOf(events)).toBe('Your taxis came to 58,65 €. Cabify took 24,65 €. Bolt took 16,60 €.');
    expect(reply.text).toBe(textOf(events));
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

  it('asks again without reasoning when the reasoning outlives its patience with no word said', async () => {
    process.env.MONEY_CHAT_REASONING_PATIENCE_MS = '30';
    try {
      streamCall.mockImplementation(async ({ reasoning, signal, onReasoning, onChunk }) => {
        if (reasoning) {
          onReasoning('Let me look at the clothing rows.');
          /* The model keeps thinking; the stream ends only when the caller's signal fires. */
          await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        }
        onChunk('Clothing took 116,76 EUR.');
        return { content: 'Clothing took 116,76 EUR.' };
      });
      const { events, onEvent } = recorder();
      const reply = await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
      expect(streamCall).toHaveBeenCalledTimes(2);
      expect(streamCall.mock.calls[0][0].reasoning).toEqual({ effort: 'low' });
      expect(streamCall.mock.calls[1][0].reasoning).toBeUndefined();
      expect(streamCall.mock.calls[1][0].maxTokens).toBe(600);
      expect(events.find((e) => e.phase === 'thinking').delta).toBe('Let me look at the clothing rows.');
      expect(textOf(events)).toBe('Clothing took 116,76 €.');
      expect(phases(events).at(-1)).toBe('done');
      expect(reply.text).toBe(textOf(events));
    } finally {
      delete process.env.MONEY_CHAT_REASONING_PATIENCE_MS;
    }
  });

  it('does not ask again when a word had already come; a stream that breaks then keeps what was read', async () => {
    process.env.MONEY_CHAT_REASONING_PATIENCE_MS = '30';
    try {
      streamCall.mockImplementation(async ({ onChunk }) => {
        onChunk('Clothing took 116,76 EUR. ');
        await new Promise((r) => setTimeout(r, 60));
        throw new Error('connection reset');
      });
      const { events, onEvent } = recorder();
      await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
      expect(streamCall).toHaveBeenCalledTimes(1);
      expect(textOf(events)).toBe('Clothing took 116,76 €.');
    } finally {
      delete process.env.MONEY_CHAT_REASONING_PATIENCE_MS;
    }
  });

  it('a stream that broke after letting out only a brace is a failure, not an answer of one brace', async () => {
    streamCall.mockImplementation(async ({ onChunk }) => {
      onChunk('{ "');
      throw new Error('connection reset');
    });
    const { events, onEvent } = recorder();
    const reply = await answerStream('u1', 'what was biggest?', [], { now: NOW, onEvent });
    expect(reply).toBe(null);
    expect(textOf(events).trim()).not.toMatch(/[a-z0-9]/i);
    expect(events.find((e) => e.phase === 'failed').detail).toBe('That could not be read right now.');
  });

  it('a sentence with an amount the ledger does not hold never reaches the wire', async () => {
    streamCall.mockImplementation(streamsIn(['Clothing took 116,76 EUR. ', 'That leaves 283,51 EUR for the rest of the month. ', 'Spotify is 11,99 EUR a month.']));
    const { events, onEvent } = recorder();
    const reply = await answerStream('u1', 'how much on clothes?', [], { now: NOW, onEvent });
    expect(textOf(events)).toBe('Clothing took 116,76 \u20ac. Spotify is 11,99 \u20ac a month.');
    expect(reply.text).toBe(textOf(events));
  });

  it('a reply that stood only on invented sums says so once', async () => {
    streamCall.mockImplementation(streamsIn(['That leaves 283,51 EUR. ', 'About 30,58 EUR a day.']));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'how much can I spend?', [], { now: NOW, onEvent });
    expect(textOf(events)).toBe('The ledger has no total for that; it can only name the parts it holds.');
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

  it('sends only the seven named fields, never a row or an id of its own', async () => {
    streamCall.mockImplementation(streamsIn(['{"text":"Clothing took 116,76 EUR.","figures":[{"kind":"months"}],"actions":[],"cites":["t1"]}']));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'where did september go?', [], { now: NOW, onEvent });
    /* basis: the context lines the answer stood on, computed, so the person can see how it got there. */
    const allowed = new Set(['phase', 'delta', 'figures', 'actions', 'receipts', 'detail', 'basis']);
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

describe('prose and then the object', () => {
  it('shows the prose and never the brace, and still takes the offers from the object', async () => {
    streamCall.mockImplementation(streamsIn(['I see the 200,00 EUR is your rent. If that is right, mark it below. ', '{"text":"I see the 200,00 EUR is your rent. If that is right, mark it below.","figures":[],"actions":[]}']));
    const { events, onEvent } = recorder();
    await answerStream('u1', 'the 200 to maria is my rent', [], { now: NOW, onEvent });
    const text = textOf(events);
    expect(text).toContain('your rent');
    expect(text).not.toContain('{');
    expect(text).not.toContain('"text"');
    expect(phases(events).at(-1)).toBe('done');
  });
});
