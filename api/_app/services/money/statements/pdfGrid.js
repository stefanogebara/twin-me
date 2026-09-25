/**
 * A PDF page as rows and columns.
 * ===============================
 * unpdf's extractText merges a page into one string, so a real statement arrived as a single
 * line and every reader downstream saw one cell. pdf.js does hand back each run of text with
 * the position it was drawn at, and the page is rebuilt from those.
 *
 * The first rebuild (#596) split each line wherever the gap between runs was wider than 1.8
 * of the line's characters. That held for a monospace page and failed on the realistic one
 * (2026-09-25): a statement printed from a bank's website, in Arial, with 12px of cell
 * padding and concepts that wrap. The gap between the value date and the concept was 9
 * points against a threshold of 9.5, so the two merged; the header "Fecha operacion" wrapped
 * onto a line of its own, so the header row lost its first column and every index shifted by
 * one; and a wrapped concept sat 6 points above and below its row's baseline, because table
 * cells are middle-aligned, so each half became a row with no date. 6 of 22 movements read,
 * with a date where the shop's name should be.
 *
 * So columns are no longer decided line by line. A table's columns are where its dated rows
 * never have ink: every date starts at one x, every amount ends at one x, and the space
 * between them is empty on every row. The union of the text on the dated rows gives the
 * columns; the gaps in that union are the boundaries; and every line, header included, is
 * cut on those same boundaries, so a cell's index means the same thing on every row. A line
 * with no date whose text sits only in a column of free text is the wrapped end of a concept,
 * and it joins the dated row it is nearest to, above or below.
 *
 * rowsFromPages is pure and carries all of it; pdfGrid only reads the file.
 */

/** Two runs of text are on the same line when their baselines are within this many points. */
export const LINE_TOLERANCE = 2.5;
/** Runs closer than this many ems are one piece of text; a word space is about a quarter em. */
export const CHUNK_EM = 0.5;
/** An x-range empty on every dated row and at least this many ems wide separates two columns. */
export const CORRIDOR_EM = 0.5;
/** A wrapped line sits within this many line heights of the row it belongs to. */
export const WRAP_LINES = 1.6;
/** A statement is not a book. */
export const MAX_PDF_ROWS = 5000;

/* The first cell of a dated row: day and month in any order a statement prints them, with or
   without a year, or a month written as a word. */
const DATE_CELL = /^(?:\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[\s/.-](?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic|jan|apr|aug|dec)[a-z]*\.?(?:[\s/.-]\d{2,4})?)$/i;
/* A figure as a statement prints one: signs, brackets, thousands separators, a currency. */
const AMOUNT_CELL = /^[-+(]?\s*[\u20ac$\u00a3]?\s*-?\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d{1,2})?\s*(?:\u20ac|\$|\u00a3|EUR|USD|GBP)?\s*\)?\s*-?$/i;

const median = (xs) => {
  const s = xs.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

/** Runs of one page, with their extent and size; whitespace and unplaced runs dropped. */
export function runsFromItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((i) => {
      const str = String(i?.str ?? '');
      const x = Number(i?.x);
      const width = Number(i?.width) > 0 ? Number(i.width) : 0;
      return { str, x0: x, x1: x + width, y: Number(i?.y), h: Number(i?.height) > 0 ? Number(i.height) : 0 };
    })
    .filter((r) => r.str.trim() && Number.isFinite(r.x0) && Number.isFinite(r.y));
}

/**
 * Lines of one page, top to bottom, each a list of chunks (runs joined where they are closer
 * than half an em). pdf.js counts y upward, so a descending sort is reading order.
 */
export function linesFromRuns(runs, { tolerance = LINE_TOLERANCE, em = 10 } = {}) {
  const lines = [];
  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x0 - b.x0)) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - run.y) <= tolerance) line.runs.push(run);
    else lines.push({ y: run.y, runs: [run] });
  }
  return lines.map((line) => {
    const ordered = line.runs.sort((a, b) => a.x0 - b.x0);
    const size = median(ordered.map((r) => r.h).filter((h) => h > 0)) || em;
    const chunks = [];
    for (const run of ordered) {
      const last = chunks[chunks.length - 1];
      if (last && run.x0 - last.x1 <= CHUNK_EM * size) {
        last.str = `${last.str} ${run.str.trim()}`.replace(/\s+/g, ' ').trim();
        last.x1 = Math.max(last.x1, run.x1);
      } else {
        chunks.push({ str: run.str.trim(), x0: run.x0, x1: Math.max(run.x1, run.x0) });
      }
    }
    return { y: line.y, h: size, chunks };
  });
}

const dated = (line) => line.chunks.length > 0 && DATE_CELL.test(line.chunks[0].str);

/**
 * The columns of a table: the union of the text on its dated rows, cut at every x-range that
 * is empty on all of them and wide enough not to be a space between words.
 */
export function columnBands(lines, { em = 10 } = {}) {
  const spans = lines.filter(dated).flatMap((l) => l.chunks.map((c) => [c.x0, c.x1])).sort((a, b) => a[0] - b[0]);
  const bands = [];
  for (const [x0, x1] of spans) {
    const last = bands[bands.length - 1];
    if (last && x0 - last.x1 < CORRIDOR_EM * em) last.x1 = Math.max(last.x1, x1);
    else bands.push({ x0, x1 });
  }
  return bands;
}

