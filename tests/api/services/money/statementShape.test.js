/**
 * Reading a sheet nobody designed for us.
 * =======================================
 * The importer knows Santander's own exports: "fecha operacion", "concepto", "importe".
 * A person who keeps their budget in Google Sheets writes "Día", "Gasto", "€", or "What",
 * "How much", and findHeader returns null, so the upload answered "That file has no
 * statement header this reads yet" and the file was a dead end.
 *
 * A model sees a bounded sample to identify the shape of the sheet. It returns
 * which column is which and how the dates and amounts are written, and the same
 * deterministic parser that reads a bank export applies it. So these tests are about the
 * plan, not about any number, and about the questions a plan cannot answer from the file
 * alone -- a column of amounts with no minus sign anywhere cannot say by itself whether it
 * is money out.
 */
import { describe, it, expect } from 'vitest';
import { sanitisePlan, planQuestions, answeredPlan, describeGrid, readDate, readAmount, textGrid } from '../../../../api/_app/services/money/statements/shape.js';
import { toSightings } from '../../../../api/_app/services/money/statements/importer.js';

const budget = [
  ['My 2026 budget'],
  [],
  ['Día', 'Gasto', 'Cuánto', 'Categoría'],
  ['03/04', 'Mercadona', '23,40', 'Comida'],
  ['05/04', 'Renfe', '1,70', 'Transporte'],
  ['11/04', 'Spotify', '11,99', 'Suscripción'],
];

describe('sanitisePlan', () => {
  const ok = { index: 2, columns: { date: 0, concept: 1, amount: 2 }, dateOrder: 'dmy', decimal: ',', sign: 'all_out' };

  it('keeps a plan that fits the grid', () => {
    expect(sanitisePlan(ok, budget)).toMatchObject({ index: 2, columns: { date: 0, concept: 1, amount: 2 }, sign: 'signed' });
  });

  it.each([null, false, true, '', '0', [], [0]])('rejects a nonnumeric header index %j', (index) => {
    expect(sanitisePlan({ ...ok, index }, budget)).toBeNull();
  });

  it.each([null, false, true, '', '0', [], [0]])('does not turn an absent or malformed column %j into the first column', (value) => {
    const p = sanitisePlan({ ...ok, columns: { ...ok.columns, valueDate: value, currency: value } }, budget);
    expect(p.columns).toEqual(ok.columns);
    expect(planQuestions(budget, p).map((q) => q.id)).toContain('currency');
    expect(sanitisePlan({ ...ok, columns: { date: 0, amount: value } }, budget)).toBeNull();
  });

  it('drops a column the grid does not have, rather than reading past the row', () => {
    const p = sanitisePlan({ ...ok, columns: { ...ok.columns, currency: 9 } }, budget);
    expect(p.columns.currency).toBeUndefined();
    expect(p.columns.amount).toBe(2);
  });

  it('drops a field it has never heard of, whatever the model called it', () => {
    const p = sanitisePlan({ ...ok, columns: { ...ok.columns, vibe: 3, merchant_name_guess: 1 } }, budget);
    expect(p.columns.vibe).toBeUndefined();
    expect(p.columns.merchant_name_guess).toBeUndefined();
  });

  it('refuses a plan with no date or no money, which is not a ledger', () => {
    expect(sanitisePlan({ index: 2, columns: { concept: 1, amount: 2 } }, budget)).toBeNull();
    expect(sanitisePlan({ index: 2, columns: { date: 0, concept: 1 } }, budget)).toBeNull();
    expect(sanitisePlan(null, budget)).toBeNull();
    expect(sanitisePlan({ index: 2, columns: {} }, budget)).toBeNull();
  });

  it('takes debit and credit as money, since a sheet may split them', () => {
    const p = sanitisePlan({ index: 0, columns: { date: 0, debit: 1, credit: 2 } }, budget);
    expect(p.columns).toMatchObject({ debit: 1, credit: 2 });
    expect(p.sign).toBe('debit_credit');
  });

  it('refuses a header row outside the grid, and a negative one', () => {
    expect(sanitisePlan({ ...ok, index: 99 }, budget)).toBeNull();
    expect(sanitisePlan({ ...ok, index: -1 }, budget)).toBeNull();
  });

  it('falls back to safe readings rather than trusting a word it does not know', () => {
    const p = sanitisePlan({ ...ok, dateOrder: 'sideways', decimal: '!', sign: 'maybe' }, budget);
    expect(p.dateOrder).toBe('dmy');
    expect(p.decimal).toBe(',');
    expect(p.sign).toBe('signed');
  });
});

