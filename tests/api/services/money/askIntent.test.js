vi.mock('../../../../api/_app/services/money/reconciliationService.js', () => ({ getReconciliationStatus: async () => ({ state: 'clear', unresolvedCount: 0, revision: 1 }) }));
/**
 * Which figure the words ask for, and which file, in English, Spanish and Portuguese. Pure:
 * the rows go straight to assemble() and nothing reaches a model or a database.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../api/_app/services/llmGateway.js', () => ({ complete: vi.fn(), stream: vi.fn(), TIER_CHAT: 'chat' }));
vi.mock('../../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {} }) }));
vi.mock('../../../../api/_app/services/money/store.js', async (importOriginal) => {
  const { categoryOfPayment } = await importOriginal();
  return { categoryOfPayment };
});

const { assemble, FIGURE_KINDS } = await import('../../../../api/_app/services/money/chat.js');
const { figureAsk, fileAsk, asksForFigure, withoutFigureAsks, mayAskForFigure, withAskedFigure } = await import('../../../../api/_app/services/money/askIntent.js');

const NOW = new Date('2026-09-08T12:00:00Z');
const t = (id, occurred_at, amount, merchant_key, merchant_raw) => ({ id, occurred_at, amount, merchant_key, merchant_raw, channel: 'card', currency: 'EUR' });
const ctx = assemble({
  transactions: [
    t('t1', '2026-09-07T10:00:00Z', -116.76, 'el corte ingles', 'El Corte Ingles'),
    t('t2', '2026-09-04T09:00:00Z', -11.99, 'spotify', 'Spotify'),
    t('t3', '2026-08-04T09:00:00Z', -11.99, 'spotify', 'Spotify'),
    t('t4', '2026-12-04T09:00:00Z', -5, 'bar', 'Bar'),
  ],
  places: [{ merchant_key: 'el corte ingles', name: 'El Corte Ingles', category: 'clothing' }, { merchant_key: 'spotify', name: 'Spotify', category: 'software' }],
  now: NOW,
});
const ask = (m, c = ctx) => figureAsk(m, c);

describe('figureAsk: a request to draw, show, plot or chart, and which figure', () => {
  it('reads the kind from the words', () => {
    expect(ask('draw a graph')).toMatchObject({ kind: 'shares', specific: false });
    expect(ask('graph of my spending by month')).toMatchObject({ kind: 'months', specific: true });
    expect(ask('gr\u00e1fico de mis gastos por categor\u00eda')).toMatchObject({ kind: 'shares', specific: true });
    expect(ask('draw my subscriptions')).toMatchObject({ kind: 'recurring' });
    expect(ask('Draw a figure of recurring changes')).toMatchObject({ kind: 'recurring' });
    expect(ask('desenha um gr\u00e1fico dos meus gastos por m\u00eas')).toMatchObject({ kind: 'months' });
    expect(ask('mu\u00e9strame mis gastos por mes')).toMatchObject({ kind: 'months' });
    expect(ask('mostra os meus gastos por categoria')).toMatchObject({ kind: 'shares' });
    expect(ask('chart what I spent each day this week')).toMatchObject({ kind: 'week' });
    expect(ask('dibuja lo que gast\u00e9 cada d\u00eda')).toMatchObject({ kind: 'week' });
    expect(ask('plot my spending by day of the week')).toMatchObject({ kind: 'weekdays' });
    expect(ask('show me Spotify over time')).toMatchObject({ kind: 'history', merchant: 'spotify' });
    expect(ask('a chart of groceries')).toMatchObject({ kind: 'shares', by: 'merchant', category: 'groceries' });
    expect(ask('graph of August')).toMatchObject({ kind: 'shares', month: '2026-08' });
    expect(ask('chart of last month by place')).toMatchObject({ kind: 'shares', by: 'merchant', month: '2026-08' });
    expect(ask('draw my forecast for the month')).toMatchObject({ kind: 'band' });
  });

  it('money in and out is the flows figure when the catalogue has it, else the months', () => {
    expect(ask('draw what came in and went out')).toMatchObject({ kind: FIGURE_KINDS.includes('flows') ? 'flows' : 'months' });
    expect(ask('gr\u00e1fico de mis ingresos')).toMatchObject({ kind: FIGURE_KINDS.includes('flows') ? 'flows' : 'months' });
  });

  it('one kind month by month is a figure the ledger does not draw, said plainly', () => {
    expect(ask('graph of my groceries by month')).toMatchObject({ refuse: 'kind-by-month' });
  });

  it('follows a short follow-up to the question before it', () => {
    const c = { ...ctx, asked: 'how much on software this month? show me a graph of that' };
    expect(figureAsk('show me a graph of that', c)).toMatchObject({ kind: 'shares', category: 'software' });
  });

  it('is not a request when nothing is to be drawn, or drawing is refused', () => {
    for (const m of ['show me the maths', 'how much did I spend yesterday?', "don't draw a graph, just the number", 'sin gr\u00e1fico, solo el total', 'what can you read?', 'I need to draw 50 euros from the cash machine', 'show me my last payment']) {
      expect(ask(m)).toBe(null);
    }
  });
});

describe('fileAsk: a request for the month as a file', () => {
  it('reads the month the person means, this month by default', () => {
    expect(fileAsk('Create an Excel file of my September spending.', ctx)).toEqual({ months: ['2026-09'] });
    expect(fileAsk('create an excel for me so i can keep it w the expenditures this month per sector', ctx)).toEqual({ months: ['2026-09'] });
    expect(fileAsk('export last month to a spreadsheet', ctx)).toEqual({ months: ['2026-08'] });
    expect(fileAsk('hazme una hoja de c\u00e1lculo de agosto', ctx)).toEqual({ months: ['2026-08'] });
    expect(fileAsk('me cria uma planilha de julho e agosto', ctx)).toEqual({ months: ['2026-07', '2026-08'] });
    expect(fileAsk('dame un csv del mes pasado', ctx)).toEqual({ months: ['2026-08'] });
    expect(fileAsk('download my expenses', ctx)).toEqual({ months: ['2026-09'] });
    /* a month not yet reached this year is last year's */
    expect(fileAsk('excel of December', ctx)).toEqual({ months: ['2025-12'] });
    expect(fileAsk('excel of December 2026', ctx)).toEqual({ months: ['2026-12'] });
  });

  it('reading a file, keeping one, or filing a place is not asking for one', () => {
    for (const m of ['can you read an excel file?', 'I sent you a csv', 'I uploaded the PDF from my bank', 'where can I download the app?', 'file Glovo under eating out', 'I keep my budget in a spreadsheet', 'puedes leer un archivo pdf?', 'voc\u00ea consegue ler minha planilha?', 'how much did I spend in September?']) {
      expect(fileAsk(m, ctx)).toBe(null);
    }
  });
});

