/**
 * Money v2 API client: the ledger, its receipts, what comes back on its own, this month, the sources.
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */
import { authFetch, getAuthHeaders, getAccessToken, accessTokenReady, sessionExpected, API_URL } from './apiBase';

/* A money read made before the token exists waits for it (see accessTokenReady): the page now
   mounts ahead of the verify round trip, and a read that left first would 401 and paint a
   failed month over a kept snapshot (M2-A, 2026-09-22). */
const moneyFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  /* Only for a person the browser knows: a stranger's read has no token to wait for. */
  if (!getAccessToken() && sessionExpected()) await accessTokenReady();
  return authFetch(url, options);
};
import { moneyChanged } from './moneyChanges';

export type MoneyTransaction = {
  id: string; occurred_at: string; posted_at: string | null; amount: number | string; currency: string;
  merchant_raw: string | null; merchant_key: string; merchant_name: string | null; category: string | null;
  channel: string | null; card_last4: string | null; is_recurring: boolean; verdict: 'worth_it' | 'not_me' | null;
};
export type MoneySighting = { id: string; source: string; seen_at: string; raw_text: string | null; amount: number | string | null; currency: string | null; occurred_at: string | null; parse_confidence: number | string | null };
export type MoneyCharge = { id: string; occurred_at: string; amount: number; verdict: 'worth_it' | 'not_me' | null };
export type MoneyRecurring = {
  merchant_key: string; merchant_name?: string | null; cadence: string; typical_amount: number | string; occurrences: number;
  first_seen: string; last_seen: string; next_expected: string | null; is_subscription: boolean;
  platform?: string | null; uses?: number | null; cost_per_use?: number | null;
  charges?: MoneyCharge[]; total_paid?: number; day_of_month?: number | null;
};
export type MoneyForecast = {
  month: string; as_of: string; days_left: number; spent: number; committed: number; expected: number; baseline_rest: number;
  projected_p10: number; projected_p50: number; projected_p90: number; history_days: number;
  committed_items: { merchant_key: string; merchant_name?: string | null; typical_amount: number | string; next_expected: string; cadence?: string; occurrences?: number; last_seen?: string }[];
  commitment_items?: { subject?: string | null; amount: number | string; due_on: string; check_status?: string | null }[];
  income_items?: { subject?: string | null; source?: string | null; amount: number | string; due_on: string; basis?: string | null; confidence?: number | null; said?: boolean; times?: number | null; day?: number | null }[];
  calendar_items?: { title?: string | null; label?: string | null; day?: string; on?: string; amount?: number | string; expected?: { amount: number | string } | null }[];
  band_calibration?: { widen: number; days: number; coverage: number | null; trusted: boolean } | null;
  /** The last thirty days as marks: what each cost, and the range it was given the night before. */
  days?: MoneyDayStrip | null;
  /** The range given for tomorrow, widened by what the band has earned. */
  tomorrow?: { day: string; value: number; low: number; high: number } | null;
};
export type MoneyDayMark = {
  day: string; weekday: number; total: number; count: number; today: boolean;
  said: { value: number; low: number; high: number } | null; hit: boolean | null;
};
export type MoneyDayStrip = { from: string; to: string; days: MoneyDayMark[]; total: number; days_with_spend: number; said_days: number; held: number };
/** The month as a calendar (services/money/plan.js): every day a cell, computed. */
export type MoneySourceCounts = { by: Record<string, number>; month: { payments: number; named: number; timed: number } };
export type MoneyPlanItem = { kind: 'charge' | 'commitment' | 'income' | 'calendar'; label: string; amount: number; cadence?: string | null; said?: boolean; confidence?: number | null };
export type MoneyPlanCell = {
  day: string; dom: number; weekday: number; past: boolean; today: boolean;
  spent: number; count: number; received: number; said: { low: number; high: number } | null; hit: boolean | null;
  expected: number; items: MoneyPlanItem[]; rows: { id: string; merchant: string | null; amount: number; occurred_at: string }[];
  /* How many events the diary held that day, past days included. */
  events?: number;
  note: { id: string | null; text: string } | null;
};
/** One week of the term: how many events the diary held, or null where nothing was read. */
export type MoneyTermWeek = { start: string; end: string; offset: number; current: boolean; past: boolean; known: boolean; events: number | null };
export type MoneyTerm = {
  weeks: MoneyTermWeek[]; busiest: MoneyTermWeek | null; quietest: MoneyTermWeek | null;
  this_week: MoneyTermWeek | null; next_week: MoneyTermWeek | null; read_from: string; read_to: string;
};
export type MoneyPlan = {
  month: string; days_in_month: number; first_weekday: number; today: string | null; cells: MoneyPlanCell[];
  totals: { spent_to_day: number; expected_rest: number; income_ahead: number; days_ahead: number };
  peak: { day: string; amount: number } | null; line: string; term?: MoneyTerm | null;
};
export type MoneyMonth = {
  month: string; spent: number; spent_to_day?: number; received: number; lines: number; days_covered: number; days_in_month: number; complete: boolean;
  biggest: { id: string; merchant: string; amount: number } | null;
};
export type MoneyReading = {
  id: string; kind: string; month: string | null; sentence: string; detail: string | null;
  numbers: Record<string, number | string>; evidence_count: number; verdict: 'true' | 'not_me' | null; computed_at: string; first_seen_at?: string;
  receipts: { id: string; occurred_at: string; amount: number | string; merchant_raw: string | null; merchant_key: string; channel: string | null }[];
};
export type MoneyBudget = { used: number; left: number; resets_at: string | null };
/** Safe to spend today, with the basis it rests on; amount null until a month can be read. */
export type MoneyToday = {
  amount: number | null; basis: 'balance' | 'income' | 'typical' | 'student_prior' | null; base?: number | null; income?: number | null; keep?: number | null; budget: number | null; free: number | null; over: boolean;
  horizon?: { day: string | null; days: number; source: string | null } | null; balance?: { amount: number; banks: string[]; at: string } | null;
  days_left: number | null; today_events: { title: string; amount: number }[]; sentence: string | null; why: string | null;
  /* The standing charges that land today or tomorrow, already inside the day's number. */
  charges_soon?: { name: string | null; amount: number; when: 'today' | 'tomorrow' }[];
  /* The return windows on receipts that close within a week. */
  returns_closing?: { merchant: string; amount: number; until: string; days_left: number }[];
  /* What the screen needs to say the line itself, in the reader's own language. */
  basis_label?: string | null; spent?: number | null; committed?: number | null; calendar_ahead?: number | null;
  shape?: { weekday: number; ratio: number } | null;
};
/** What the ledger worked out on its own, from the payments alone (brain.js patterns). */
export type MoneyPattern = {
  kind: string; month: string | null; sentence: string; detail: string | null;
  numbers: Record<string, unknown>; evidence_count: number;
  receipts?: { id: string; occurred_at: string; amount: number | string; merchant_raw: string | null; merchant_key: string }[];
};
export type MoneyUsage = {
  findings: { kind: string; sentence: string; detail: string | null; numbers: Record<string, number | string>; evidence_count: number }[];
  unmeasurable: { merchant_key: string; name: string; typical_amount: number }[];
  measured: string[];
};
export type MoneyCategoryGroup = { category: string; known: boolean; spent: number; lines: number; share: number; merchants: { name: string; merchant_key?: string; spent: number }[] };
export type MoneyCategories = { month: string | null; total: number; read: number; groups: MoneyCategoryGroup[] };
export type MoneyPlace = {
  merchant_key: string; name: string; city: string | null; kind: string | null; category: string | null;
  lat: number | null; lon: number | null; confidence: number | null; spent: number; looked_up: boolean;
};
export type MoneyQuestionReceipt = { id: string; occurred_at: string; amount: number | string; merchant_raw: string | null; merchant_key: string };
/**
 * Something the ledger cannot work out for itself. `input` says how it should be answered:
 * 'text', 'category', 'choice:a,b,c', or 'list:name,amount,day' style, where a list answer
 * is one fact per row. `why` is shown to the person, because a question that cannot say
 * what it buys should not be asked.
 */
