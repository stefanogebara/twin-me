/**
 * Asking a model what a sheet's columns are.
 * ==========================================
 * The model reads the shape and never the figures. It is given the grid's size and a dozen
 * rows and asked which column is the date, which is the amount, and how they are written; it
 * answers with indexes, and importer.js reads every number itself. So a sheet nobody
 * designed for us can enter the ledger without a single amount in it having been produced by
 * a model, which is the rule the whole product rests on.
 *
 * Its reply is untrusted: it passes through sanitisePlan, which drops fields it invented and
 * indexes that would read past the end of a row, and returns null when what came back is not
 * a ledger at all. A null means the file is refused, not guessed at.
 *
 * Pure except readShape, which takes its model call injected.
 */
import { describeGrid, sanitisePlan } from './shape.js';
import { quietly } from '../quietly.js';

export const SHAPE_SYSTEM = [
  'You read the first rows of a spreadsheet and say which column is which. You never read or repeat the values.',
  'Answer with one JSON object and nothing else. No prose, no code fence.',
  'Keys: index (the 0-based row the column titles are on), columns (an object mapping any of date, valueDate, concept, amount, debit, credit, currency, category to a 0-based column number), dateOrder ("dmy", "mdy" or "ymd"), decimal ("," or "."), sign ("signed" when the column already carries minus signs, "all_out" when every row is money spent, "all_in" when every row is money received).',
  'concept is the column naming the shop, the person or what was bought. Omit any column that is not there; never guess a number for one.',
  'If the rows are not a list of payments, answer {"index":-1,"columns":{}}.',
].join('\n');

/** The one message the model is sent. Pure. */
export function shapePrompt(rows, { sample = 12 } = {}) {
  const grid = describeGrid(rows, { sample });
  const lines = grid.sample.map((row, i) => `${i}: ${row.map((c, n) => `[${n}] ${c}`).join('  ')}`);
  return [
    `A spreadsheet of ${grid.rows} rows and ${grid.width} columns. The first ${grid.sample.length}:`,
    ...lines,
  ].join('\n');
}

/**
 * The model's reply, made into a plan or nothing. Pure.
 * @param {string} reply
 * @param {string[][]} rows
 */
export function planFromReply(reply, rows) {
  const text = String(reply ?? '');
  /* Models fence their JSON however the mood takes them; the object is what matters. */
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  return sanitisePlan(raw, rows);
}

/**
 * What the columns of this grid are, as far as a model can tell.
 * @param {string[][]} rows
 * @param {object} deps
 * @param {(args: object) => Promise<{ content?: string }>} deps.complete
 * @returns {Promise<object|null>} a sanitised plan, or null when it could not be read
 */
export async function readShape(rows, { complete, userId = null } = {}) {
  if (typeof complete !== 'function') return null;
  const reply = await complete({
    system: SHAPE_SYSTEM,
    messages: [{ role: 'user', content: shapePrompt(rows) }],
    maxTokens: 400,
    temperature: 0,
    userId,
    serviceName: 'statement-shape',
    /* A person's own spending, so it is never used to train and never logged in full. */
    sensitiveContent: true,
  /* A model that will not answer is a file this cannot read, not a failed upload: the route
     falls back to the same refusal it gave before there was a model at all. Named, so a
     gateway that is down shows up as itself rather than as "unreadable sheet". */
  }).catch(quietly('statement/shape', () => null));
  return planFromReply(reply?.content ?? reply, rows);
}
