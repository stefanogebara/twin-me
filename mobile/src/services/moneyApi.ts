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
import * as SecureStore from 'expo-secure-store';
import { authFetch } from './api';
import { API_URL, STORAGE_KEYS } from '../constants';
import type { ChatFigure } from '../ui/figures';

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
  /** What the calendar says is coming this month and what such things have cost before. */
  calendar_items?: MoneyCalendarItem[];
};

/** One upcoming calendar event the ledger can put a likely cost on. */
export type MoneyCalendarItem = {
  id?: string;
  title: string;
  start?: string;
  end?: string;
  location?: string | null;
  amount?: number | string | null;
  low?: number | null;
  high?: number | null;
  basis?: string | null;
};

/** GET /money/calendar: whether a calendar is connected and what the week ahead looks like. */
export type MoneyCalendar = {
  connected: boolean;
  ahead: MoneyCalendarItem[];
  free_days?: number | null;
  routine?: string | null;
  total_expected?: number | null;
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

/** A payment the ledger raised a question about, in the merchant's own spelling. */
export type MoneyAccount = {
  id: string; provider: string; name: string | null; iban_mask: string | null; currency: string;
  consent_expires_at: string | null; last_pulled_at: string | null;
  /** The bank ended the session: nothing can be read until the person authorises it again. */
  needs_reconnect?: boolean;
};
export type MoneyQuestionReceipt = {
  id: string;
  occurred_at: string;
  amount: number | string;
  merchant_raw: string | null;
};

export type MoneyQuestion = {
  id: string;
  kind: string;
  ask: string;
  help?: string | null;
  why: string;
  changes: string;
  /** 'text' | 'category' | 'choice:a,b,c' | 'list:name,amount,day' | 'list:source,amount,day' | 'list:what,share' */
  input: string;
  optional?: boolean;
  subject?: string | null;
  receipts?: MoneyQuestionReceipt[];
};

/** One thing the person told the ledger. A list answer makes one of these per row. */
export type MoneyFact = {
  id: string;
  kind: string;
  subject: string | null;
  subject_label: string | null;
  value: string | null;
  amount: number | string | null;
  day: number | null;
  share: number | null;
  check_status: string | null;
  check_note: string | null;
};

export type MoneyAnswer = {
  questionId?: string;
  kind: string;
  subject?: string;
  subjectLabel?: string;
  value?: string;
  amount?: number;
  day?: number;
  share?: number;
};

export type MoneyQuestions = {
  opening: MoneyQuestion[];
  fromLedger: MoneyQuestion[];
  answered: number;
};


/* ----------------------------------------------------------------------------------------
 * The chat. One question in, one answer out, with the figures and receipts behind it.
 * -------------------------------------------------------------------------------------- */

export type ChatTurn = { role: 'user' | 'twin'; text: string };
export type ChatReceipt = { id: string; occurred_at: string; merchant: string; amount: number | string };
/** Something the twin proposes doing to the ledger; the person taps it, chatAct does it. */
export type ChatAction = { kind: string; label: string; payload?: Record<string, unknown> };
export type ChatReply = { text: string; figures?: ChatFigure[]; actions?: ChatAction[]; receipts?: ChatReceipt[] };
export type ChatActResult = { said: string };

/** Where the ledger thinks the person lives, read from where they shop, and what they confirmed. */
export type HomeGuess = {
  lat: number; lng: number; district: string; city?: string | null;
  confidence: 'good' | 'weak'; basis?: string | null;
};
export type HomeSaved = { district: string; city?: string | null; lat: number; lng: number };
export type MoneyHome = { guess: HomeGuess | null; saved: HomeSaved | null };
/** One place a search for a district or town returned. */
export type HomePlace = { id: string; label: string; secondary?: string | null; lat: number; lng: number };
/** What React Native's Image needs to fetch a picture that sits behind the session. */
export type ImageSource = { uri: string; headers?: Record<string, string> };
export type { ChatFigure };

/** One event from GET /money/stream, the pipeline reading the ledger step by step. */
export type LedgerStreamEvent = {
  step: string; label: string; state: 'working' | 'done' | 'failed';
  ms?: number; detail?: string | null; count?: number | null; done?: boolean;
};

/**
 * Read the ledger pipeline as it runs. React Native's fetch has no streaming body, so this
 * is an XMLHttpRequest read on progress: whatever complete "data:" lines have arrived are
 * parsed and handed on, the rest waits for the next chunk. Returns a function that stops it.
 */
/**
 * One Server-Sent Events reader, for every money stream. React Native's fetch cannot stream
 * a body, so this reads the response as it grows: complete "data:" blocks are parsed and
 * handed on, and a line torn across two chunks waits for the rest of itself. `open` is
 * handed the request with the session token, so a GET and a POST stream share this parser.
 */
function readSse<T>(
  open: (xhr: XMLHttpRequest, token: string | null) => void,
  onEvent: (e: T) => void,
  onEnd: (ok: boolean) => void,
): () => void {
  const xhr = new XMLHttpRequest();
  let seen = 0;
  let ended = false;
  const finish = (ok: boolean) => { if (!ended) { ended = true; onEnd(ok); } };
  const drain = () => {
    const text = xhr.responseText || '';
    const cut = text.lastIndexOf('\n\n');
    if (cut < seen) return;
    const fresh = text.slice(seen, cut + 2);
    seen = cut + 2;
    for (const block of fresh.split('\n\n')) {
      const line = block.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try { onEvent(JSON.parse(line.slice(5).trim()) as T); } catch { /* a torn line waits for the next chunk */ }
    }
  };
  xhr.onprogress = drain;
  xhr.onload = () => { drain(); finish(xhr.status >= 200 && xhr.status < 300); };
  xhr.onerror = () => finish(false);
  xhr.onabort = () => finish(false);
  void SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN).then((token) => {
    if (ended) return;
    open(xhr, token);
  }).catch(() => finish(false));
  return () => { if (!ended) { ended = true; xhr.abort(); } };
}