describe('untrusted shape safety', () => {
  it.each(['all_out', 'all_in', 'debit_credit'])('does not let model direction %s settle unsigned money', (sign) => {
    const p = sanitisePlan({ index: 2, columns: { date: 0, amount: 2 }, sign, currency: 'EUR', answered: ['sign', 'currency'] }, budget);
    expect(p.sign).toBe('signed');
    expect(p.currency).toBeNull();
    expect(planQuestions(budget, p).map((q) => q.id)).toEqual(expect.arrayContaining(['sign', 'currency']));
    const confirmed = answeredPlan(p, { sign: 'all_out', currency: 'EUR' });
    const remaining = planQuestions(budget, confirmed).map((q) => q.id);
    expect(remaining).not.toContain('sign');
    expect(remaining).not.toContain('currency');
  });

  it('asks about the missing year among fully dated payments, then imports both', () => {
    const rows = [['When', 'What', 'How much'], ['2026-09-20', 'A', '-10'], ['21/09', 'B', '-20']];
    const p = sanitisePlan({ index: 0, columns: { date: 0, concept: 1, amount: 2 } }, rows);
    expect(planQuestions(rows, p, { accountCurrency: 'EUR' }).map((q) => q.id)).toContain('year');
    const result = toSightings(rows, { accountId: 'acc-1', plan: answeredPlan(p, { year: '2026' }) });
    expect(result.sightings.map((r) => r.occurred_at.slice(0, 10))).toEqual(['2026-09-20', '2026-09-21']);
  });

  it('still asks ambiguous day order when an ISO date is also present', () => {
    const rows = [['When', 'Amount'], ['2026-09-20', '-10'], ['03/04', '-20']];
    const p = sanitisePlan({ index: 0, columns: { date: 0, amount: 1 } }, rows);
    expect(planQuestions(rows, p).map((q) => q.id)).toContain('dateOrder');
  });

  it('refuses a late very wide row before padding the sample or accepting a plan', () => {
    const rows = [...budget, Array(10000).fill('')];
    expect(describeGrid(rows)).toBeNull();
    expect(sanitisePlan({ index: 2, columns: { date: 0, amount: 2 } }, rows)).toBeNull();
  });

  it('refuses an oversized sample in UTF-8 bytes, including cell labels', () => {
    const rows = Array.from({ length: 12 }, () => Array(64).fill('界'.repeat(80)));
    expect(describeGrid(rows)).toBeNull();
  });

  it('caller options cannot remove the row and cell limits', () => {
    const rows = Array.from({ length: 50 }, () => ['x'.repeat(500)]);
    const grid = describeGrid(rows, { sample: 500, cellLimit: 500 });
    expect(grid.sample).toHaveLength(12);
    expect(grid.sample[0][0]).toHaveLength(80);
  });
});

