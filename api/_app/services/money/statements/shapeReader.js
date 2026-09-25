/**
 * Asking a model what a sheet's columns are.
 * ==========================================
 * The model receives a bounded sample, including its source values, to infer structure.
 * It is given the grid's size and at most a dozen
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
  'Identify columns and formatting from the sample. Never generate or repeat payment values in your answer.',
  'Answer with one JSON object and nothing else. No prose, no code fence.',
  'Keys: index (the 0-based row the column titles are on), columns (an object mapping any of date, valueDate, concept, amount, debit, credit, currency, category to a 0-based column number), dateOrder ("dmy", "mdy" or "ymd"), decimal ("," or ".").',
  'Do not infer money direction or a default currency; the person confirms anything the file cannot establish.',
  'concept is the column naming the shop, the person or what was bought. Omit any column that is not there; never guess a number for one.',
  'If the rows are not a list of payments, answer {"index":-1,"columns":{}}.',
].join('\n');

/** The one message the model is sent. Pure. */
export function shapePrompt(rows, { sample = 12 } = {}) {
  const grid = describeGrid(rows, { sample });
  if (!grid) return null;
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
  const prompt = shapePrompt(rows);
  if (prompt === null) return null;
  const reply = await complete({
    system: SHAPE_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 400,
    temperature: 0,
    userId,
    serviceName: 'statement-shape',
    /* Select the gateway's sensitive-content route. Provider retention policy is a
       separate configuration; this flag alone is not a no-training guarantee. */
    sensitiveContent: true,
  /* A model that will not answer is a file this cannot read, not a failed upload: the route
     falls back to the same refusal it gave before there was a model at all. Named, so a
     gateway that is down shows up as itself rather than as "unreadable sheet". */
  }).catch(quietly('statement/shape', () => null));
  return planFromReply(reply?.content ?? reply, rows);
}
