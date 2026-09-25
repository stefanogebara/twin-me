/**
 * A PDF page as rows and columns.
 * ===============================
 * The first rebuild split each line at gaps wider than 1.8 of its characters. It passed a
 * monospace page and failed a realistic one (2026-09-25): a statement printed from a bank's
 * website, Arial, 12px cell padding, concepts that wrap. 6 of 22 movements read, with a date
 * where the shop's name should be. Columns now come from the x-ranges that are empty on every
 * dated row, and a wrapped line joins the dated row it is nearest to.
 *
 * The two fixtures are real PDFs: extracto-web.pdf printed by Chrome from an HTML table (two
 * pages, wrapped concepts, middle-aligned cells, a header that wraps), extracto-mono.pdf by
 * cupsfilter from plain text. Their data is fictional.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rowsFromItems, rowsFromPages, columnBands, linesFromRuns, runsFromItems, pdfGrid, MAX_PDF_ROWS } from '../../../../api/_app/services/money/statements/pdfGrid.js';
import { findHeader, toSightings } from '../../../../api/_app/services/money/statements/importer.js';

const fixture = (name) => readFileSync(resolve(process.cwd(), 'tests/fixtures/statements', name));
const totals = (sightings) => ({
  out: Math.round(sightings.filter((s) => s.direction === 'out').reduce((n, s) => n + s.amount, 0) * 100) / 100,
  in: Math.round(sightings.filter((s) => s.direction === 'in').reduce((n, s) => n + s.amount, 0) * 100) / 100,
});

/* A run as pdf.js reports it: x and y of its baseline start, its width and font size. */
const run = (str, x, y, width, height = 10.5) => ({ str, x, y, width, height });

describe('a statement printed from a bank website', () => {
  it('reads every movement, with the totals the statement adds up to', async () => {
    const rows = await pdfGrid(fixture('extracto-web.pdf'));
    const { sightings } = toSightings(rows, { accountId: 'acc-1' });
    expect(sightings).toHaveLength(22);
    expect(totals(sightings)).toEqual({ out: 510.6, in: 1350 });
  });

  it('cuts the header on the same columns as the rows, though its first title wrapped away', async () => {
    const rows = await pdfGrid(fixture('extracto-web.pdf'));
    const header = findHeader(rows);
    expect(header.columns).toMatchObject({ valueDate: 1, concept: 2, amount: 3 });
    expect(rows[header.index]).toEqual(['', 'Fecha valor', 'Concepto', 'Importe', 'Saldo']);
  });

  it('joins a concept that wrapped above and below its row back into one cell', async () => {
    const rows = await pdfGrid(fixture('extracto-web.pdf'));
    const first = rows.find((r) => r[0] === '01/09/2026');
    expect(first[2]).toBe('PAGO MOVIL EN MERCADONA CALLE ALCALA, MADRID ES, TARJ. :*123456');
    expect(first.slice(3)).toEqual(['-48,20', '1151,80']);
  });

  it('takes the value date where it differs from the day of the operation', async () => {
    const { sightings } = toSightings(await pdfGrid(fixture('extracto-web.pdf')), { accountId: 'acc-1' });
    const cabify = sightings.find((s) => /cabify/i.test(s.merchant_raw || ''));
    expect(cabify.occurred_at.slice(0, 10)).toBe('2026-09-10');
  });

  it('reads the shops and the card the way a bank export of the same month would', async () => {
    const { sightings } = toSightings(await pdfGrid(fixture('extracto-web.pdf')), { accountId: 'acc-1' });
    const byDay = (d) => sightings.find((s) => s.occurred_at.startsWith(d));
    expect(byDay('2026-09-01').merchant_raw).toMatch(/^Mercadona/);
    expect(byDay('2026-09-01').card_last4).toBe('3456');
    expect(byDay('2026-09-02').card_last4).toBe('3456');
  });

  it('cuts the second page on the first page\'s columns', async () => {
    const rows = await pdfGrid(fixture('extracto-web.pdf'));
    const last = rows.find((r) => r[0] === '30/09/2026');
    expect(last).toEqual(['30/09/2026', '30/09/2026', 'NOMINA SEPTIEMBRE UNIVERSIDAD', '850,00', '2039,40']);
  });
});

describe('a monospace statement', () => {
  it('still reads, words kept together and columns apart', async () => {
    const rows = await pdfGrid(fixture('extracto-mono.pdf'));
    expect(rows.find((r) => r[0] === '02/09/2026')).toEqual(['02/09/2026', 'PAGO MOVIL EN MERCADONA, MADRID ES', '-48,20']);
    const { sightings, skipped } = toSightings(rows, { accountId: 'acc-1' });
    expect(sightings).toHaveLength(6);
    expect(totals(sightings)).toEqual({ out: 164.64, in: 1850 });
    expect(skipped).toHaveLength(0);
  });
});