describe('planQuestions', () => {
  const plan = sanitisePlan({ index: 2, columns: { date: 0, concept: 1, amount: 2 }, dateOrder: 'dmy', decimal: ',', sign: 'signed' }, budget);

  it('asks whether a column with no minus sign anywhere is money out', () => {
    const qs = planQuestions(budget, plan);
    expect(qs.map((q) => q.id)).toContain('sign');
    expect(qs.find((q) => q.id === 'sign').choices.map((c) => c.value)).toEqual(['all_out', 'all_in', 'signed']);
  });

  it('does not ask when the sheet signs its own amounts', () => {
    const signed = [...budget.slice(0, 3), ['03/04', 'Mercadona', '-23,40', 'Comida'], ['30/04', 'Nómina', '900,00', 'Ingreso']];
    expect(planQuestions(signed, plan).map((q) => q.id)).not.toContain('sign');
  });

  it('asks which year, when no date in the file carries one', () => {
    const qs = planQuestions(budget, plan);
    expect(qs.map((q) => q.id)).toContain('year');
  });

  it('does not ask the year when the dates carry one', () => {
    const dated = [...budget.slice(0, 3), ['03/04/2026', 'Mercadona', '23,40', 'Comida']];
    expect(planQuestions(dated, plan).map((q) => q.id)).not.toContain('year');
  });

  it('asks day-first or month-first only while both readings are possible', () => {
    const both = [...budget.slice(0, 3), ['03/04/2026', 'A', '1,00', ''], ['05/06/2026', 'B', '2,00', '']];
    expect(planQuestions(both, plan).map((q) => q.id)).toContain('dateOrder');
    const settled = [...budget.slice(0, 3), ['23/04/2026', 'A', '1,00', ''], ['05/06/2026', 'B', '2,00', '']];
    expect(planQuestions(settled, plan).map((q) => q.id)).not.toContain('dateOrder');
  });

  it('asks the currency only when neither the sheet nor the account says', () => {
    expect(planQuestions(budget, plan).map((q) => q.id)).toContain('currency');
    expect(planQuestions(budget, plan, { accountCurrency: 'EUR' }).map((q) => q.id)).not.toContain('currency');
    const withColumn = sanitisePlan({ index: 2, columns: { date: 0, concept: 1, amount: 2, currency: 3 }, sign: 'signed' }, budget);
    expect(planQuestions(budget, withColumn).map((q) => q.id)).not.toContain('currency');
  });

  it('every question carries what it is asking about, so a screen can show it', () => {
    for (const q of planQuestions(budget, plan)) {
      expect(typeof q.id).toBe('string');
      expect(q.asks.length).toBeGreaterThan(0);
      expect(Array.isArray(q.choices)).toBe(true);
      expect(q.choices.length).toBeGreaterThan(0);
      for (const c of q.choices) expect(typeof c.label).toBe('string');
    }
  });

  it('has nothing to ask about a plan that answers itself', () => {
    const full = sanitisePlan({ index: 2, columns: { date: 0, concept: 1, amount: 2, currency: 3 }, dateOrder: 'dmy', decimal: ',', sign: 'signed' }, budget);
    const rows = [...budget.slice(0, 3), ['23/04/2026', 'Mercadona', '-23,40', 'EUR']];
    expect(planQuestions(rows, full)).toEqual([]);
  });
});

describe('answeredPlan', () => {
  const plan = sanitisePlan({ index: 2, columns: { date: 0, concept: 1, amount: 2 }, dateOrder: 'dmy', decimal: ',', sign: 'signed' }, budget);

  it('takes the answers it understands', () => {
    const p = answeredPlan(plan, { sign: 'all_out', year: '2026', currency: 'EUR', dateOrder: 'mdy' });
    expect(p).toMatchObject({ sign: 'all_out', year: 2026, currency: 'EUR', dateOrder: 'mdy' });
  });

  it('ignores an answer that is not one of the choices', () => {
    const p = answeredPlan(plan, { sign: 'sideways', currency: 'not a currency', year: 'soon', dateOrder: 'ymd?' });
    expect(p.sign).toBe('signed');
    expect(p.currency).toBeNull();
    expect(p.year).toBeNull();
    expect(p.dateOrder).toBe('dmy');
  });

  it('refuses a year outside the years a ledger can be about', () => {
    expect(answeredPlan(plan, { year: '1066' }).year).toBeNull();
    expect(answeredPlan(plan, { year: '3000' }).year).toBeNull();
  });

  it('leaves the plan alone when there is nothing to apply', () => {
    expect(answeredPlan(plan, {})).toEqual(plan);
    expect(answeredPlan(plan, null)).toEqual(plan);
  });
});

describe('describeGrid', () => {
  it('sends the model the shape and a few rows, never the whole file', () => {
    const big = [budget[2], ...Array.from({ length: 500 }, (_, i) => [`0${(i % 9) + 1}/04`, `Shop ${i}`, '1,00', 'x'])];
    const d = describeGrid(big, { sample: 6 });
    expect(d.rows).toBe(501);
    expect(d.width).toBe(4);
    expect(d.sample.length).toBe(6);
  });

  it('keeps cells short, so one long note cannot carry the file out', () => {
    const d = describeGrid([['a'], ['x'.repeat(500)]], { sample: 2 });
    expect(d.sample[1][0].length).toBeLessThanOrEqual(80);
  });

  it('survives a ragged grid', () => {
    const d = describeGrid([['a', 'b', 'c'], ['1'], []], { sample: 3 });
    expect(d.width).toBe(3);
    expect(d.sample.length).toBe(3);
  });
});

