/**
 * The chat phrases; it never computes. These tests hand the pure half real rows and check
 * that nothing the model asks for can put a number on the screen that the ledger did not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const complete = vi.fn();
vi.mock('../../../../api/services/llmGateway.js', () => ({ complete: (...a) => complete(...a), TIER_CHAT: 'chat' }));
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {} }) }));

const store = {
  listTransactions: vi.fn(), months: vi.fn(), forecast: vi.fn(), categorySpend: vi.fn(), refreshRecurring: vi.fn(),
  listReadings: vi.fn(), listFacts: vi.fn(), questionsFor: vi.fn(), listPlaces: vi.fn(),
  setVerdict: vi.fn(), setPlaceCategory: vi.fn(), answerQuestion: vi.fn(),
};
vi.mock('../../../../api/services/money/store.js', () => store);

const {
  assemble, buildFigure, validateAction, receiptsFor, parseReply, shortCircuit, assembleReply, contextText, euroGlyphs, answer, act, FIGURE_KINDS, RULES, asksWhereItWent,
} = await import('../../../../api/services/money/chat.js');

const NOW = new Date('2026-09-08T12:00:00Z');
const t = (id, occurred_at, amount, merchant_key, merchant_raw, extra = {}) => ({ id, occurred_at, amount, merchant_key, merchant_raw, channel: 'card', currency: 'EUR', ...extra });

const transactions = [
  t('t1', '2026-09-07T10:00:00Z', -116.76, 'el corte ingles', 'El Corte Ingles'),
  t('t2', '2026-09-04T09:00:00Z', -11.99, 'spotify', 'Spotify', { is_recurring: true }),
  t('t3', '2026-08-04T09:00:00Z', -11.99, 'spotify', 'Spotify', { is_recurring: true }),
  t('t4', '2026-07-04T09:00:00Z', -11.99, 'spotify', 'Spotify', { is_recurring: true }),
  t('t5', '2026-08-20T13:00:00Z', -48.88, 'simply alcala', 'Simply Alcala'),
  t('t6', '2026-09-05T13:00:00Z', -9.5, 'oakberry acai', 'Oakberry Acai'),
  t('t7', '2026-09-02T13:00:00Z', 15.15, 'bizum in', 'Bizum from Ana', { channel: 'bizum' }),
  t('t8', '2026-08-11T13:00:00Z', -4.25, 'we taxi', 'We Taxi'),
];
/* As monthSegments emits them: the biggest payment is a summary, not the row. */
const segments = [
  { month: '2026-09-01', spent: 138.25, received: 15.15, lines: 4, biggest: { id: 't1', merchant: 'El Corte Ingles', amount: 116.76 }, days_covered: 8 },
  { month: '2026-08-01', spent: 65.12, received: 0, lines: 3, biggest: { id: 't5', merchant: 'Simply Alcala', amount: 48.88 }, days_covered: 31 },
  { month: '2026-07-01', spent: 11.99, received: 0, lines: 1, biggest: { id: 'gone', merchant: 'Spotify', amount: 11.99 }, days_covered: 31 },
];
const cast = { month: '2026-09-01', spent: 138.25, committed: 11.99, received: 15.15, days_left: 22, projected_p10: 250, projected_p50: 320.5, projected_p90: 410 };
const recurring = [{ merchant_key: 'spotify', merchant_name: 'Spotify', cadence: 'monthly', typical_amount: 11.99, next_expected: '2026-10-04', charges: [{ id: 't2' }, { id: 't3' }, { id: 't4' }] }];
const places = [
  { merchant_key: 'el corte ingles', name: 'El Corte Ingles', category: 'clothing' },
  { merchant_key: 'spotify', name: 'Spotify', category: 'software' },
  { merchant_key: 'simply alcala', name: 'Simply Alcala', category: 'groceries' },
  { merchant_key: 'oakberry acai', name: 'Oakberry Acai', category: null },
  { merchant_key: 'we taxi', name: 'We Taxi', category: 'taxi' },
];
const questions = { opening: [{ id: 'home_area', kind: 'home_area', ask: 'Which part of town do you live in?', input: 'text' }], fromLedger: [], answered: 0 };
const categories = { month: '2026-09-01', total: 138.25, read: 128.75, groups: [{ category: 'clothing', spent: 116.76, share: 84 }, { category: 'software', spent: 11.99, share: 9 }] };

