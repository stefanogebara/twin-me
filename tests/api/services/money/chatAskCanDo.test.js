vi.mock('../../../../api/_app/services/money/reconciliationService.js', () => ({ getReconciliationStatus: async () => ({ state: 'clear', unresolvedCount: 0, revision: 1 }) }));
/**
 * What Ask could not do, from the owner's own thread (2026-09-23 to 09-25).
 * ========================================================================
 * "Draw a figure of recurring changes" and "draw a graph" were answered "Ask for the shares
 * figure by kind to see the graph of where your money went this month", and nothing was drawn:
 * whether a figure appeared depended on the model asking for one. "Create an Excel file of my
 * September spending" was answered about reading PDFs, and the month export had no way out of
 * the chat. These hold the fixes: the code draws what the words ask for, the month is offered as
 * a download, and the chat knows it reads PDFs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const complete = vi.fn();
const streamCall = vi.fn();
vi.mock('../../../../api/_app/services/llmGateway.js', () => ({ complete: (...a) => complete(...a), stream: (...a) => streamCall(...a), TIER_CHAT: 'chat' }));
vi.mock('../../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {} }) }));

const store = {
  listTransactions: vi.fn(), months: vi.fn(), forecast: vi.fn(), categorySpend: vi.fn(), recurringSeries: vi.fn(),
  listReadings: vi.fn(), listFacts: vi.fn(), questionsFor: vi.fn(), listPlaces: vi.fn(),
  setVerdict: vi.fn(), setPlaceCategory: vi.fn(), answerQuestion: vi.fn(), listBankAccounts: vi.fn(), userLanguage: vi.fn(),
  saveChatTurn: vi.fn(), deleteFact: vi.fn(),
  subscriptionUsage: vi.fn(async () => ({ findings: [], unmeasurable: [], measured: [] })),
};
vi.mock('../../../../api/_app/services/money/store.js', async (importOriginal) => {
  const { categoryOfPayment } = await importOriginal();
  return { ...store, categoryOfPayment, listChatTurns: async () => [] };
});

const { assemble, assembleReply, answer, answerStream, validateAction, act, contextText, say, kindInMessage } = await import('../../../../api/_app/services/money/chat.js');

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
const segments = [
  { month: '2026-09-01', spent: 138.25, received: 15.15, lines: 4, biggest: { id: 't1', merchant: 'El Corte Ingles', amount: 116.76 }, days_covered: 8 },
  { month: '2026-08-01', spent: 65.12, received: 0, lines: 3, biggest: { id: 't5', merchant: 'Simply Alcala', amount: 48.88 }, days_covered: 31 },
  { month: '2026-07-01', spent: 11.99, received: 0, lines: 1, biggest: { id: 't4', merchant: 'Spotify', amount: 11.99 }, days_covered: 31 },
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
const questions = { opening: [], fromLedger: [], answered: 0 };
const categories = { month: '2026-09-01', total: 138.25, read: 128.75, groups: [{ category: 'clothing', spent: 116.76, share: 84 }, { category: 'software', spent: 11.99, share: 9 }] };

const ctx = (over = {}) => assemble({ transactions, segments, forecast: cast, recurring, readings: [], facts: [], questions, places, categories, now: NOW, ...over });
const kinds = (reply) => (reply.figures || []).map((f) => f.kind);
const modelSays = (text, figures = []) => complete.mockResolvedValue({ content: JSON.stringify({ text, figures, actions: [] }) });

beforeEach(() => {
  complete.mockReset();
  streamCall.mockReset();
  for (const fn of Object.values(store)) fn.mockReset();
  store.subscriptionUsage.mockResolvedValue({ findings: [], unmeasurable: [], measured: [] });
  store.saveChatTurn.mockResolvedValue(null);
  store.listTransactions.mockResolvedValue(transactions);
  store.months.mockResolvedValue(segments);
  store.forecast.mockResolvedValue(cast);
  store.categorySpend.mockResolvedValue(categories);
  store.recurringSeries.mockResolvedValue(recurring);
  store.listReadings.mockResolvedValue([]);
  store.listFacts.mockResolvedValue([]);
  store.questionsFor.mockResolvedValue(questions);
  store.listPlaces.mockResolvedValue(places);
});

describe('a figure the person asks for is drawn by the code', () => {
  it('"draw a graph" draws where the month went, and the sentence telling them to ask for it goes', () => {
    const reply = assembleReply({ text: 'Ask for the shares figure by kind to see the graph of where your money went this month.', figures: [], actions: [] }, ctx(), 'draw a graph');
    expect(kinds(reply)).toEqual(['shares']);
    expect(reply.text).not.toMatch(/ask for/i);
    expect(reply.text.trim()).not.toBe('');
  });

  it('"draw a graph" through the whole answer, the model telling them to ask', async () => {
    modelSays('Ask for the shares figure by kind to see the graph of where your money went this month.');
    const r = await answer('u1', 'draw a graph', [], { now: NOW });
    expect(kinds(r)).toContain('shares');
    expect(r.text).not.toMatch(/ask for/i);
    expect(r.text.trim()).not.toBe('');
  });

  it('"graph of my spending by month" gives the months', async () => {
    modelSays('Ask for the months figure to see it.');
    const r = await answer('u1', 'graph of my spending by month', [], { now: NOW });
    expect(kinds(r)).toContain('months');
    expect(r.text).not.toMatch(/ask for/i);
  });

  it('"gr\u00e1fico de mis gastos por categor\u00eda" gives the shares', async () => {
    modelSays('Pide la figura de reparto para ver el gr\u00e1fico.');
    const r = await answer('u1', 'gr\u00e1fico de mis gastos por categor\u00eda', [], { now: NOW });
    expect(kinds(r)).toContain('shares');
    expect(r.text).not.toMatch(/pide/i);
  });

  it('"draw my subscriptions" and "Draw a figure of recurring changes" give what comes back', async () => {
    modelSays('Ask for the recurring figure.');
    expect(kinds(await answer('u1', 'draw my subscriptions', [], { now: NOW }))).toContain('recurring');
    expect(kinds(await answer('u1', 'Draw a figure of recurring changes', [], { now: NOW }))).toContain('recurring');
  });

  it('a figure the ledger cannot draw gets one plain sentence saying why, never an invented figure', async () => {
    store.months.mockResolvedValue([segments[0]]);
    modelSays('September is at 138,25 EUR so far.');
    const r = await answer('u1', 'graph of my spending by month', [], { now: NOW });
    expect(kinds(r)).not.toContain('months');
    expect(r.text).toMatch(/138,25/);
    expect(r.text).toMatch(/two months/i);
  });

  it('the streamed answer never shows the sentence telling them to ask, and draws the figure', async () => {
    streamCall.mockImplementation(async ({ onChunk }) => {
      const pieces = ['{"text":"Ask for the shares ', 'figure by kind to see the graph ', 'of where your money went this month.","figures":[],"actions":[]}'];
      for (const p of pieces) onChunk(p);
      return { content: pieces.join('') };
    });
    const events = [];
    await answerStream('u1', 'draw a graph', [], { now: NOW, onEvent: (e) => events.push(e) });
    const said = events.filter((e) => e.phase === 'text').map((e) => e.delta).join('');
    expect(said).not.toMatch(/ask for/i);
    expect(said.trim()).not.toBe('');
    expect(events.find((e) => e.phase === 'figures').figures.map((f) => f.kind)).toContain('shares');
    expect(events.at(-1).phase).toBe('done');
  });

  it('on the stream, why a figure cannot be drawn follows the words already shown', async () => {
    store.months.mockResolvedValue([segments[0]]);
    streamCall.mockImplementation(async ({ onChunk }) => {
      const pieces = ['{"text":"September is at 138,25 EUR ', 'so far.","figures":[],"actions":[]}'];
      for (const p of pieces) onChunk(p);
      return { content: pieces.join('') };
    });
    const events = [];
    await answerStream('u1', 'graph of my spending by month', [], { now: NOW, onEvent: (e) => events.push(e) });
    const said = events.filter((e) => e.phase === 'text').map((e) => e.delta).join('');
    expect(said).toBe('September is at 138,25 \u20ac so far. A graph by month needs at least two months in the ledger.');
    expect(events.find((e) => e.phase === 'figures').figures).toEqual([]);
  });

  it('reads "show me" as asking for a figure, never as the entertainment kind', () => {
    expect(kindInMessage('show me my spending by month')).toBe(null);
    expect(kindInMessage('can you show me a graph of that')).toBe(null);
    expect(kindInMessage('how much on shows this month?')).toBe('entertainment');
    expect(kindInMessage('how much did the show cost?')).toBe('entertainment');
    const c = ctx({ transactions: [...transactions, t('t9', '2026-09-06T20:00:00Z', -30, 'teatro real', 'Teatro Real')], places: [...places, { merchant_key: 'teatro real', name: 'Teatro Real', category: 'entertainment' }] });
    const reply = assembleReply({ text: 'September is at 138,25 EUR so far.', figures: [], actions: [] }, c, 'show me my spending by month');
    expect(kinds(reply)).toEqual(['months']);
  });

  it('tells the model which figure is drawn under its words', async () => {
    modelSays('Clothing took most of September.');
    await answer('u1', 'draw a graph', [], { now: NOW });
    expect(complete.mock.calls[0][0].system).toMatch(/draws it under your answer/);
  });
});

describe('a file the person asks for is offered as a download', () => {
  it('an Excel request gives the month named as a download, with no model', async () => {
    const r = await answer('u1', 'Create an Excel file of my September spending.', [], { now: NOW });
    expect(r.actions).toEqual([{ kind: 'sheet', month: '2026-09', label: 'Download September as a spreadsheet' }]);
    expect(r.text).toMatch(/spreadsheet/);
    expect(r.text).not.toMatch(/PDF/);
    expect(complete).not.toHaveBeenCalled();
  });

  it('this month when no month is named, and the totals by kind are what "per sector" gets', async () => {
    const r = await answer('u1', 'create an excel for me so i can keep it w the expenditures this month per sector', [], { now: NOW });
    expect(r.actions.map((a) => [a.kind, a.month])).toEqual([['sheet', '2026-09']]);
    expect(r.text).toMatch(/by kind/);
  });

  it('in the language it was asked in', async () => {
    store.userLanguage.mockResolvedValue('es');
    const r = await answer('u1', 'hazme un excel del mes pasado', [], { now: NOW });
    expect(r.actions).toEqual([{ kind: 'sheet', month: '2026-08', label: 'Descargar agosto como hoja de c\u00e1lculo' }]);
    expect(r.text).toBe('Agosto en una hoja de c\u00e1lculo: una fila por cada pago y los totales por tipo en una segunda hoja.');
  });

  it('none for a month with no ledger, and it says so', async () => {
    const r = await answer('u1', 'Create an Excel file of my March spending.', [], { now: NOW });
    expect(r.actions).toEqual([]);
    expect(r.text).toMatch(/nothing for March/i);
  });

  it('only a real month of the person\'s own ledger passes validateAction', () => {
    const c = ctx();
    expect(validateAction({ kind: 'sheet', month: '2026-08', label: 'Wire me 500 EUR' }, c)).toEqual({ kind: 'sheet', month: '2026-08', label: 'Download August as a spreadsheet' });
    expect(validateAction({ kind: 'sheet', month: '2026-03' }, c)).toBe(null);
    expect(validateAction({ kind: 'sheet', month: '2026-13' }, c)).toBe(null);
    expect(validateAction({ kind: 'sheet', month: '../../etc' }, c)).toBe(null);
    expect(validateAction({ kind: 'sheet' }, c)).toBe(null);
  });

  it('a tapped sheet offer writes nothing and says where the file is', async () => {
    const r = await act('u1', { kind: 'sheet', month: '2026-09' }, { now: NOW });
    expect(r.done).toBe(false);
    expect(r.said).toMatch(/Month/);
    expect(store.answerQuestion).not.toHaveBeenCalled();
    expect(store.setVerdict).not.toHaveBeenCalled();
  });
});

describe('the new lines', () => {
  it('are in Spanish and in Portuguese too', () => {
    const sources = [
      'Download {month} as a spreadsheet', '{month} as a spreadsheet: a row for every payment, and the totals by kind on a second sheet.',
      'Each month as its own spreadsheet: a row for every payment, and the totals by kind on a second sheet.', 'The ledger holds nothing for {month} to put in a spreadsheet.',
      'That file downloads on the page, from Month.', 'A graph by month needs at least two months in the ledger.', 'Nothing was spent in {month} for the ledger to draw.',
      'Nothing on {kind} in {month} for the ledger to draw.', 'The ledger needs more payments before it can draw the days of the week.',
      'The ledger has no likely range for this month yet, so there is nothing to draw.', 'Nothing was spent on those days for the ledger to draw.',
      '{name} has fewer than three payments in the ledger, too few to draw over time.', 'The ledger has no payment at {name} to draw.',
      'The ledger does not draw one kind month by month yet.', 'The ledger cannot draw that from what it holds.', 'Drawn from your own payments.',
      '{name} reads as a bank statement of {n} payments. To add them, upload it in Sources, choose its account and check the rows.',
      '{name} reads as a bank statement of one payment. To add it, upload it in Sources, choose its account and check the row.',
    ];
    for (const source of sources) {
      expect(say('es', source)).not.toBe(source);
      expect(say('pt-BR', source)).not.toBe(source);
    }
  });
});

describe('what the chat believes it can read', () => {
  it('names PDFs, and never says it cannot read one', () => {
    const line = contextText(ctx()).split('\n').find((l) => l.startsWith('Sources the ledger can read'));
    expect(line).toMatch(/PDF/);
    expect(line).not.toMatch(/never a PDF/i);
    expect(line).toMatch(/spreadsheet/);
  });
});