/**
 * A plan is only worth having if the parser can apply it. importer.js reads a Spanish bank
 * export: day first, comma decimal, signs already in the file. A budget sheet may be any of
 * those or none, so the plan carries the reading and these apply it.
 */
describe('readDate', () => {
  const read = (v, o) => readDate(v, o);
  it('reads day first or month first, as the plan says', () => {
    expect(read('03/04/2026', { dateOrder: 'dmy' })).toBe('2026-04-03');
    expect(read('03/04/2026', { dateOrder: 'mdy' })).toBe('2026-03-04');
    expect(read('2026-04-03', { dateOrder: 'ymd' })).toBe('2026-04-03');
  });

  it('takes the year from the plan when the cell has none', () => {
    expect(read('03/04', { dateOrder: 'dmy', year: 2026 })).toBe('2026-04-03');
    expect(read('4-3', { dateOrder: 'mdy', year: 2025 })).toBe('2025-04-03');
  });

  it('will not invent a year', () => {
    expect(read('03/04', { dateOrder: 'dmy' })).toBeNull();
  });

  it('reads a four-digit year wherever it sits, whatever the plan says', () => {
    expect(read('2026/04/03', { dateOrder: 'dmy' })).toBe('2026-04-03');
    expect(read('03.04.2026', { dateOrder: 'dmy' })).toBe('2026-04-03');
  });

  it('turns a two-digit year into this century', () => {
    expect(read('03/04/26', { dateOrder: 'dmy' })).toBe('2026-04-03');
  });

  it('refuses a day or month that cannot exist, rather than rolling over', () => {
    expect(read('32/04/2026', { dateOrder: 'dmy' })).toBeNull();
    expect(read('13/03/2026', { dateOrder: 'mdy' })).toBeNull(); // month 13
    expect(read('03/13/2026', { dateOrder: 'mdy' })).toBe('2026-03-13'); // month first: the 13th of March
    expect(read('31/02/2026', { dateOrder: 'dmy' })).toBeNull();
    expect(read('', { dateOrder: 'dmy' })).toBeNull();
    expect(read('not a date', { dateOrder: 'dmy' })).toBeNull();
  });
});

describe('readAmount', () => {
  it('reads either decimal mark, as the plan says', () => {
    expect(readAmount('1.234,56', { decimal: ',' })).toBe(1234.56);
    expect(readAmount('1,234.56', { decimal: '.' })).toBe(1234.56);
    expect(readAmount('23,40', { decimal: ',' })).toBe(23.4);
    expect(readAmount('23.40', { decimal: '.' })).toBe(23.4);
  });

  it('keeps a sign the sheet wrote, in either notation', () => {
    expect(readAmount('-23,40', { decimal: ',' })).toBe(-23.4);
    expect(readAmount('(23,40)', { decimal: ',' })).toBe(-23.4);
  });

  it('points an unsigned column the way the person said', () => {
    expect(readAmount('23,40', { decimal: ',', sign: 'all_out' })).toBe(-23.4);
    expect(readAmount('23,40', { decimal: ',', sign: 'all_in' })).toBe(23.4);
  });

  it('never flips a sign the sheet was explicit about', () => {
    expect(readAmount('-23,40', { decimal: ',', sign: 'all_out' })).toBe(-23.4);
    expect(readAmount('-23,40', { decimal: ',', sign: 'all_in' })).toBe(-23.4);
  });

  it('drops the currency a cell carries with it', () => {
    expect(readAmount('23,40 €', { decimal: ',' })).toBe(23.4);
    expect(readAmount('€ 23,40', { decimal: ',' })).toBe(23.4);
  });

  it('is null on what is not a number, and on nothing', () => {
    expect(readAmount('', { decimal: ',' })).toBeNull();
    expect(readAmount('n/a', { decimal: ',' })).toBeNull();
    expect(readAmount(null, { decimal: ',' })).toBeNull();
  });
});

/**
 * End to end on the sheet that started this: a personal budget in Spanish with no year, no
 * minus signs and a column the bank dictionary has never heard of. Before a plan it was
 * "That file has no statement header this reads yet".
 */