export type MoneyQuestion = {
  id: string; kind: string; ask: string; help?: string | null; why: string; changes: string;
  /** The same question in parts, so the page can ask it in the reader's own language. */
  say?: { key: string; vars: Record<string, string | number> } | null;
  input: string; optional?: boolean; subject?: string | null; receipts?: MoneyQuestionReceipt[];
};
export type MoneyQuestions = { opening: MoneyQuestion[]; fromLedger: MoneyQuestion[]; answered: number };
/** An answer, kept as a claim: `check_status` is the ledger's own verdict on it. */
export type MoneyFact = {
  id: string; kind: string; subject: string | null; subject_label: string | null;
  value: string | null; amount: number | string | null; day: number | null; share: number | null;
  check_status: string | null; check_note: string | null;
  /** Their own words on it, when a choice was not enough. */
  note?: string | null;
};
/** One result of a place search: a name and one line under it; a home hit also carries its point. */
export type PlaceHit = { id: string; label: string; secondary: string; lat?: number; lng?: number; kind?: string | null };

export type MoneyAnswer = {
  questionId?: string; kind: string; subject?: string; subjectLabel?: string;
  value?: string; amount?: number; day?: number; share?: number;
  /** Their own words, when a choice was not enough. */
  note?: string;
};
export type MoneyCard = { last4: string; type: 'credit' | 'debit' | 'unknown'; source: 'user' | null };
export type MoneyAccount = {
  cards?: MoneyCard[]; unidentified_card_payments?: number;
  id: string; provider: string; name: string | null; iban_mask: string | null; currency: string; consent_expires_at: string | null; last_pulled_at: string | null; needs_reconnect?: boolean; bank_name?: string | null;
  /** The bank's own figure for what is in the account, read with the person present; the type says what it counts. */
  balance?: number | string | null; balance_type?: string | null; balance_at?: string | null;
};
export type MoneyStatementAccount = Pick<MoneyAccount, 'id' | 'provider' | 'name' | 'iban_mask' | 'currency'>;
/** A pasted calendar link: Canvas, Blackboard, or any .ics. Only ever a label and a link. */
export type MoneyCalendarFeed = { id: string; kind: string; label: string; added_at: string | null };
export type MoneyCalendar = { connected: boolean; google?: boolean; feeds?: MoneyCalendarFeed[]; needsReconnect?: boolean; routine?: string | null; total_expected?: number | null; ahead?: unknown[]; learned?: { key?: string; label?: string; median?: number; occurrences?: number; paid?: number }[]; events_seen?: number; learned_at?: string | null };
/** The two banks the product offers by name; the aggregator lists more, by country. */
/* The names are Enable Banking's own for Spain; the labels are what a person calls the bank. */
export const BANKS = [{ name: 'Banco Santander', label: 'Santander' }, { name: 'Revolut', label: 'Revolut' }, { name: 'Banco de Sabadell', label: 'Sabadell' }] as const;
export function bankLabel(name: string | null | undefined): string {
  const b = BANKS.find((x) => x.name === name);
  return b ? b.label : (name || 'Santander');
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    const err = new Error(body?.error || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body.data as T;
}

/** Load every page before presenting the ledger, never silently the first 200 rows. */
async function completeLedger(since?: string): Promise<MoneyTransaction[]> {
  const rows: MoneyTransaction[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams();
    if (since) params.set('since', since);
    if (cursor) params.set('cursor', cursor);
    const res = await moneyFetch(`/money/ledger?${params}`);
    if (!res.ok) throw new Error('The complete ledger could not be loaded. Please retry.');
    const body = await res.json();
    if (!body.success || !Array.isArray(body.data)) throw new Error('Invalid ledger response');
    rows.push(...body.data);
    if (!body.next_cursor) return rows;
    if (body.next_cursor === cursor) throw new Error('The ledger could not advance. Please retry.');
    cursor = body.next_cursor;
  }
  throw new Error('Choose a shorter ledger date range.');
}

export type MoneyPage = {
  forecast: MoneyForecast | null; today: MoneyToday | null; ledger: MoneyTransaction[] | null; recurring: MoneyRecurring[] | null;
  accounts: MoneyAccount[] | null; months: MoneyMonth[] | null; readings: MoneyReading[] | null; categories: MoneyCategories | null;
  usage: MoneyUsage | null; capabilities: { bank: boolean; capture: boolean; whatsapp?: boolean } | null; inbox: { address: string; receiving: boolean } | null;
  facts: MoneyFact[] | null;
  /* Which sources saw each payment, by transaction id: the reconciliation, visible. */
  seen: Record<string, string[]> | null;
  /* What each source has given, and what it cannot give. */
  sources: MoneySourceCounts | null;
  failed: string[];
};

export const moneyAPI = {
  /* The page in one read: every part Today, Month and You share, and which could not be read. */
  page: (view: 'today' | 'month' | 'you') => moneyFetch(`/money/page?view=${view}`).then((r) => json<MoneyPage>(r)),
  forecast: () => moneyFetch('/money/forecast').then((r) => json<MoneyForecast>(r)),
  ledger: completeLedger,
  sightings: (id: string) => moneyFetch(`/money/transactions/${id}/sightings`).then((r) => json<MoneySighting[]>(r)),
  verdict: (id: string, verdict: 'worth_it' | 'not_me' | null) =>
    moneyFetch(`/money/transactions/${id}/verdict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verdict }) }).then((r) => json<MoneyTransaction>(r)).then(moneyChanged),
  recurring: () => moneyFetch('/money/recurring').then((r) => json<MoneyRecurring[]>(r)),
  months: () => moneyFetch('/money/months').then((r) => json<MoneyMonth[]>(r)),
  readings: (refresh = false) => moneyFetch(`/money/readings${refresh ? '?refresh=1' : ''}`).then((r) => json<MoneyReading[]>(r)),
  readingVerdict: (id: string, verdict: 'true' | 'not_me' | null) =>
    moneyFetch(`/money/readings/${id}/verdict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verdict }) }).then((r) => json<MoneyReading>(r)),
  budget: () => moneyFetch('/money/bank/budget').then((r) => json<MoneyBudget>(r)),
  today: () => moneyFetch('/money/today').then((r) => json<MoneyToday>(r)),
  plan: (month?: string | null) => moneyFetch(`/money/plan${month ? `?month=${encodeURIComponent(month)}` : ''}`).then((r) => json<MoneyPlan>(r)),
  /** A note on a day, in the person's words: a fact the ledger reads with everything else. */
  noteDay: (day: string, text: string) =>
    moneyFetch('/money/questions/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: null, kind: 'note', subject: `day-${day.slice(0, 10)}`, value: text }) }).then((r) => json<{ id?: string }>(r)),
  usage: () => moneyFetch('/money/usage').then((r) => json<MoneyUsage>(r)),
  /** What the ledger worked out on its own; computed on the read, nothing stored. */
  patterns: () => moneyFetch('/money/patterns').then((r) => json<{ findings: MoneyPattern[] }>(r)).then((d) => d.findings || []),
  categories: (month?: string) => moneyFetch(`/money/categories${month ? `?month=${encodeURIComponent(month)}` : ''}`).then((r) => json<MoneyCategories>(r)),
  places: () => moneyFetch('/money/places').then((r) => json<MoneyPlace[]>(r)),
  /** The person's word on what kind of place a merchant is; null clears it. */
  setPlaceCategory: (merchantKey: string, category: string | null, name?: string) =>
    moneyFetch(`/money/places/${encodeURIComponent(merchantKey)}/category`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, name }) }).then((r) => json<unknown>(r)),
  /** The kinds of place the product knows, for a person to pick from. */
  CATEGORIES: ['groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health', 'pharmacy', 'sport', 'education', 'clothing', 'home', 'rent', 'electronics', 'entertainment', 'software', 'advertising', 'travel', 'lodging', 'cash', 'fees', 'bills', 'other'] as const,
  lookupPlaces: (limit = 12) =>
    moneyFetch('/money/places/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit }) })
      .then((r) => json<{ looked: number; placed: number; left: number; provider: string }>(r)),
  /**
   * A statement export, for the months the bank's ninety-day window does not reach.
   * Raw fetch: authFetch always sets a JSON content type, and multipart needs the
   * browser to write its own boundary.
   */
  capabilities: () => moneyFetch('/money/capabilities').then((r) => json<{ bank: boolean; capture: boolean; whatsapp?: boolean }>(r)),
  statementAccounts: () => moneyFetch('/money/statement/accounts').then((r) => json<MoneyStatementAccount[]>(r)),
  createStatementAccount: (name: string) => moneyFetch('/money/statement/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then((r) => json<MoneyStatementAccount>(r)),
  importStatement: async (file: File, accountId: string) => {
    const body = new FormData();
    body.append('file', file);
    body.append('accountId', accountId);
    const auth = getAuthHeaders() as unknown as Record<string, string>;
    const headers: Record<string, string> = {};
    if (auth.Authorization) headers.Authorization = auth.Authorization;
    const res = await fetch(`${API_URL}/money/statement`, { method: 'POST', headers, body, credentials: 'include' });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.success === false) throw new Error(payload?.error || 'That statement could not be read.');
    moneyChanged(undefined);
    return payload.data as { read: number; created: number; attached: number; skipped: number };
  },
  questions: () => moneyFetch('/money/questions').then((r) => json<MoneyQuestions>(r)),
  /** Places to live in, by name (districts, towns), and where a person studies or works (campuses, offices). */
  homeSearch: (q: string) => moneyFetch(`/money/home/search?q=${encodeURIComponent(q)}`).then((r) => json<{ results: PlaceHit[] }>(r)).then((d) => d.results),
  placesSearch: (q: string) => moneyFetch(`/money/places/search?q=${encodeURIComponent(q)}`).then((r) => json<{ results: PlaceHit[] }>(r)).then((d) => d.results),
  saveHome: (hit: PlaceHit) =>
    moneyFetch('/money/home', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ district: hit.label, city: hit.secondary || undefined, lat: hit.lat, lng: hit.lng, place_id: hit.id, source: 'confirmed' }) }).then((r) => json<{ said: string; value: string }>(r)),
  /** One row of a list answer is one fact, so a list question sends one of these per row. */
  answerQuestion: (payload: MoneyAnswer) =>
    moneyFetch('/money/questions/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => json<MoneyFact>(r)).then(moneyChanged),
  skipQuestion: (id: string) =>
    moneyFetch(`/money/questions/${encodeURIComponent(id)}/skip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => json<{ skipped: string }>(r)),
  facts: () => moneyFetch('/money/facts').then((r) => json<MoneyFact[]>(r)),
  /** Forget one thing they said; the question that produced it is asked again. */
  deleteFact: (id: string) => moneyFetch(`/money/facts/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<{ deleted: boolean }>(r)).then(moneyChanged),
  labelCard: (accountId: string, last4: string, type: MoneyCard['type']) =>
    moneyFetch(`/money/bank/accounts/${encodeURIComponent(accountId)}/cards/${encodeURIComponent(last4)}/type`, { method: 'POST', body: JSON.stringify({ type }) }).then((r) => json<MoneyCard>(r)).then(moneyChanged),
  accounts: () => moneyFetch('/money/bank/accounts').then((r) => json<MoneyAccount[]>(r)),
  /** The whole account, gone: the users row, and every money table by cascade. */
  deleteAccount: () => moneyFetch('/account', { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error('That could not be deleted right now.'); }),
  /** Start a bank's consent; `back` is the money page to return to (Sources by default). */
  connect: (bank = 'Banco Santander', country = 'ES', back = '') =>
    moneyFetch('/money/bank/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bank, country, back }) }).then((r) => json<{ url: string }>(r)),
  /** The person's own receipts address: forward a receipt or invoice there and it joins the ledger. */
  inbox: () => moneyFetch('/money/inbox').then((r) => json<{ address: string; domain: string; receiving: boolean }>(r)),
  /* The calendar lens: Google, or links pasted from Canvas and Blackboard. */
  calendar: () => moneyFetch('/money/calendar').then((r) => json<MoneyCalendar>(r)),
  calendarConnect: () => moneyFetch('/money/calendar/connect').then((r) => json<{ url: string }>(r)),
  addCalendarFeed: (url: string) =>
    moneyFetch('/money/calendar/feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).then((r) => json<MoneyCalendarFeed & { events: number | null; already: boolean }>(r)),
  removeCalendarFeed: (id: string) => moneyFetch(`/money/calendar/feed/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<unknown>(r)),
  /** Opening the page spends the read the schedule leaves for it, but only when one is due. */
  refreshIfStale: () => moneyFetch('/money/bank/refresh-if-stale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => json<{ pulled: boolean; created?: number; reason?: string; needs_reconnect?: boolean }>(r)),
  pull: () => moneyFetch('/money/bank/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => json<{ account: string; seen: number; created: number }[]>(r)),
  /** A key for the phone: one of the user's API keys, shown once. */
  createCaptureKey: async () => {
    const res = await moneyFetch('/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Phone capture (Shortcut)' }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.key) throw new Error(body?.error || 'Could not create a key');
    return body.key as string;
  },
};

/**
 * Always two decimals. Dropping them above a thousand put "1750 €" directly above
 * "100,00 €" in a column of receipts, and a column that does not line up reads as a
 * mistake in the number rather than in the formatting.
 */
export function euro(n: number | string | null | undefined, currency = 'EUR'): string {
  const v = Math.abs(Number(n) || 0);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
export function shortDay(iso: string | null | undefined, locale?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  /* The language the pages are in, when the caller knows it; the browser's otherwise. A
     fixed 'en-GB' wrote "22 Sept" onto Portuguese pages (2026-09-16). */
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------ the conversation
   The same wire the phone reads: one question, the ledger's answer in pieces, the figures
   it asked for, and the payments it stands on. */
export type FigurePoint = { label: string; value: number; current?: boolean };
export type FigureShare = { label: string; value: number; share: number };
export type FigureRecurring = { label: string; amount: number; cadence: string; next?: string | null };
export type FigureDay = { label: string; value: number; today?: boolean };
export type FigureAhead = { label: string; day: string; amount: number; basis?: string | null };
export type ChatFigure =
  | { kind: 'week'; title?: string; days: FigureDay[] }
  | { kind: 'ahead'; title?: string; items: FigureAhead[] }
  | { kind: 'months'; title?: string; points: FigurePoint[] }
  | { kind: 'weekdays'; title?: string; points: FigurePoint[] }
  | { kind: 'history'; title?: string; points: FigurePoint[] }
  | { kind: 'shares'; title?: string; items: FigureShare[] }
  | { kind: 'recurring'; title?: string; items: FigureRecurring[] }
  | { kind: 'band'; title?: string; month?: string; spent: number; likely: number; low?: number; high?: number };
export type ChatReceipt = { id: string; occurred_at: string; merchant: string; amount: number | string };
export type ChatAction = { kind: string; label: string; [key: string]: unknown };
export type ChatTurn = { role: 'user' | 'twin'; text: string };
export type ChatReply = { text: string; figures?: ChatFigure[]; actions?: ChatAction[]; receipts?: ChatReceipt[]; basis?: string[]; thinking?: string | null };
/** One kept turn of the conversation, as the server hands it back. */
export type ChatTurnKept = { id: string; role: 'user' | 'twin'; text: string; figures?: ChatFigure[] | null; actions?: ChatAction[] | null; receipts?: ChatReceipt[] | null; thinking?: string | null; basis?: string[] | null; created_at: string };
/** One answer, in the pieces the server sends. The phases arrive in this order. */
/** What the ledger made of a file: a bank export, a receipt, one sentence kept, or nothing. */
export type ChatAttachment = { kind: 'statement' | 'receipt' | 'note' | 'nothing' | 'unreadable'; said: string; receipts: ChatReceipt[] };

export type ChatStreamEvent =
  | { phase: 'reading' }
  | { phase: 'text'; delta: string }
  | { phase: 'thinking'; delta: string }
  | { phase: 'figures'; figures?: ChatFigure[] }
  | { phase: 'actions'; actions?: ChatAction[]; receipts?: ChatReceipt[]; basis?: string[] }
  | { phase: 'done' }
  | { phase: 'failed'; detail?: string };

export const moneyChat = {
  /** The whole answer at once; the fallback when the stream is not there. */
  /** The conversation so far, oldest first. */
  history: () => moneyFetch('/money/chat/history').then((r) => json<ChatTurnKept[]>(r)),
  /**
   * A photo or a file for the ledger to read: a receipt, a bill, a contract, a bank export.
   * Multipart, so the browser sets its own boundary header; the note is what was typed
   * alongside it. Answers with one sentence and the payment it kept, if it kept one.
   */
  attach: (file: File | Blob, note: string, filename?: string) => {
    const form = new FormData();
    form.append('file', file, filename || (file instanceof File ? file.name : 'file'));
    if (note.trim()) form.append('note', note.trim());
    /* Not authFetch: it puts application/json on every request, and a multipart body needs
       the boundary header the browser writes itself. Only the bearer goes. */
    const { 'Content-Type': _json, ...headers } = getAuthHeaders();
    void _json;
    return fetch(`${API_URL}/money/chat/attach`, { method: 'POST', headers, body: form }).then((r) => json<ChatAttachment>(r)).then(moneyChanged);
  },
  /** Run an offer the person tapped; the ledger checks it again and says what it did. */
  act: (action: ChatAction) =>
    moneyFetch('/money/chat/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).then((r) => json<{ done: boolean; said: string }>(r)).then((r) => r.done ? moneyChanged(r) : r),
  ask: (message: string, history: ChatTurn[]) =>
    moneyFetch('/money/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history: history.slice(-10) }) })
      .then((r) => json<ChatReply>(r)),
  /**
   * The answer as it is written. A browser's fetch streams its body, so this reads the
   * "data:" blocks as they land and hands each to the caller. Returns a way to stop it;
   * a stopped stream ends with ok=false and the caller decides what to keep.
   */
  stream(message: string, history: ChatTurn[], handlers: { onEvent: (e: ChatStreamEvent) => void; onEnd: (ok: boolean) => void }): () => void {
    const control = new AbortController();
    (async () => {
      let ok = false;
      try {
        const res = await moneyFetch('/money/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ message, history: history.slice(-10) }),
          signal: control.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let cut = buffer.indexOf('\n\n');
          while (cut >= 0) {
            const block = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const line = block.split('\n').find((l) => l.startsWith('data:'));
            if (line) {
              try {
                const event = JSON.parse(line.slice(5).trim()) as ChatStreamEvent;
                if (event.phase === 'done') ok = true;
                if (event.phase === 'failed') ok = false;
                handlers.onEvent(event);
              } catch { /* a torn line waits for the next chunk */ }
            }
            cut = buffer.indexOf('\n\n');
          }
        }
      } catch {
        ok = false;
      } finally {
        handlers.onEnd(ok);
      }
    })();
    return () => control.abort();
  },
};