const ctx = () => assemble({ transactions, segments, forecast: cast, recurring, readings: [], facts: [], questions, places, categories, now: NOW });

beforeEach(() => {
  complete.mockReset();
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
  store.setVerdict.mockResolvedValue({});
  store.setPlaceCategory.mockResolvedValue({});
  store.answerQuestion.mockResolvedValue({});
});

describe('buildFigure', () => {
  it('drops a kind that is not in the catalogue', () => {
    expect(buildFigure({ kind: 'pie' }, ctx())).toBe(null);
    expect(buildFigure(null, ctx())).toBe(null);
    expect(FIGURE_KINDS).toEqual(['months', 'shares', 'weekdays', 'recurring', 'band', 'history']);
  });

  it('draws the months from the segments, oldest first, with this month marked', () => {
    const { figure } = buildFigure({ kind: 'months' }, ctx());
    expect(figure.points).toEqual([
      { label: 'Jul', value: 11.99 },
      { label: 'Aug', value: 65.12 },
      { label: 'Sep', value: 138.25, current: true },
    ]);
  });

  it('months receipts are the full rows behind each biggest payment, never a summary', () => {
    const built = buildFigure({ kind: 'months' }, ctx());
    const receipts = receiptsFor([built], ctx());
    expect(receipts).toEqual([
      { id: 't1', occurred_at: '2026-09-07T10:00:00Z', merchant: 'El Corte Ingles', amount: 116.76 },
      { id: 't5', occurred_at: '2026-08-20T13:00:00Z', merchant: 'Simply Alcala', amount: 48.88 },
    ]);
    expect(receipts.every((r) => r.merchant && r.occurred_at)).toBe(true);
  });

  it('shares sum the ledger rows of the month and never exceed one', () => {
    const { figure, rows } = buildFigure({ kind: 'shares', month: '2026-09' }, ctx());
    const total = figure.items.reduce((s, i) => s + i.value, 0);
    expect(total).toBeCloseTo(138.25, 2);
    expect(figure.items[0]).toEqual({ label: 'clothing', value: 116.76, share: 0.845 });
    expect(figure.items.find((i) => i.label === 'not read yet').value).toBe(9.5);
    expect(figure.items.every((i) => i.share > 0 && i.share <= 1)).toBe(true);
    expect(rows.map((r) => r.id)).toContain('t1');
  });

  it('shares by merchant name the places, not the keys', () => {
    const { figure } = buildFigure({ kind: 'shares', month: 'sep', by: 'merchant' }, ctx());
    expect(figure.items.map((i) => i.label)).toEqual(['El Corte Ingles', 'Spotify', 'Oakberry Acai']);
  });

  it('history follows one merchant in time and stands on those rows', () => {
    const { figure, rows } = buildFigure({ kind: 'history', merchant: 'spotify' }, ctx());
    expect(figure.merchant).toBe('Spotify');
    expect(figure.points).toEqual([{ label: '4 Jul', value: 11.99 }, { label: '4 Aug', value: 11.99 }, { label: '4 Sep', value: 11.99 }]);
    expect(rows.map((r) => r.id)).toEqual(['t2', 't3', 't4']);
  });

  it('history says nothing for a merchant the ledger has not seen twice', () => {
    expect(buildFigure({ kind: 'history', merchant: 'netflix' }, ctx())).toBe(null);
    expect(buildFigure({ kind: 'history', merchant: 'oakberry' }, ctx())).toBe(null);
  });

  it('band carries spent, likely, low and high from the forecast', () => {
    const { figure } = buildFigure({ kind: 'band' }, ctx());
    expect(figure).toMatchObject({ kind: 'band', month: '2026-09-01', spent: 138.25, likely: 320.5, low: 250, high: 410 });
  });

  it('band stays silent when the projection has no spread', () => {
    const c = assemble({ transactions, segments, forecast: { ...cast, projected_p10: 300, projected_p50: 300, projected_p90: 300.2 }, recurring, places, now: NOW });
    expect(buildFigure({ kind: 'band' }, c)).toBe(null);
  });

  it('recurring lists what comes back with its next date', () => {
    const { figure, rows } = buildFigure({ kind: 'recurring' }, ctx());
    expect(figure.items).toEqual([{ label: 'Spotify', amount: 11.99, cadence: 'monthly', next: '2026-10-04' }]);
    expect(rows.map((r) => r.id).sort()).toEqual(['t2', 't3', 't4']);
  });

  it('weekdays needs enough payments to be worth drawing', () => {
    expect(buildFigure({ kind: 'weekdays' }, ctx())).toBe(null);
    const many = Array.from({ length: 20 }, (_, i) => t(`w${i}`, `2026-08-${String(1 + i).padStart(2, '0')}T12:00:00Z`, -10, 'cafe', 'Cafe'));
    const { figure } = buildFigure({ kind: 'weekdays' }, assemble({ transactions: many, places: [], now: NOW }));
    expect(figure.points.map((p) => p.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(figure.points.reduce((s, p) => s + p.value, 0)).toBe(200);
  });
});

describe('validateAction', () => {
  it('drops an action whose id is not in the ledger', () => {
    expect(validateAction({ kind: 'not_me', transaction_id: 'nope' }, ctx())).toBe(null);
    expect(validateAction({ kind: 'recategorise', merchant_key: 'nope', category: 'coffee' }, ctx())).toBe(null);
    expect(validateAction({ kind: 'recategorise', merchant_key: 'spotify', category: 'fun' }, ctx())).toBe(null);
    expect(validateAction({ kind: 'answer', question_id: 'nope', value: 'Chamberi' }, ctx())).toBe(null);
    expect(validateAction({ kind: 'delete_everything' }, ctx())).toBe(null);
  });

  it('keeps a real one and gives it a label if the model gave none', () => {
    expect(validateAction({ kind: 'not_me', transaction_id: 't1' }, ctx())).toEqual({ kind: 'not_me', transaction_id: 't1', label: 'Not mine: El Corte Ingles, 116,76 EUR' });
    expect(validateAction({ kind: 'recategorise', merchant_key: 'oakberry acai', category: 'Coffee', label: 'Oakberry is a cafe' }, ctx()))
      .toEqual({ kind: 'recategorise', merchant_key: 'oakberry acai', category: 'coffee', label: 'Oakberry is a cafe' });
    expect(validateAction({ kind: 'answer', question_id: 'home_area', value: 'Chamberi' }, ctx()))
      .toEqual({ kind: 'answer', question_id: 'home_area', value: 'Chamberi', label: 'Record: Chamberi' });
  });
});

describe('receiptsFor', () => {
  it('takes the figures\' own rows and real cited ids, once each, capped', () => {
    const built = [buildFigure({ kind: 'history', merchant: 'spotify' }, ctx())];
    const receipts = receiptsFor(built, ctx(), ['t1', 'ghost', 't2']);
    expect(receipts.map((r) => r.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(receipts[0]).toEqual({ id: 't1', occurred_at: '2026-09-07T10:00:00Z', merchant: 'El Corte Ingles', amount: 116.76 });
  });
});

describe('parseReply', () => {
  it('reads a JSON object even when it is fenced or wrapped in prose', () => {
    const p = parseReply('Here you go:\n```json\n{"text":"You spent 138,25 EUR.","figures":[{"kind":"months"}],"actions":[],"cites":["t1"]}\n```');
    expect(p).toEqual({ text: 'You spent 138,25 EUR.', figures: [{ kind: 'months' }], actions: [], cites: ['t1'] });
  });

  it('returns null for prose and for JSON without a text', () => {
    expect(parseReply('You spent a lot this month.')).toBe(null);
    expect(parseReply('{"figures":[]}')).toBe(null);
    expect(parseReply(42)).toBe(null);
  });
});

describe('assembleReply', () => {
  it('computes the figures the model named and drops the ones it cannot draw', () => {
    const reply = assembleReply({ text: 'Spotify is 11,99 EUR a month.', figures: [{ kind: 'history', merchant: 'spotify' }, { kind: 'pie' }, { kind: 'history', merchant: 'netflix' }], actions: [{ kind: 'not_me', transaction_id: 'ghost' }], cites: [] }, ctx());
    expect(reply.text).toBe('Spotify is 11,99 € a month.');
    expect(reply.figures.map((f) => f.kind)).toEqual(['history']);
    expect(reply.actions).toEqual([]);
    expect(reply.receipts.map((r) => r.id)).toEqual(['t2', 't3', 't4']);
  });

  it('never shows more than two figures', () => {
    const reply = assembleReply({ text: 'x', figures: [{ kind: 'months' }, { kind: 'band' }, { kind: 'recurring' }], actions: [] }, ctx());
    expect(reply.figures).toHaveLength(2);
  });
});

describe('where the money went', () => {
  it('recognises the question in its usual forms', () => {
    expect(asksWhereItWent('Where did my money go this month?')).toBe(true);
    expect(asksWhereItWent('what did I spend on food')).toBe(true);
    expect(asksWhereItWent('give me a breakdown by category')).toBe(true);
    expect(asksWhereItWent('how much is spotify?')).toBe(false);
  });

  it('attaches shares by category when the model returned none', () => {
    const reply = assembleReply({ text: 'Mostly clothing.', figures: [], actions: [] }, ctx(), 'Where did my money go this month?');
    expect(reply.figures.map((f) => f.kind)).toEqual(['shares']);
    expect(reply.figures[0].items[0].label).toBe('clothing');
  });

  it('keeps the model\'s own shares figure when it returned one', () => {
    const reply = assembleReply({ text: 'By place.', figures: [{ kind: 'shares', by: 'merchant' }], actions: [] }, ctx(), 'where did it go?');
    expect(reply.figures).toHaveLength(1);
    expect(reply.figures[0].items[0].label).toBe('El Corte Ingles');
  });

  it('reads the month the question names', () => {
    const reply = assembleReply({ text: 'x', figures: [], actions: [] }, ctx(), 'what did I spend on in august?');
    expect(reply.figures[0].title).toBe('Where Aug went');
    const last = assembleReply({ text: 'x', figures: [], actions: [] }, ctx(), 'where did my money go last month?');
    expect(last.figures[0].title).toBe('Where Aug went');
  });
});

describe('the rules', () => {
  it('tell the model an action is an offer, never something done', () => {
    expect(RULES).toMatch(/Actions are offers the person taps, never things you did/);
    expect(RULES).toMatch(/must not claim to have changed, marked or recorded anything/);
  });
});

describe('shortCircuit', () => {
  it('answers what comes back without a model', () => {
    const r = shortCircuit('what subscriptions do I have?', ctx());
    expect(r.text).toBe('1 charge comes back every month, 11,99 € together: Spotify.');
    expect(r.figures[0].kind).toBe('recurring');
    expect(r.receipts).toHaveLength(3);
  });

  it('answers the months side by side without a model', () => {
    const r = shortCircuit('show me my spending per month', ctx());
    expect(r.text).toBe('Sep is at 138,25 € so far. Aug closed at 65,12 €.');
    expect(r.figures[0].kind).toBe('months');
  });

  it('leaves a correction about a subscription to the model', () => {
    expect(shortCircuit('that spotify subscription is not mine', ctx())).toBe(null);
    expect(shortCircuit('how much did I spend on food?', ctx())).toBe(null);
  });
});

describe('contextText', () => {
  it('is ASCII and carries every number the model may say', () => {
    const text = contextText(ctx());
    expect(/[^\x00-\x7f]/.test(text)).toBe(false);
    expect(text).toContain('spent 138,25 EUR so far, 22 days left');
    expect(text).toContain('Sep 138,25 EUR / 15,15 EUR / 4');
    expect(text).toContain('Spotify 11,99 EUR monthly, next around 4 Oct');
    expect(text).toContain('home_area: Which part of town do you live in?');
    expect(text).toContain('t1 7 Sep El Corte Ingles -116,76 EUR clothing');
  });
});

describe('euroGlyphs', () => {
  it('turns the prompt spelling into the glyph the app uses', () => {
    expect(euroGlyphs('It was 12,50 EUR and then 3 EUR more. EURO zone.')).toBe('It was 12,50 € and then 3 € more. EURO zone.');
  });
});

describe('answer', () => {
  it('says the ledger is empty rather than asking a model about nothing', async () => {
    store.listTransactions.mockResolvedValue([]);
    const r = await answer('u1', 'how am I doing?', [], { now: NOW });
    expect(r.text).toMatch(/nothing in the ledger yet/);
    expect(complete).not.toHaveBeenCalled();
  });

  it('phrases through the gateway with the context as system prompt and history as turns', async () => {
    complete.mockResolvedValue({ content: '{"text":"Clothing took 116,76 EUR of 138,25 EUR.","figures":[{"kind":"shares","month":"2026-09"}],"actions":[],"cites":["t1"]}' });
    const r = await answer('u1', 'where did september go?', [{ role: 'user', text: 'hi' }, { role: 'twin', text: 'Hello.' }], { now: NOW });
    expect(complete).toHaveBeenCalledTimes(1);
    const call = complete.mock.calls[0][0];
    expect(call.tier).toBe('chat');
    expect(call.system).toContain('What the ledger knows:');
    expect(call.system).toContain('138,25 EUR');
    expect(call.messages).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello.' }, { role: 'user', content: 'where did september go?' }]);
    expect(r.text).toBe('Clothing took 116,76 € of 138,25 €.');
    expect(r.figures[0].kind).toBe('shares');
    expect(r.receipts[0].id).toBe('t1');
  });

  it('falls back to plain text when the model does not return JSON', async () => {
    complete.mockResolvedValue({ content: '**Clothing** was the biggest, at 116,76 EUR.' });
    const r = await answer('u1', 'what was biggest?', [], { now: NOW });
    expect(r).toEqual({ text: 'Clothing was the biggest, at 116,76 €.', figures: [], actions: [], receipts: [] });
  });

  it('says it cannot answer when the gateway fails', async () => {
    complete.mockRejectedValue(new Error('down'));
    const r = await answer('u1', 'what was biggest?', [], { now: NOW });
    expect(r.text).toMatch(/cannot answer/);
  });
});

describe('act', () => {
  it('re-checks the action and runs it', async () => {
    const r = await act('u1', { kind: 'not_me', transaction_id: 't1' }, { now: NOW });
    expect(store.setVerdict).toHaveBeenCalledWith('u1', 't1', 'not_me');
    expect(r.said).toBe('El Corte Ingles, 116,76 € on 7 Sep, is marked as not yours and leaves the month.');
    await act('u1', { kind: 'recategorise', merchant_key: 'oakberry acai', category: 'coffee' }, { now: NOW });
    expect(store.setPlaceCategory).toHaveBeenCalledWith('oakberry acai', 'coffee');
    await act('u1', { kind: 'answer', question_id: 'home_area', value: 'Chamberi' }, { now: NOW });
    expect(store.answerQuestion).toHaveBeenCalledWith('u1', expect.objectContaining({ questionId: 'home_area', kind: 'home_area', value: 'Chamberi' }));
  });

  it('refuses an action that matches nothing, with a 400', async () => {
    await expect(act('u1', { kind: 'not_me', transaction_id: 'ghost' }, { now: NOW })).rejects.toMatchObject({ status: 400 });
    expect(store.setVerdict).not.toHaveBeenCalled();
  });
});

describe('the ledger does not repeat itself', () => {
  it('has rules against restating and re-explaining', () => {
    expect(RULES).toMatch(/Do not restate the question/);
    expect(RULES).toMatch(/Vary your openings/);
    expect(RULES).toMatch(/answer only what is new/);
  });
  it('drops sentences already said when they are most of the reply', async () => {
    const { withoutRepeats } = await import('../../../../api/services/money/chat.js');
    const history = [
      { role: 'user', text: 'Which subscriptions do I have?' },
      { role: 'twin', text: 'Five charges come back every month. Spotify is 11,99 EUR. Higgsfield is 53,96 EUR.' },
    ];
    const again = 'Five charges come back every month. Spotify is 11,99 EUR. Fly.io is 18,63 EUR.';
    expect(withoutRepeats(again, history)).toBe('Fly.io is 18,63 EUR.');
  });
  it('keeps a reply that mostly says something new', async () => {
    const { withoutRepeats } = await import('../../../../api/services/money/chat.js');
    const history = [{ role: 'twin', text: 'Spotify is 11,99 EUR.' }];
    const text = 'Spotify is 11,99 EUR. It came on the 4th. Next is around the 4th of October.';
    expect(withoutRepeats(text, history)).toBe(text);
  });
  it('keeps one sentence rather than answering with nothing', async () => {
    const { withoutRepeats } = await import('../../../../api/services/money/chat.js');
    const history = [{ role: 'twin', text: 'Spotify is 11,99 EUR. Render is 6,09 EUR.' }];
    expect(withoutRepeats('Spotify is 11,99 EUR. Render is 6,09 EUR.', history)).toBe('Spotify is 11,99 EUR.');
  });
  it('leaves the reply alone when the ledger has not spoken before', async () => {
    const { withoutRepeats } = await import('../../../../api/services/money/chat.js');
    expect(withoutRepeats('Spotify is 11,99 EUR.', [{ role: 'user', text: 'hi' }])).toBe('Spotify is 11,99 EUR.');
  });
});
