/**
 * A PDF page as rows and columns.
 * ===============================
 * unpdf's extractText merges a page into one string: the newlines and the column gaps are
 * gone, so "Fecha Concepto Importe 02/09/2026 PAGO MOVIL EN MERCADONA -48,20 ..." arrives as
 * a single line and every reader downstream sees one cell (measured on a real statement,
 * 2026-09-25). The layout is not lost in the file, only in that call: pdf.js hands back each
 * run of text with the position it was drawn at.
 *
 * So the page is rebuilt from those positions. Items sharing a baseline are one row, ordered
 * left to right, and a gap wider than a few characters is a column boundary rather than a
 * space. That is what keeps "EL CORTE INGLES" one cell and "MERCADONA   -48,20" two.
 *
 * rowsFromItems is pure and carries the judgement; pdfGrid does the reading.
 */

/** Two runs of text are on the same line when their baselines are within this many points. */
export const LINE_TOLERANCE = 2.5;
/**
 * A gap counts as a column when it is wider than this many characters of the line's own
 * type. One space is one character, so 1.8 keeps words together and breaks on the two or
 * more spaces a statement uses to hold its columns apart. Measured on a real statement: at
 * 12pt Courier a character is 7.2 points, so a single space gap of 7.2 stays a space and a
 * double space of 14.4 becomes a column.
 */
export const COLUMN_CHARS = 1.8;
/** When a line's type cannot be measured, this many points instead. */
export const COLUMN_GAP = 12;
/** A statement is not a book. */
export const MAX_PDF_ROWS = 5000;

/**
 * Text runs with positions become rows of cells.
 * @param {{ str: string, x: number, y: number, width?: number }[]} items
 * @returns {string[][]}
 */
export function rowsFromItems(items, { lineTolerance = LINE_TOLERANCE, columnChars = COLUMN_CHARS, columnGap = COLUMN_GAP, maxRows = MAX_PDF_ROWS } = {}) {
  const runs = (Array.isArray(items) ? items : [])
    .map((i) => ({ str: String(i?.str ?? ''), x: Number(i?.x), y: Number(i?.y), width: Number(i?.width) || 0 }))
    .filter((i) => i.str.trim() && Number.isFinite(i.x) && Number.isFinite(i.y));
  if (!runs.length) return [];

  /* A page is drawn from the top down, and pdf.js counts y upward, so the lines come back in
     reverse. Sorting by descending y puts them in reading order. */
  const lines = [];
  for (const run of runs.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - run.y) <= lineTolerance) line.runs.push(run);
    else lines.push({ y: run.y, runs: [run] });
  }

  const rows = [];
  for (const line of lines.slice(0, maxRows)) {
    const ordered = line.runs.sort((a, b) => a.x - b.x);
    /* The line's own character width, so the rule holds at any font size. */
    const widths = ordered.map((r) => (r.width > 0 && r.str.length ? r.width / r.str.length : 0)).filter(Boolean).sort((a, b) => a - b);
    const perChar = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
    const breakAt = perChar ? perChar * columnChars : columnGap;

    const cells = [];
    let endOfLast = -Infinity;
    for (const run of ordered) {
      if (!cells.length || run.x - endOfLast > breakAt) cells.push(run.str.trim());
      else cells[cells.length - 1] = `${cells[cells.length - 1]} ${run.str.trim()}`.replace(/\s+/g, ' ').trim();
      endOfLast = run.x + run.width;
    }
    const kept = cells.map((c) => c.trim());
    if (kept.some(Boolean)) rows.push(kept);
  }
  return rows;
}

/**
 * The grid of a PDF, page by page.
 * @param {Buffer} buffer
 * @returns {Promise<string[][]>} empty when it has no text layer, which is a scan's answer
 */
export async function pdfGrid(buffer) {
  /* Lazy, so unpdf and its pdf.js stay out of every cold start that never sees a PDF. */
  const { getDocumentProxy } = await import('unpdf');
  const proxy = await getDocumentProxy(new Uint8Array(buffer));
  const out = [];
  for (let n = 1; n <= proxy.numPages && out.length < MAX_PDF_ROWS; n += 1) {
    const page = await proxy.getPage(n);
    const content = await page.getTextContent();
    const items = (content?.items || [])
      .filter((i) => typeof i?.str === 'string')
      .map((i) => ({ str: i.str, x: i.transform?.[4], y: i.transform?.[5], width: i.width }));
    out.push(...rowsFromItems(items, { maxRows: MAX_PDF_ROWS - out.length }));
  }
  return out;
}