export function readLedgerStream(onEvent: (e: LedgerStreamEvent) => void, onEnd: (ok: boolean) => void): () => void {
  return readSse<LedgerStreamEvent>((xhr, token) => {
    xhr.open('GET', `${API_URL}/money/stream`);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send();
  }, onEvent, onEnd);
}

/** One answer, in the pieces the server sends. The phases arrive in this order. */
export type ChatStreamEvent =
  | { phase: 'reading' }
  | { phase: 'text'; delta: string }
  | { phase: 'figures'; figures?: ChatFigure[] }
  | { phase: 'actions'; actions?: ChatAction[]; receipts?: ChatReceipt[] }
  | { phase: 'done' }
  | { phase: 'failed'; detail?: string };

/**
 * Ask, and take the answer as it is written. `onEnd(false)` means the stream did not reach
 * its `done`, and the caller should ask the plain endpoint instead: a person waiting for an
 * answer should never pay for the fact that the fast path broke. Returns a stop function.
 */
export function chatStream(
  message: string,
  history: ChatTurn[],
  handlers: { onEvent: (e: ChatStreamEvent) => void; onEnd: (ok: boolean) => void },
): () => void {
  return readSse<ChatStreamEvent>((xhr, token) => {
    xhr.open('POST', `${API_URL}/money/chat/stream`);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(JSON.stringify({ message, history: history.slice(-10) }));
  }, handlers.onEvent, handlers.onEnd);
}

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


/** What today can carry, and the words for how it was worked out. */
export type MoneyToday = {
  amount: number | null;
  basis: 'income' | 'typical' | null;
  budget: number | null;
  free: number | null;
  over: boolean;
  days_left: number | null;
  today_events: { title: string; amount: number }[];
  sentence: string | null;
  why: string | null;
};

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
  accounts: () => authFetch('/money/bank/accounts').then((r) => json<MoneyAccount[]>(r)),
  questions: () => authFetch('/money/questions').then((r) => json<MoneyQuestions>(r)),
  /** One row of a list answer is one fact, so a list question sends one of these per row. */
  answerQuestion: (payload: MoneyAnswer) =>
    post('/money/questions/answer', payload).then((r) => json<MoneyFact>(r)),
  skipQuestion: (id: string) =>
    post(`/money/questions/${encodeURIComponent(id)}/skip`, {}).then((r) => json<{ skipped: string }>(r)),
  facts: () => authFetch('/money/facts').then((r) => json<MoneyFact[]>(r)),
  months: () => authFetch('/money/months').then((r) => json<MoneyMonth[]>(r)),
  /** Ask the ledger something in words. History is the last few turns, newest last. */
  chat: (message: string, history: ChatTurn[]) =>
    post('/money/chat', { message, history: history.slice(-10) }).then((r) => json<ChatReply>(r)),
  /** Do one of the things the twin proposed. */
  chatAct: (action: ChatAction) => post('/money/chat/act', { action }).then((r) => json<ChatActResult>(r)),
  /** The calendar lens: connected or not, and the week ahead with what it usually costs. */
  calendar: () => authFetch('/money/calendar').then((r) => json<MoneyCalendar>(r)),
  /** Where to send the person to connect their calendar. */
  calendarConnect: () => authFetch('/money/calendar/connect').then((r) => json<{ url: string }>(r)),
  /** Home: the ledger's guess from where the person shops, and what they have confirmed. */
  home: () => authFetch('/money/home').then((r) => json<MoneyHome>(r)),
  /** Districts and towns matching a few typed letters. */
  homeSearch: (q: string) =>
    authFetch(`/money/home/search?q=${encodeURIComponent(q)}`).then((r) => json<{ results: HomePlace[] }>(r)),
  /** The person confirms where home is. */
  saveHome: (spot: HomeSaved) => post('/money/home', spot).then((r) => json<{ said?: string | null }>(r)),
  /** The map picture for a spot. The route answers PNG bytes behind the session, so the
      Image is handed the token in its headers rather than a public URL. */
  today: () => authFetch('/money/today').then((r) => json<MoneyToday>(r)),
  /** Opening the app spends the read the schedule leaves for it, but only when one is due. */
  refreshIfStale: () => post('/money/bank/refresh-if-stale', {}).then((r) => json<{ pulled: boolean; created?: number; reason?: string; needs_reconnect?: boolean }>(r)),
  homeMapSource: async (lat: number, lng: number, zoom = 14): Promise<ImageSource> => {
    const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    const uri = `${API_URL}/money/home/map?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&zoom=${zoom}`;
    return token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri };
  },
};