describe('a budget sheet becomes sightings', () => {
  const sheet = [
    ['Mi presupuesto 2026'],
    [],
    ['Día', 'Gasto', 'Cuánto', 'Categoría'],
    ['03/04', 'Mercadona', '23,40', 'Comida'],
    ['05/04', 'Renfe', '1,70', 'Transporte'],
    ['11/04', 'Spotify', '11,99', 'Suscripción'],
    [],
  ];

  const plan = () => answeredPlan(
    sanitisePlan({ index: 2, columns: { date: 0, concept: 1, amount: 2, category: 3 }, dateOrder: 'dmy', decimal: ',', sign: 'signed' }, sheet),
    { sign: 'all_out', year: '2026', currency: 'EUR', dateOrder: 'dmy' },
  );

  it('asks the four things the sheet cannot say, then needs nothing more', () => {
    const before = planQuestions(sheet, sanitisePlan({ index: 2, columns: { date: 0, concept: 1, amount: 2 }, sign: 'signed' }, sheet));
    /* Every day in this sheet is 12 or under, so day-first and month-first both fit it and
       only its owner knows which was meant. */
    expect(before.map((q) => q.id).sort()).toEqual(['currency', 'dateOrder', 'sign', 'year']);
    expect(planQuestions(sheet, plan())).toEqual([]);
  });

  it('reads every row as money out, on the day it says, in the currency answered', () => {
    const { sightings, skipped } = toSightings(sheet, { accountId: 'acc-1', plan: plan() });
    expect(sightings).toHaveLength(3);
    expect(sightings.every((s) => s.direction === 'out')).toBe(true);
    expect(sightings.every((s) => s.currency === 'EUR')).toBe(true);
    expect(sightings.map((s) => s.amount)).toEqual([23.4, 1.7, 11.99]);
    expect(sightings.map((s) => s.occurred_at.slice(0, 10))).toEqual(['2026-04-03', '2026-04-05', '2026-04-11']);
    expect(sightings.map((s) => s.merchant_raw)).toEqual(['Mercadona', 'Renfe', 'Spotify']);
    expect(skipped.filter((s) => s.reason !== 'empty_row')).toEqual([]);
  });

  it('is the same evidence a bank export produces, so the reconciler cannot tell them apart', () => {
    const [one] = toSightings(sheet, { accountId: 'acc-1', plan: plan() }).sightings;
    expect(one.source).toBe('statement');
    expect(one.parse_confidence).toBe(0.95);
    expect(one.source_ref.startsWith('st:')).toBe(true);
    expect(one.merchant_key).toBeTruthy();
  });

  it('gives the same rows the same references twice, so a second upload does not double the month', () => {
    const a = toSightings(sheet, { accountId: 'acc-1', plan: plan() }).sightings.map((s) => s.source_ref);
    const b = toSightings(sheet, { accountId: 'acc-1', plan: plan() }).sightings.map((s) => s.source_ref);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });

  it('reads nothing at all without the year, rather than dating it to now', () => {
    const noYear = answeredPlan(sanitisePlan({ index: 2, columns: { date: 0, concept: 1, amount: 2 }, sign: 'signed' }, sheet), { sign: 'all_out' });
    const { sightings, skipped } = toSightings(sheet, { accountId: 'acc-1', plan: noYear });
    expect(sightings).toHaveLength(0);
    expect(skipped.filter((s) => s.reason === 'no_date')).toHaveLength(3);
  });
});

/**
 * A budget is not a ledger.
 * "Madrid Budget.xlsx", a real one sent on WhatsApp (2026-09-25): a column per category with
 * the amounts stacked under each, eighteen headings, and not one date in the whole file.
 * Every figure in it is true and none of it can enter a ledger that places each payment on
 * the day it happened. The plan must refuse it rather than invent a date column, and the
 * upload must say which of those two things went wrong.
 */
