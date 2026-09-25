/**
 * A PDF page as rows and columns.
 * unpdf's extractText merges a page into one string, so a real statement arrived as a single
 * line and every reader downstream saw one cell (measured 2026-09-25). The layout is not lost
 * in the file, only in that call: pdf.js gives each run of text the position it was drawn at,
 * and the page is rebuilt from those.
 */
import { describe, it, expect } from 'vitest';
import { rowsFromItems, COLUMN_CHARS, LINE_TOLERANCE } from '../../../../api/_app/services/money/statements/pdfGrid.js';

/* 12pt Courier, as a real statement measured: a character is 7.2 points wide, so one space
   is a 7.2 gap and the two spaces that hold a column apart are 14.4. */
const CH = 7.2;
const run = (str, x, y) => ({ str, x, y, width: str.length * CH });
const after = (prev, spaces = 1) => prev.x + prev.width + spaces * CH;

describe('rowsFromItems', () => {
  it('keeps words together and breaks where the columns are', () => {
    const date = run('02/09/2026', 16, 700);
    const shop = run('PAGO MOVIL EN MERCADONA', after(date, 3), 700);
    const amount = run('-48,20', after(shop, 3), 700);
    expect(rowsFromItems([date, shop, amount])).toEqual([['02/09/2026', 'PAGO MOVIL EN MERCADONA', '-48,20']]);
  });

  it('joins runs a single space apart, so a shop name stays one cell', () => {
    const a = run('EL', 16, 700);
    const b = run('CORTE', after(a), 700);
    const c = run('INGLES', after(b), 700);
    expect(rowsFromItems([a, b, c])).toEqual([['EL CORTE INGLES']]);
  });

  it('reads a page top to bottom, though pdf.js counts upward', () => {
    const rows = rowsFromItems([run('second', 16, 680), run('first', 16, 700), run('third', 16, 660)]);
    expect(rows).toEqual([['first'], ['second'], ['third']]);
  });

  it('treats runs on one baseline as one line, within a tolerance', () => {
    const a = run('same', 16, 700);
    const b = run('line', after(a), 700 + LINE_TOLERANCE / 2);
    expect(rowsFromItems([a, b])).toEqual([['same line']]);
    const far = run('lower', after(a), 700 - LINE_TOLERANCE * 4);
    expect(rowsFromItems([a, far])).toHaveLength(2);
  });

  it('orders a line left to right however the runs arrive', () => {
    const first = run('AAA', 16, 700);
    const second = run('BBB', after(first, 3), 700);
    expect(rowsFromItems([second, first])).toEqual([['AAA', 'BBB']]);
  });

  it('scales the column rule with the type, not with a fixed gap', () => {
    /* The same shape at 24pt: a space is 14.4 and a column is 28.8, and neither should read
       differently from the 12pt page. */
    const big = (str, x, y) => ({ str, x, y, width: str.length * CH * 2 });
    const a = big('EL', 16, 700);
    const b = big('CORTE', a.x + a.width + CH * 2, 700);
    const c = big('-48,20', b.x + b.width + CH * 2 * 3, 700);
    expect(rowsFromItems([a, b, c])).toEqual([['EL CORTE', '-48,20']]);
  });

  it('falls back to a fixed gap when a run carries no width', () => {
    const a = { str: 'A', x: 16, y: 700 };
    const near = { str: 'B', x: 20, y: 700 };
    expect(rowsFromItems([a, near])).toEqual([['A B']]);
    const far = { str: 'C', x: 200, y: 700 };
    expect(rowsFromItems([a, far])).toEqual([['A', 'C']]);
  });

  it('drops whitespace runs and anything without a position', () => {
    expect(rowsFromItems([run('a', 16, 700), { str: '   ', x: 30, y: 700 }, { str: 'b', x: NaN, y: 700 }])).toEqual([['a']]);
    expect(rowsFromItems([])).toEqual([]);
    expect(rowsFromItems(null)).toEqual([]);
  });

  it('stops at the row cap, because a PDF can be a book', () => {
    const many = Array.from({ length: 6000 }, (_, i) => run('x', 16, 10000 - i * 10));
    expect(rowsFromItems(many, { maxRows: 5000 })).toHaveLength(5000);
  });

  it('breaks at COLUMN_CHARS characters and not before', () => {
    const a = run('AAA', 16, 700);
    const justUnder = run('B', a.x + a.width + CH * (COLUMN_CHARS - 0.3), 700);
    expect(rowsFromItems([a, justUnder])).toEqual([['AAA B']]);
    const justOver = run('B', a.x + a.width + CH * (COLUMN_CHARS + 0.3), 700);
    expect(rowsFromItems([a, justOver])).toEqual([['AAA', 'B']]);
  });
});