describe('a sentence that tells the person to ask for a figure', () => {
  it('is recognised in the three languages, and plain sentences are not', () => {
    expect(asksForFigure('Ask for the shares figure by kind to see the graph of where your money went this month.')).toBe(true);
    expect(asksForFigure('You can ask me for a chart of the months.')).toBe(true);
    expect(asksForFigure('Would you like a bar chart of each day?')).toBe(true);
    expect(asksForFigure('I cannot draw graphs.')).toBe(true);
    expect(asksForFigure('Pide el gr\u00e1fico por categor\u00eda para verlo.')).toBe(true);
    expect(asksForFigure('Pe\u00e7a o gr\u00e1fico dos meses.')).toBe(true);
    expect(asksForFigure('Clothing took 116,76 EUR, most of the month.')).toBe(false);
    expect(asksForFigure('The figure below shows September by kind.')).toBe(false);
    expect(asksForFigure('If you ask for more detail, the ledger lists each payment.')).toBe(false);
  });

  it('is cut from a reply and the rest stands', () => {
    expect(withoutFigureAsks('Clothing took 116,76 EUR. Ask for the months figure to compare. Spotify came back.')).toBe('Clothing took 116,76 EUR. Spotify came back.');
    expect(withoutFigureAsks('Ropa se llev\u00f3 116,76 EUR. \u00bfQuieres un gr\u00e1fico?')).toBe('Ropa se llev\u00f3 116,76 EUR.');
    expect(withoutFigureAsks('Ask for the shares figure.')).toBe('');
  });

  it('holds a sentence on the stream while it could still become one', () => {
    expect(mayAskForFigure('Ask for')).toBe(true);
    expect(mayAskForFigure('You can')).toBe(true);
    expect(mayAskForFigure('Clothing took 116,76 EUR and')).toBe(false);
  });
});

describe('withAskedFigure: the words agree with what is drawn under them', () => {
  const reply = (text) => ({ text, figures: [], actions: [], receipts: [] });
  it('drops a question left over from the model once the code has drawn the figure', () => {
    const out = withAskedFigure(reply('What would you like the graph to show? For example, spending per month or by weekday?'), 'draw a graph', ctx);
    expect(out.figures.map((f) => f.kind)).toEqual(['shares']);
    expect(out.text).not.toMatch(/\?/);
    expect(out.text.trim().length).toBeGreaterThan(0);
  });
  it('keeps what the model said about the figure when it is not a question', () => {
    const out = withAskedFigure(reply('Most of it went to clothing this month.'), 'draw a graph', ctx);
    expect(out.text).toBe('Most of it went to clothing this month.');
  });
  it('never presents a figure it could not draw', () => {
    const one = assemble({ transactions: [t('s1', '2026-09-03T10:00:00Z', -20, 'bar', 'Bar'), t('s2', '2026-09-05T10:00:00Z', -12, 'spotify', 'Spotify')], places: [], now: NOW });
    const out = withAskedFigure(reply('Here is your spending per month.'), 'show me a chart of my spending by month', one);
    expect(out.figures).toEqual([]);
    expect(out.text).not.toMatch(/here is/i);
    expect(out.text).toMatch(/at least two months/);
    const es = withAskedFigure(reply('Aqu\u00ed tienes tus gastos por mes.'), 'mu\u00e9strame un gr\u00e1fico de mis gastos por mes', one);
    expect(es.text).not.toMatch(/aqu\u00ed tienes/i);
  });
});
