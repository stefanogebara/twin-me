/**
 * Reading a sheet nobody designed for us.
 * =======================================
 * importer.js knows the exports a Spanish bank produces: "fecha operacion", "concepto",
 * "importe". A person who keeps their budget in Google Sheets writes "Día", "Gasto",
 * "Cuánto", or "What", "How much", and findHeader returns null, so the upload answered
 * "That file has no statement header this reads yet" and the file was a dead end.
 *
 * A model can read the shape of such a sheet. It must never read the figures. It is asked
 * which column is which and how the dates and amounts are written, and the same
 * deterministic parser that reads a bank export applies that plan, so every number in the
 * ledger is still one this code computed from the file. The model's answer is untrusted
 * input and passes through sanitisePlan before anything uses it.
 *
 * What a file cannot say about itself becomes a question. A column of amounts with no minus
 * sign anywhere cannot tell you whether it is money out; "03/04" cannot tell you the year,
 * or which half is the day. Those are planQuestions, and they are computed from the rows,
 * not asked of the model.
 *
 * Pure: a grid in, a plan and questions out.
 */

/** The fields the parser understands. Anything else a model returns is dropped. */
const FIELDS = ['date', 'valueDate', 'concept', 'amount', 'debit', 'credit', 'currency', 'category'];
const DATE_ORDERS = ['dmy', 'mdy', 'ymd'];
const DECIMALS = [',', '.'];
const SIGNS = ['signed', 'all_out', 'all_in', 'debit_credit'];
/* A ledger is about money someone has actually spent, so a year far from now is a typo or a
   misread column, not a payment. */
const EARLIEST_YEAR = 2000;
const LATEST_YEAR = 2100;
const CURRENCY = /^[A-Z]{3}$/;

const text = (v) => String(v ?? '').trim();
const cell = (row, at) => (at === undefined || !Array.isArray(row) ? '' : text(row[at]));

/**
 * A plan from a model, made safe.
 * @param {object} raw            what the model returned, untrusted
 * @param {string[][]} rows       the grid it is a plan for
 * @returns {object|null}         null when it is not a ledger: no date, or no money
 */
export function sanitisePlan(raw, rows) {
  if (!raw || typeof raw !== 'object') return null;
  const grid = Array.isArray(rows) ? rows.filter((r) => Array.isArray(r)) : [];
  const width = grid.reduce((w, r) => Math.max(w, r.length), 0);
  const index = Number(raw.index);
  /* A header row past the end reads a file with no rows in it, silently and for ever. */
  if (!Number.isInteger(index) || index < 0 || index >= grid.length) return null;

  const columns = {};
  const from = raw.columns && typeof raw.columns === 'object' ? raw.columns : {};
  for (const field of FIELDS) {
    const at = Number(from[field]);
    /* An index past the last column would read undefined out of every row, quietly, for the
       whole file. */
    if (Number.isInteger(at) && at >= 0 && at < width) columns[field] = at;
  }

  const hasDate = columns.date !== undefined || columns.valueDate !== undefined;
  const hasMoney = columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined;
  if (!hasDate || !hasMoney) return null;

  const split = columns.amount === undefined && (columns.debit !== undefined || columns.credit !== undefined);
  return {
    index,
    columns,
    dateOrder: DATE_ORDERS.includes(raw.dateOrder) ? raw.dateOrder : 'dmy',
    decimal: DECIMALS.includes(raw.decimal) ? raw.decimal : ',',
    sign: split ? 'debit_credit' : (SIGNS.includes(raw.sign) ? raw.sign : 'signed'),
    currency: CURRENCY.test(text(raw.currency)) ? text(raw.currency) : null,
    year: null,
    /* What the person has already settled. A question answered is not asked again, and
       "day first" answered looks exactly like "day first" defaulted without this. */
    answered: [],
  };
}

/** The rows under the header, ignoring blank ones. */
function bodyOf(rows, plan) {
  const all = Array.isArray(rows) ? rows : [];
  return all.slice(plan.index + 1).filter((r) => Array.isArray(r) && r.some((c) => text(c)));
}

