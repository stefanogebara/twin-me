/**
 * Money v2, on the phone.
 * =======================
 * The same endpoints the web reads in `src/services/api/moneyAPI.ts`, over this app's
 * `authFetch` so a call refreshes the session rather than dropping the person at a login.
 *
 * Every route answers `{ success, data }`, so `json()` unwraps `data` and turns a failure
 * into an Error carrying the status. Nothing here computes a number: totals, shares,
 * projections and counts all arrive already worked out by the server, and the screen
 * only ever arranges them.
 */
import { authFetch } from './api';

export type TransactionVerdict = 'worth_it' | 'not_me' | null;
export type ReadingVerdict = 'true' | 'not_me' | null;

export type MoneyTransaction = {
  id: string;
  occurred_at: string;
  posted_at?: string | null;
  amount: number | string;
  currency?: string;
  merchant_raw: string | null;
  merchant_key: string;
  merchant_name?: string | null;
  category?: string | null;
  channel: string | null;
  card_last4?: string | null;
  is_recurring: boolean;
  verdict: TransactionVerdict;
};

export type MoneyCharge = {
  id: string;
  occurred_at: string;
  amount: number | string;
  verdict?: TransactionVerdict;
};

export type MoneyRecurring = {
  merchant_key: string;
  merchant_name?: string | null;
  cadence: string;
  typical_amount: number | string;
  occurrences: number;
  first_seen?: string;
  last_seen?: string;
  next_expected: string | null;
  is_subscription?: boolean;
  charges?: MoneyCharge[];
  total_paid?: number;
  day_of_month?: number | null;
};

/** A charge the ledger already knows is coming, named so the sentence can list it. */
export type MoneyCommitment = {
  merchant_key: string;
  merchant_name?: string | null;
  amount?: number | string;
  typical_amount?: number | string;
  due_on?: string;
  next_expected?: string;
};

export type MoneyForecast = {
  month: string;
  as_of?: string;
  days_left: number;
  spent: number;
  committed: number;
  expected: number;
  baseline_rest?: number;
  projected_p10: number;
  projected_p50: number;
  projected_p90: number;
  history_days?: number;
  received?: number;
  income_ahead?: number;
  committed_items?: MoneyCommitment[];
  commitment_items?: MoneyCommitment[];
};

export type MoneyMonth = {
  month: string;
  spent: number;
  received: number;
  lines: number;
  days_covered: number;
  days_in_month: number;
  complete: boolean;
};

export type MoneyReadingReceipt = {
  id: string;
  occurred_at: string;
  amount: number | string;
  merchant_raw: string | null;
  merchant_key: string;
  channel?: string | null;
};

export type MoneyReading = {
  id: string;
  kind: string;
  month?: string | null;
  sentence: string;
  detail: string | null;
  numbers?: Record<string, number | string>;
  evidence_count: number;
  verdict: ReadingVerdict;
  computed_at?: string;
  receipts: MoneyReadingReceipt[];
};

export type MoneyCategoryGroup = {
  category: string;
  known: boolean;
  spent: number;
  lines: number;
  share: number;
  merchants: { name: string; spent: number }[];
};

export type MoneyCategories = {
  month?: string | null;
  total: number;
  read: number;
  groups: MoneyCategoryGroup[];
};

export type MoneyQuestion = {
  id: string;
  kind: string;
  ask: string;
  help?: string | null;
  why: string;
  changes: string;
  input: string;
  optional?: boolean;
  subject?: string | null;
};

export type MoneyQuestions = {
  opening: MoneyQuestion[];
  fromLedger: MoneyQuestion[];
  answered: number;
};

type Envelope<T> = { success?: boolean; error?: string; data?: T };

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.success === false) {
    const err = new Error(body.error || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body.data as T;
}

function post(path: string, body: object): Promise<Response> {
  return authFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The first day of the current month, which is how the categories route wants a month. */
export function currentMonthStart(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

export const moneyApi = {
  forecast: () => authFetch('/money/forecast').then((r) => json<MoneyForecast>(r)),
  ledger: (since?: string) =>
    authFetch(`/money/ledger${since ? `?since=${encodeURIComponent(since)}` : ''}`).then((r) => json<MoneyTransaction[]>(r)),
  readings: () => authFetch('/money/readings').then((r) => json<MoneyReading[]>(r)),
  readingVerdict: (id: string, verdict: ReadingVerdict) =>
    post(`/money/readings/${encodeURIComponent(id)}/verdict`, { verdict }).then((r) => json<MoneyReading>(r)),
  transactionVerdict: (id: string, verdict: TransactionVerdict) =>
    post(`/money/transactions/${encodeURIComponent(id)}/verdict`, { verdict }).then((r) => json<MoneyTransaction>(r)),
  categories: (month?: string) =>
    authFetch(`/money/categories${month ? `?month=${encodeURIComponent(month)}` : ''}`).then((r) => json<MoneyCategories>(r)),
  recurring: () => authFetch('/money/recurring').then((r) => json<MoneyRecurring[]>(r)),
  questions: () => authFetch('/money/questions').then((r) => json<MoneyQuestions>(r)),
  months: () => authFetch('/money/months').then((r) => json<MoneyMonth[]>(r)),
};
