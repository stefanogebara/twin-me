/** The chat's week figure: one bar per day for the last seven, from the same windows the context quotes. */
import { describe, expect, it } from 'vitest';
import { assemble, buildFigure, FIGURE_KINDS } from '../../../../api/services/money/chat.js';

const now = new Date('2026-09-19T08:00:00Z');
const tx = (id, iso, amount) => ({ id, occurred_at: iso, amount, currency: 'EUR', merchant_raw: id, merchant_key: id });

describe('the week figure', () => {
  it('is a known kind and draws the last seven days, today marked', () => {
    expect(FIGURE_KINDS).toContain('week');
    const ctx = assemble({ transactions: [tx('a', '2026-09-19T06:30:00Z', -2.5), tx('b', '2026-09-15T16:00:00Z', -48.2)], now, language: 'en' });
    const built = buildFigure({ kind: 'week' }, ctx);
    expect(built.figure.kind).toBe('week');
    expect(built.figure.days).toHaveLength(7);
    expect(built.figure.days.at(-1)).toMatchObject({ value: 2.5, today: true });
    expect(built.figure.days[2].value).toBe(48.2);
    expect(built.figure.days.filter((d) => d.today)).toHaveLength(1);
  });
  it('draws nothing for an empty week', () => {
    expect(buildFigure({ kind: 'week' }, assemble({ transactions: [], now, language: 'en' }))).toBeNull();
  });
});

describe('a per-day ask', () => {
  it('draws the week figure whatever the model named', async () => {
    const { assembleReply, asksPerDay } = await import('../../../../api/services/money/chat.js');
    expect(asksPerDay('Show me what I spent each day this week')).toBe(true);
    expect(asksPerDay('Give me a graph of this week')).toBe(true);
    expect(asksPerDay('quanto gastei por dia?')).toBe(true);
    expect(asksPerDay('What changed this week?')).toBe(false);
    const ctx = assemble({ transactions: [tx('a', '2026-09-19T06:30:00Z', -2.5)], now, language: 'en' });
    const swapped = assembleReply({ text: 'Here it is.', figures: [{ kind: 'weekdays' }], actions: [] }, ctx, 'Give me a graph of this week');
    expect(swapped.figures.map((f) => f.kind)).toEqual(['week']);
    const added = assembleReply({ text: 'Here it is.', figures: [], actions: [] }, ctx, 'what did I spend each day?');
    expect(added.figures.map((f) => f.kind)).toEqual(['week']);
  });
});

describe('the week figure over an asked stretch', () => {
  it('draws the days the question names when the context was built for that question', () => {
    const ctx = assemble({ transactions: [tx('a', '2026-09-08T10:00:00Z', -10), tx('b', '2026-09-12T10:00:00Z', -20)], now, language: 'en' });
    ctx.asked = 'a graph of what I spent between the 8th and the 12th';
    const built = buildFigure({ kind: 'week' }, ctx);
    expect(built.figure.title).toBe('Spent per day, 8 to 12 September');
    expect(built.figure.days).toHaveLength(5);
    expect(built.figure.days.map((d) => d.value)).toEqual([10, 0, 0, 0, 20]);
    expect(built.figure.days.some((d) => d.today)).toBe(false);
  });
  it('asks for the week figure itself when a graph of a named stretch is wanted', async () => {
    const { assembleReply } = await import('../../../../api/services/money/chat.js');
    const ctx = assemble({ transactions: [tx('a', '2026-09-08T10:00:00Z', -10), tx('b', '2026-09-12T10:00:00Z', -20)], now, language: 'en' });
    const message = 'a chart of what I spent between the 8th and the 12th';
    ctx.asked = message;
    const reply = assembleReply({ text: 'Here it is.', figures: [{ kind: 'weekdays' }], actions: [], cites: [] }, ctx, message);
    expect(reply.figures.map((f) => f.kind)).toEqual(['week']);
  });
});

describe('a question is answered, not remembered', () => {
  it('drops a remember offer on a plain ask and a closing chart question when the chart is drawn', async () => {
    const { assembleReply, withoutChartQuestion } = await import('../../../../api/services/money/chat.js');
    const ctx = assemble({ transactions: [tx('a', '2026-09-08T10:00:00Z', -10), tx('b', '2026-09-12T10:00:00Z', -20)], now, language: 'en' });
    const message = 'Give me a graph of what I spent between the 8th and the 12th';
    ctx.asked = message;
    const reply = assembleReply({ text: 'From the 8th to the 12th you spent 30,00 EUR. Want to see a bar chart of each day?', figures: [{ kind: 'week' }], actions: [{ kind: 'remember', text: message, label: 'Remember this' }], cites: [] }, ctx, message);
    expect(reply.actions).toEqual([]);
    expect(reply.text).toBe('From the 8th to the 12th you spent 30,00 \u20ac.');
    expect(withoutChartQuestion('Only a question about a graph?', true)).toBe('Only a question about a graph?');
    expect(withoutChartQuestion('Spent 538,21 EUR. Quer ver como foi dia a dia? Peca a figura da semana.', true)).toBe('Spent 538,21 EUR.');
    expect(withoutChartQuestion('Spent 538,21 EUR. Want a graph? The largest was 200,00 EUR.', true)).toBe('Spent 538,21 EUR. The largest was 200,00 EUR.');
    expect(withoutChartQuestion('Entre 8 e 14 de setembro voce gastou 538,21 EUR. Vou pedir o grafico de semana para ver dia a dia.', true)).toBe('Entre 8 e 14 de setembro voce gastou 538,21 EUR.');
    expect(withoutChartQuestion('This week cost 645,30 EUR. Here is the chart of the last seven days.', true)).toBe('This week cost 645,30 EUR.');
    expect(withoutChartQuestion('This week cost 645,30 EUR. Here is the week figure.', true)).toBe('This week cost 645,30 EUR.');
    expect(withoutChartQuestion('Between 8 and 14 September you spent 538,21 EUR. I\'ll draw the week.', true)).toBe('Between 8 and 14 September you spent 538,21 EUR.');
    expect(withoutChartQuestion('Spent 30,00 EUR. Is that right?', true)).toBe('Spent 30,00 EUR. Is that right?');
    const taught = assembleReply({ text: 'Noted.', figures: [], actions: [{ kind: 'remember', text: 'I am going to Bilbao on the 25th', label: 'Remember this' }], cites: [] }, ctx, 'I am going to Bilbao on the 25th');
    expect(taught.actions.map((a) => a.kind)).toEqual(['remember']);
  });
});