/** The band a chunk belongs to: most overlap, or the nearest band when it overlaps none. */
function bandOf(chunk, bands) {
  let best = -1; let most = 0;
  bands.forEach((b, i) => {
    const overlap = Math.min(chunk.x1, b.x1) - Math.max(chunk.x0, b.x0);
    if (overlap > most) { most = overlap; best = i; }
  });
  if (best >= 0) return best;
  const centre = (chunk.x0 + chunk.x1) / 2;
  let nearest = 0; let distance = Infinity;
  bands.forEach((b, i) => {
    const d = centre < b.x0 ? b.x0 - centre : centre > b.x1 ? centre - b.x1 : 0;
    if (d < distance) { distance = d; nearest = i; }
  });
  return nearest;
}

/** What a column holds on the dated rows: dates, figures, or free text. */
function bandKinds(rows, width) {
  return Array.from({ length: width }, (_, i) => {
    const cells = rows.map((r) => r.cells[i]).filter(Boolean);
    if (!cells.length) return 'empty';
    const share = (re) => cells.filter((c) => re.test(c)).length / cells.length;
    if (share(DATE_CELL) >= 0.5) return 'date';
    if (share(AMOUNT_CELL) >= 0.5) return 'amount';
    return 'text';
  });
}

/**
 * One page's lines cut on the table's bands, with every wrapped line joined to its row.
 * A line is the wrapped end of a concept when it carries no date and all its text sits in a
 * column of free text; a header ("Fecha valor", "Importe") has text in a date or amount
 * column and is never swallowed into the row below it.
 */
function pageRows(lines, bands) {
  const rows = lines.map((line) => {
    const parts = bands.map(() => []);
    for (const chunk of line.chunks) parts[bandOf(chunk, bands)].push({ y: line.y, x: chunk.x0, str: chunk.str });
    return { y: line.y, h: line.h, dated: dated(line), top: line.y, bottom: line.y, parts };
  });
  const cellText = (parts) => parts.map((p) => p.sort((a, b) => b.y - a.y || a.x - b.x).map((c) => c.str).join(' ').trim());
  for (const r of rows) r.cells = cellText(r.parts);

  const datedRows = rows.filter((r) => r.dated);
  const kinds = bandKinds(datedRows, bands.length);
  const lineHeight = 1.25 * (median(rows.map((r) => r.h)) || 10);

  const candidates = rows.filter((r) => !r.dated && r.cells.some(Boolean)
    && r.cells.every((c, i) => !c || kinds[i] === 'text'));
  /* Nearest first, so a concept wrapped over three lines grows outward from its row. */
  const reach = (c, row) => (c.y > row.top ? c.y - row.top : c.y < row.bottom ? row.bottom - c.y : 0);
  const pairs = [];
  for (const c of candidates) for (const row of datedRows) pairs.push({ c, row });
  const taken = new Set();
  for (;;) {
    let best = null; let bestReach = Infinity;
    for (const { c, row } of pairs) {
      if (taken.has(c)) continue;
      const d = reach(c, row);
      if (d < bestReach) { bestReach = d; best = { c, row }; }
    }
    if (!best || bestReach > WRAP_LINES * lineHeight) break;
    const { c, row } = best;
    c.parts.forEach((p, i) => row.parts[i].push(...p));
    row.top = Math.max(row.top, c.y);
    row.bottom = Math.min(row.bottom, c.y);
    taken.add(c);
  }
  return rows
    .filter((r) => !taken.has(r))
    .map((r) => cellText(r.parts))
    .filter((cells) => cells.some(Boolean));
}

/**
 * The pages of a PDF, as runs with positions, become one grid.
 * @param {{ str: string, x: number, y: number, width?: number, height?: number }[][]} pages
 * @returns {string[][]}
 */
export function rowsFromPages(pages, { maxRows = MAX_PDF_ROWS } = {}) {
  const perPage = (Array.isArray(pages) ? pages : []).map(runsFromItems);
  const em = median(perPage.flat().map((r) => r.h).filter((h) => h > 0)) || 10;
  const linesPerPage = perPage.map((runs) => linesFromRuns(runs, { em }));
  /* The same statement prints its columns at the same x on every page, so the bands are read
     from the dated rows of all of them at once and a short last page is cut like the first. */
  const bands = columnBands(linesPerPage.flat(), { em });
  const out = [];
  for (const lines of linesPerPage) {
    /* No dated rows anywhere: not a table this can cut, so each line keeps its own pieces
       and the header dictionary or the model can still look at it. */
    const rows = bands.length ? pageRows(lines, bands) : lines.map((l) => l.chunks.map((c) => c.str));
    for (const row of rows) {
      if (out.length >= maxRows) return out;
      out.push(row);
    }
  }
  return out;
}

/** One page's runs, for the tests and anything that has only one. */
export function rowsFromItems(items, opts) {
  return rowsFromPages([items], opts);
}

/**
 * The grid of a PDF.
 * @param {Buffer} buffer
 * @returns {Promise<string[][]>} empty when it has no text layer, which is a scan's answer
 */
export async function pdfGrid(buffer) {
  /* Lazy, so unpdf and its pdf.js stay out of every cold start that never sees a PDF. */
  const { getDocumentProxy } = await import('unpdf');
  const proxy = await getDocumentProxy(new Uint8Array(buffer));
  const pages = [];
  for (let n = 1; n <= proxy.numPages; n += 1) {
    const page = await proxy.getPage(n);
    const content = await page.getTextContent();
    pages.push((content?.items || [])
      .filter((i) => typeof i?.str === 'string')
      .map((i) => ({ str: i.str, x: i.transform?.[4], y: i.transform?.[5], width: i.width, height: i.height })));
  }
  return rowsFromPages(pages);
}