/* A date cell's parts, whatever separates them. */
function parts(value) {
  const m = text(value).match(/(\d{1,4})\D(\d{1,2})(?:\D(\d{2,4}))?/);
  return m ? [m[1], m[2], m[3]].map((p) => (p === undefined ? null : Number(p))) : null;
}

/**
 * The questions the file cannot answer about itself.
 * @param {string[][]} rows
 * @param {object} plan                  from sanitisePlan
 * @param {object} [opts]
 * @param {string|null} [opts.accountCurrency]  what the account it is going into is kept in
 * @returns {{ id, asks, choices: { value, label }[] }[]}
 */
export function planQuestions(rows, plan, { accountCurrency = null } = {}) {
  if (!plan) return [];
  const settled = new Set(Array.isArray(plan.answered) ? plan.answered : []);
  const body = bodyOf(rows, plan);
  const out = [];

  /* Money out or money in. A budget sheet lists what things cost and never writes a minus,
     so the column is unsigned and only its owner knows which way it points. */
  if (!settled.has('sign') && plan.sign === 'signed' && plan.columns.amount !== undefined) {
    const amounts = body.map((r) => cell(r, plan.columns.amount)).filter(Boolean);
    const anySigned = amounts.some((a) => /^\s*[-(]/.test(a) || /-\s*$/.test(a));
    if (amounts.length && !anySigned) {
      out.push({
        id: 'sign',
        asks: 'Is this column what you spent, or what came in?',
        choices: [
          { value: 'all_out', label: 'Money out' },
          { value: 'all_in', label: 'Money in' },
          { value: 'signed', label: 'Both, and the minus signs say which' },
        ],
      });
    }
  }

  const dates = body.map((r) => cell(r, plan.columns.date ?? plan.columns.valueDate)).filter(Boolean);
  const read = dates.map(parts).filter(Boolean);

  /* The year. "03/04" is a day and a month and nothing else. */
  if (!settled.has('year') && read.length && read.every((p) => p[2] === null) && !text(plan.year)) {
    const now = new Date().getFullYear();
    out.push({
      id: 'year',
      asks: 'These dates carry no year. Which year is this?',
      choices: [now, now - 1, now - 2].map((y) => ({ value: String(y), label: String(y) })),
    });
  }

  /* Day first or month first, while both readings still fit every row. */
  if (!settled.has('dateOrder') && read.length) {
    const dmy = read.every((p) => p[0] >= 1 && p[0] <= 31 && p[1] >= 1 && p[1] <= 12);
    const mdy = read.every((p) => p[0] >= 1 && p[0] <= 12 && p[1] >= 1 && p[1] <= 31);
    if (dmy && mdy) {
      out.push({
        id: 'dateOrder',
        asks: `In ${dates[0]}, is ${read[0][0]} the day and ${read[0][1]} the month, or the other way round?`,
        choices: [
          { value: 'dmy', label: 'Day first' },
          { value: 'mdy', label: 'Month first' },
        ],
      });
    }
  }

  /* The currency, when neither the sheet nor the account it joins says. */
  if (!settled.has('currency') && plan.columns.currency === undefined && !plan.currency && !accountCurrency) {
    out.push({
      id: 'currency',
      asks: 'What currency are these in?',
      choices: [
        { value: 'EUR', label: 'Euro' },
        { value: 'USD', label: 'US dollar' },
        { value: 'GBP', label: 'Pound sterling' },
      ],
    });
  }
  return out;
}

/**
 * The plan with the person's answers applied. An answer that is not one of the choices is
 * ignored rather than guessed at.
 */
export function answeredPlan(plan, answers) {
  if (!plan) return plan;
  const a = answers && typeof answers === 'object' ? answers : {};
  const year = Number(a.year);
  const took = [];
  const take = (id, ok) => { if (ok) took.push(id); return ok; };

  const sign = take('sign', SIGNS.includes(a.sign)) ? a.sign : plan.sign;
  const dateOrder = take('dateOrder', DATE_ORDERS.includes(a.dateOrder)) ? a.dateOrder : plan.dateOrder;
  const currency = take('currency', CURRENCY.test(text(a.currency))) ? text(a.currency) : plan.currency;
  const yearOk = Number.isInteger(year) && year >= EARLIEST_YEAR && year <= LATEST_YEAR;
  const chosen = take('year', yearOk) ? year : plan.year;

  return {
    ...plan,
    sign,
    dateOrder,
    currency,
    year: chosen,
    answered: [...new Set([...(Array.isArray(plan.answered) ? plan.answered : []), ...took])],
  };
}

/**
 * The grid as a model sees it: its size, and a few rows with short cells. The whole file is
 * never sent -- a thousand rows say nothing more about the shape than ten do, and one long
 * note in a cell should not be able to carry the file out with it.
 */
export function describeGrid(rows, { sample = 12, cellLimit = 80 } = {}) {
  const all = Array.isArray(rows) ? rows.filter((r) => Array.isArray(r)) : [];
  const width = all.reduce((w, r) => Math.max(w, r.length), 0);
  return {
    rows: all.length,
    width,
    sample: all.slice(0, sample).map((r) => Array.from({ length: width }, (_, c) => text(r[c]).slice(0, cellLimit))),
  };
}

/* ------------------------------------------------------- applying the plan */

/** A real calendar day, or null: 31 February is a typo, not the 3rd of March. */
function ymd(year, month, day) {
  if (![year, month, day].every(Number.isInteger)) return null;
  if (year < EARLIEST_YEAR || year > LATEST_YEAR || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const at = new Date(Date.UTC(year, month - 1, day));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const century = (n) => (n < 100 ? 2000 + n : n);

/**
 * A date cell read the way the plan says.
 * @param {string|number} value
 * @param {object} plan  { dateOrder, year }
 * @returns {string|null} YYYY-MM-DD
 */
export function readDate(value, { dateOrder = 'dmy', year = null } = {}) {
  const t = text(value).replace(/ /g, ' ');
  if (!t) return null;

  const three = t.match(/^(\d{1,4})\D(\d{1,2})\D(\d{2,4})$/);
  if (three) {
    const [a, b, c] = [Number(three[1]), Number(three[2]), Number(three[3])];
    /* A four-digit year is unmistakable wherever it sits, and outranks the plan. */
    if (three[1].length === 4) return ymd(a, b, c);
    if (three[3].length === 4) return dateOrder === 'mdy' ? ymd(c, a, b) : ymd(c, b, a);
    if (dateOrder === 'ymd') return ymd(century(a), b, c);
    return dateOrder === 'mdy' ? ymd(century(c), a, b) : ymd(century(c), b, a);
  }

  const two = t.match(/^(\d{1,2})\D(\d{1,2})$/);
  if (two) {
    /* Without a year in the cell the plan must carry one; inventing this year would date a
       payment to a month it did not happen in. */
    if (!Number.isInteger(year)) return null;
    const [a, b] = [Number(two[1]), Number(two[2])];
    return dateOrder === 'mdy' ? ymd(year, a, b) : ymd(year, b, a);
  }
  return null;
}

/**
 * An amount cell read the way the plan says.
 * @param {string|number} value
 * @param {object} plan  { decimal, sign }
 * @returns {number|null}
 */
export function readAmount(value, { decimal = ',', sign = 'signed' } = {}) {
  if (value === null || value === undefined) return null;
  let t = text(value).replace(/ /g, ' ');
  if (!t) return null;

  /* Accountants' parentheses, and a trailing minus, both mean money leaving. */
  const bracketed = /^\(.*\)$/.test(t);
  t = t.replace(/[()]/g, '');
  const trailing = /-\s*$/.test(t);
  t = t.replace(/-\s*$/, '');
  /* The currency travels in the cell often enough to be worth dropping here. */
  t = t.replace(/[€$£]|\b[A-Za-z]{3}\b/g, '').trim();

  const thousands = decimal === ',' ? '.' : ',';
  const cleaned = t.split(thousands).join('').replace(decimal, '.').replace(/\s/g, '');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;

  let n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const explicit = bracketed || trailing || /^-/.test(cleaned);
  if (explicit) n = -Math.abs(n);
  /* An unsigned column points where its owner said it points, and an explicit sign is
     never overruled: a sheet that wrote the minus meant it. */
  else if (sign === 'all_out') n = -Math.abs(n);
  else if (sign === 'all_in') n = Math.abs(n);
  return n;
}