describe('columnBands', () => {
  it('finds the columns where no dated row ever has ink', () => {
    const lines = linesFromRuns(runsFromItems([
      run('01/09/2026', 50, 700, 52), run('MERCADONA', 120, 700, 60), run('-48,20', 300, 700, 30),
      run('02/09/2026', 50, 680, 52), run('RENFE CERCANIAS MADRID', 120, 680, 120), run('-1,70', 306, 680, 24),
    ]), { em: 10.5 });
    const bands = columnBands(lines, { em: 10.5 });
    expect(bands.map((b) => [Math.round(b.x0), Math.round(b.x1)])).toEqual([[50, 102], [120, 240], [300, 330]]);
  });

  it('keeps a word space inside a column, however it falls', () => {
    const lines = linesFromRuns(runsFromItems([
      run('01/09/2026', 50, 700, 52), run('PAGO', 120, 700, 25), run('MOVIL', 148, 700, 30), run('-4,20', 300, 700, 25),
    ]), { em: 10.5 });
    expect(columnBands(lines, { em: 10.5 })).toHaveLength(3);
  });

  it('reads nothing from a page with no dated row', () => {
    expect(columnBands(linesFromRuns(runsFromItems([run('Terms and conditions', 50, 700, 90)])))).toEqual([]);
  });
});

describe('rowsFromItems', () => {
  const header = [run('Fecha', 50, 740, 25, 9), run('Concepto', 120, 740, 40, 9), run('Importe', 293, 740, 37, 9)];
  const body = [
    run('01/09/2026', 50, 700, 52), run('-48,20', 300, 700, 30),
    run('COMPRA EN MERCADONA', 120, 706, 110), run('CALLE ALCALA MADRID', 120, 694, 105),
    run('02/09/2026', 50, 670, 52), run('RENFE', 120, 670, 30), run('-1,70', 306, 670, 24),
  ];

  it('joins a middle-aligned wrapped concept to its own row, not the one before', () => {
    const rows = rowsFromItems([...header, ...body]);
    expect(rows).toContainEqual(['01/09/2026', 'COMPRA EN MERCADONA CALLE ALCALA MADRID', '-48,20']);
    expect(rows).toContainEqual(['02/09/2026', 'RENFE', '-1,70']);
  });

  it('never swallows the header into the first row', () => {
    const rows = rowsFromItems([...header, ...body]);
    expect(rows[0]).toEqual(['Fecha', 'Concepto', 'Importe']);
  });

  it('follows a concept wrapped over three lines below a top-aligned row', () => {
    const rows = rowsFromItems([
      run('01/09/2026', 50, 700, 52), run('LINE ONE', 120, 700, 50), run('-9,00', 305, 700, 25),
      run('LINE TWO', 120, 687, 50), run('LINE THREE', 120, 674, 60),
      run('02/09/2026', 50, 640, 52), run('NEXT', 120, 640, 30), run('-1,00', 305, 640, 25),
    ]);
    expect(rows).toContainEqual(['01/09/2026', 'LINE ONE LINE TWO LINE THREE', '-9,00']);
  });

  it('reads a page top to bottom, though pdf.js counts upward', () => {
    const rows = rowsFromItems([run('02/09/2026', 50, 680, 52), run('B', 120, 680, 8), run('01/09/2026', 50, 700, 52), run('A', 120, 700, 8)]);
    expect(rows.map((r) => r[0])).toEqual(['01/09/2026', '02/09/2026']);
  });

  it('gives a page with no table its lines as they are, for the model to look at', () => {
    expect(rowsFromItems([run('Dear customer,', 50, 700, 70), run('thank you', 50, 686, 45)])).toEqual([['Dear customer,'], ['thank you']]);
  });

  it('drops whitespace runs and runs with no position, and reads nothing from nothing', () => {
    expect(rowsFromItems([run('01/09/2026', 50, 700, 52), { str: '   ', x: 90, y: 700 }, { str: 'x', x: NaN, y: 700 }])).toEqual([['01/09/2026']]);
    expect(rowsFromItems([])).toEqual([]);
    expect(rowsFromItems(null)).toEqual([]);
  });

  it('stops at the row cap, because a PDF can be a book', () => {
    const many = Array.from({ length: 6000 }, (_, i) => run('01/09/2026', 50, 100000 - i * 20, 52));
    expect(rowsFromItems(many)).toHaveLength(MAX_PDF_ROWS);
  });
});

describe('rowsFromPages', () => {
  it('cuts a short last page on the columns of the whole statement', () => {
    const page = (y0, n) => Array.from({ length: n }, (_, i) => [run('0' + (i + 1) + '/09/2026', 50, y0 - i * 20, 52), run('SHOP', 120, y0 - i * 20, 30), run('-1,00', 305, y0 - i * 20, 25)]).flat();
    const rows = rowsFromPages([page(700, 5), [run('Total', 120, 700, 30), run('-5,00', 305, 700, 25)]]);
    expect(rows.at(-1)).toEqual(['', 'Total', '-5,00']);
  });
});