describe('a budget with no dates in it', () => {
  const madrid = [
    ['Money', 'Groceries', 'Club', 'Taxi o metro o bici', 'Comida Afuera', 'Betway', 'Winnings'],
    ['800.00', '', '', '', '', '', ''],
    ['824.05', '20.26', '37.50', '136.11', '28.00', '45.00', '66.10'],
    ['', '35.56', '45.00', '6.80', '13.71', '25.00', '9.48'],
    ['', '45.00', '130.00', '7.65', '24.30', '50.00', '50.00'],
    ['Total Spend living', '119.78', '212.50', '150.56', '235.55', '680.00', '742.91'],
  ];

  it('has no plan, because there is no day to put anything on', () => {
    /* Even handed the likeliest reading a model could offer, there is no date column to
       name, and a plan without one is not a ledger. */
    expect(sanitisePlan({ index: 0, columns: { concept: 0, amount: 1 } }, madrid)).toBeNull();
    expect(sanitisePlan({ index: 0, columns: { amount: 1 } }, madrid)).toBeNull();
  });

  it('will not be rescued by pointing date at a column of money', () => {
    /* A plan that calls Groceries the date parses no row: the guard is that every row is
       skipped for want of a date, not that the import half works. */
    const forced = sanitisePlan({ index: 0, columns: { date: 1, amount: 2 }, dateOrder: 'dmy', decimal: '.' }, madrid);
    const { sightings, skipped } = toSightings(madrid, { plan: forced });
    expect(sightings).toHaveLength(0);
    expect(skipped.every((s) => s.reason === 'no_date' || s.reason === 'empty_row')).toBe(true);
  });
});

/**
 * A PDF is a page, not a table.
 * =============================
 * Plenty of people have no CSV at all: the bank gives them a PDF, and that is what they have.
 * documentExtractionService already pulls the text out of one, with OCR behind it when the
 * page is a scan. What is missing is the step from that text to a grid, because everything
 * downstream -- the header dictionary, the model that reads the shape, the parser -- works on
 * rows and columns.
 *
 * A statement's columns are held apart by runs of spaces, so that is what splits them. A
 * single space never splits, or "EL CORTE INGLES" becomes three columns and the shop's name
 * is lost.
 */
describe('textGrid', () => {
  const statement = [
    'Banco Santander',
    'Extracto de cuenta  ES12 3456 **** 7516',
    '',
    'Fecha        Concepto                     Importe',
    '01/09/2026   PAGO MOVIL EN MERCADONA      -48,20',
    '04/09/2026   RECIBO SPOTIFY               -11,99',
    '30/09/2026   NOMINA SEPTIEMBRE            1.850,00',
  ].join('\n');

  it('splits columns on runs of spaces and keeps a shop name whole', () => {
    const rows = textGrid(statement);
    const header = rows.find((r) => r[0] === 'Fecha');
    expect(header).toEqual(['Fecha', 'Concepto', 'Importe']);
    const first = rows.find((r) => r[0] === '01/09/2026');
    expect(first).toEqual(['01/09/2026', 'PAGO MOVIL EN MERCADONA', '-48,20']);
  });

  it('is a grid the rest of the machinery can already read', () => {
    const rows = textGrid(statement);
    const plan = sanitisePlan({ index: rows.findIndex((r) => r[0] === 'Fecha'), columns: { date: 0, concept: 1, amount: 2 }, dateOrder: 'dmy', decimal: ',', sign: 'signed' }, rows);
    const { sightings } = toSightings(rows, { accountId: 'acc-1', plan });
    expect(sightings.map((s) => [s.occurred_at.slice(0, 10), s.direction, s.amount])).toEqual([
      ['2026-09-01', 'out', 48.2],
      ['2026-09-04', 'out', 11.99],
      ['2026-09-30', 'in', 1850],
    ]);
  });

  it('splits on a tab as readily as on spaces', () => {
    expect(textGrid('a\tb\tc')).toEqual([['a', 'b', 'c']]);
  });

  it('keeps blank lines out and does not lose the line after one', () => {
    const rows = textGrid('one  1\n\n\ntwo  2');
    expect(rows).toEqual([['one', '1'], ['two', '2']]);
  });

  it('survives a page of prose without pretending it is a table', () => {
    const rows = textGrid('This statement is issued by the bank.\nPlease keep it.');
    expect(rows.every((r) => r.length === 1)).toBe(true);
  });

  it('reads nothing out of nothing', () => {
    expect(textGrid('')).toEqual([]);
    expect(textGrid(null)).toEqual([]);
  });

  it('stops at a sane number of lines, because a PDF can be a book', () => {
    const many = Array.from({ length: 9000 }, (_, i) => `row  ${i}`).join('\n');
    expect(textGrid(many).length).toBeLessThanOrEqual(5000);
  });
});
