/**
 * The chat knows money in (2026-09-26): the lines it quotes for "how much came in", "who paid
 * me" and "did more come in than go out", and the figure that draws money in beside money out.
 * Every number is inflow.js's; the chat only phrases.
 */
import { describe, expect, it } from 'vitest';
import { assemble, contextText, buildFigure, receiptsFor, dropUngrounded, FIGURE_KINDS, REPLY_FIGURE_KINDS, RULES, say } from '../../../../api/_app/services/money/chat.js';

const now = new Date('2026-09-19T08:00:00Z');
const tx = (id, key, raw, iso, amount, extra = {}) => ({ id, merchant_key: key, merchant_raw: raw, occurred_at: iso, amount, currency: 'EUR', channel: 'card', ...extra });
const ledger = [
  tx('dad', 'ruiz martin carlos', 'Ruiz Martin Carlos', '2026-09-01T09:00:00Z', 1750, { channel: 'transfer' }),
  tx('ana', 'ana lopez', 'Ana Lopez', '2026-09-03T20:00:00Z', 15.15, { channel: 'bizum' }),
  tx('rent', 'landlord sl', 'Landlord SL', '2026-09-02T09:00:00Z', -600, { channel: 'transfer' }),
  tx('lidl', 'lidl', 'Lidl', '2026-09-05T18:00:00Z', -45.5),
  tx('aug-in', 'ruiz martin carlos', 'Ruiz Martin Carlos', '2026-08-01T09:00:00Z', 1750, { channel: 'transfer' }),
  tx('aug-out', 'landlord sl', 'Landlord SL', '2026-08-02T09:00:00Z', -1600, { channel: 'transfer' }),
];
/* The forecast's own received leaves out a split's Bizums back; the context no longer quotes it
   beside the month's money in, so the model has one figure for what came in, not two. */
const forecast = { month: '2026-09-01', spent: 645.5, days_left: 11, committed: 0, received: 1750, projected_p10: 700, projected_p50: 800, projected_p90: 900 };
const ctxOf = (transactions, language = 'en') => assemble({ transactions, forecast, now, language });

describe('the lines the chat quotes about money in', () => {
  it('says this month in and out, the difference, who paid, and the months side by side', () => {
    const text = contextText(ctxOf(ledger));
    expect(text).toMatch(/^Money in this month \(Sep\): 1765,15 EUR came in and 645,50 EUR went out, so 1119,65 EUR more came in than went out\./m);
    expect(text).toMatch(/^Money in this month by who paid, largest first \(payments\): Ruiz Martin Carlos 1750,00 EUR \(1\); Ana Lopez 15,15 EUR \(1\)\.$/m);
    expect(text).toMatch(/^Money in and out per month, came in \/ went out: Aug 1750,00 EUR \/ 1600,00 EUR; Sep 1765,15 EUR \/ 645,50 EUR so far\.$/m);
    expect(text).not.toMatch(/^Came in this month/m);
  });

  it('grounds an answer that quotes them, and drops one that works out its own difference', () => {
    const ctx = ctxOf(ledger);
    expect(dropUngrounded('This month 1765,15 EUR came in and 645,50 EUR went out: 1119,65 EUR more in than out.', ctx).dropped).toBe(0);
    expect(dropUngrounded('That leaves you 1104,50 EUR.', ctx).dropped).toBe(1);
  });

  it('says nothing came in rather than a zero, and names no payer', () => {
    const text = contextText(ctxOf(ledger.filter((r) => r.id !== 'dad' && r.id !== 'ana')));
    expect(text).toMatch(/^Money in this month \(Sep\): nothing has come in yet; 645,50 EUR went out\.$/m);
    expect(text).not.toMatch(/by who paid/);
    expect(text).not.toMatch(/0,00 EUR came in/);
  });
});

describe('the flows figure', () => {
  it('is a kind the model may ask for, and the rules say what it draws', () => {
    expect(FIGURE_KINDS).toContain('flows');
    expect(REPLY_FIGURE_KINDS).toContain('flows');
    expect(RULES).toMatch(/flows \(money in and money out per month, side by side\)/);
  });

  it('draws money in beside money out, a pair a month, oldest first, this month marked', () => {
    const ctx = ctxOf(ledger);
    const built = buildFigure({ kind: 'flows' }, ctx);
    expect(built.figure).toEqual({
      kind: 'flows',
      title: 'Money in and out per month',
      points: [
        { label: 'Aug', money_in: 1750, money_out: 1600 },
        { label: 'Sep', money_in: 1765.15, money_out: 645.5, current: true },
      ],
    });
    /* Its receipts are this month's money in, largest first. */
    expect(receiptsFor([built], ctx).map((r) => [r.id, r.amount])).toEqual([['dad', 1750], ['ana', 15.15]]);
  });

  it('draws the last six months at most', () => {
    const long = [];
    for (let i = 0; i < 9; i += 1) {
      const month = String(i + 1).padStart(2, '0');
      long.push(tx(`in-${i}`, 'acme sl', 'ACME SL', `2026-${month}-05T09:00:00Z`, 1000 + i, { channel: 'transfer' }));
      long.push(tx(`out-${i}`, 'lidl', 'Lidl', `2026-${month}-06T09:00:00Z`, -100 - i));
    }
    const points = buildFigure({ kind: 'flows' }, ctxOf(long)).figure.points;
    expect(points.map((p) => p.label)).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
    expect(points.at(-1)).toMatchObject({ money_in: 1008, money_out: 108, current: true });
  });

  it('is titled in the person\'s language', () => {
    expect(buildFigure({ kind: 'flows' }, ctxOf(ledger, 'es')).figure).toMatchObject({ title: 'Entradas y salidas por mes', points: [{ label: 'ago' }, { label: 'sep' }] });
    expect(buildFigure({ kind: 'flows' }, ctxOf(ledger, 'pt-BR')).figure.title).toBe(say('pt-BR', 'Money in and out per month'));
    expect(say('pt-BR', 'Money in and out per month')).not.toBe('Money in and out per month');
  });

  it('draws nothing when nothing came in: that would be the months figure with an empty half', () => {
    expect(buildFigure({ kind: 'flows' }, ctxOf(ledger.filter((r) => Number(r.amount) < 0)))).toBeNull();
    expect(buildFigure({ kind: 'flows' }, ctxOf([]))).toBeNull();
  });

  it('is withheld with every other figure while payment evidence is unresolved', () => {
    const blocked = assemble({ transactions: ledger, forecast: { ...forecast, withheld: true }, now, language: 'en' });
    expect(buildFigure({ kind: 'flows' }, blocked)).toBeNull();
  });
});
