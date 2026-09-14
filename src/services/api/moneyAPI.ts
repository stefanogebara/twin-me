/**
 * Money v2 API client: the ledger, its receipts, what comes back on its own, this month, the sources.
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */
import { authFetch, getAuthHeaders, API_URL } from './apiBase';

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
  committed_items: { merchant_key: string; merchant_name?: string | null; typical_amount: number | string; next_expected: string }[];
  commitment_items?: { subject?: string | null; amount: number | string; due_on: string; check_status?: string | null }[];
  income_items?: { subject?: string | null; source?: string | null; amount: number | string; due_on: string }[];
  calendar_items?: { label?: string | null; title?: string | null; on: string; expected?: { amount: number | string } | null }[];
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
  amount: number | null; basis: 'income' | 'typical' | 'student_prior' | null; base?: number | null; keep?: number | null; budget: number | null; free: number | null; over: boolean;
  days_left: number | null; today_events: { title: string; amount: number }[]; sentence: string | null; why: string | null;
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
export type MoneyAnswer = {
  questionId?: string; kind: string; subject?: string; subjectLabel?: string;
  value?: string; amount?: number; day?: number; share?: number;
  /** Their own words, when a choice was not enough. */
  note?: string;
};
export type MoneyAccount = {
  id: string; provider: string; name: string | null; iban_mask: string | null; currency: string; consent_expires_at: string | null; last_pulled_at: string | null; needs_reconnect?: boolean; bank_name?: string | null;
  /** The bank's own figure for what is in the account, read with the person present; the type says what it counts. */
  balance?: number | string | null; balance_type?: string | null; balance_at?: string | null;
};
/** A pasted calendar link: Canvas, Blackboard, or any .ics. Only ever a label and a link. */
export type MoneyCalendarFeed = { id: string; kind: string; label: string; added_at: string | null };
export type MoneyCalendar = { connected: boolean; google?: boolean; feeds?: MoneyCalendarFeed[]; needsReconnect?: boolean; routine?: string | null; total_expected?: number | null; ahead?: unknown[] };
/** The two banks the product offers by name; the aggregator lists more, by country. */
export const BANKS = [{ name: 'Banco Santander', label: 'Santander' }, { name: 'Revolut', label: 'Revolut' }] as const;
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

export const moneyAPI = {
  forecast: () => authFetch('/money/forecast').then((r) => json<MoneyForecast>(r)),
  ledger: (since?: string) => authFetch(`/money/ledger${since ? `?since=${encodeURIComponent(since)}` : ''}`).then((r) => json<MoneyTransaction[]>(r)),
  sightings: (id: string) => authFetch(`/money/transactions/${id}/sightings`).then((r) => json<MoneySighting[]>(r)),
  verdict: (id: string, verdict: 'worth_it' | 'not_me' | null) =>
    authFetch(`/money/transactions/${id}/verdict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verdict }) }).then((r) => json<MoneyTransaction>(r)),
  recurring: () => authFetch('/money/recurring').then((r) => json<MoneyRecurring[]>(r)),
  months: () => authFetch('/money/months').then((r) => json<MoneyMonth[]>(r)),
  readings: (refresh = false) => authFetch(`/money/readings${refresh ? '?refresh=1' : ''}`).then((r) => json<MoneyReading[]>(r)),
  readingVerdict: (id: string, verdict: 'true' | 'not_me' | null) =>
    authFetch(`/money/readings/${id}/verdict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verdict }) }).then((r) => json<MoneyReading>(r)),
  budget: () => authFetch('/money/bank/budget').then((r) => json<MoneyBudget>(r)),
  today: () => authFetch('/money/today').then((r) => json<MoneyToday>(r)),
  usage: () => authFetch('/money/usage').then((r) => json<MoneyUsage>(r)),
  categories: (month?: string) => authFetch(`/money/categories${month ? `?month=${encodeURIComponent(month)}` : ''}`).then((r) => json<MoneyCategories>(r)),
  places: () => authFetch('/money/places').then((r) => json<MoneyPlace[]>(r)),
  /** The person's word on what kind of place a merchant is; null clears it. */
  setPlaceCategory: (merchantKey: string, category: string | null, name?: string) =>
    authFetch(`/money/places/${encodeURIComponent(merchantKey)}/category`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, name }) }).then((r) => json<unknown>(r)),
  /** The kinds of place the product knows, for a person to pick from. */
  CATEGORIES: ['groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health', 'pharmacy', 'sport', 'education', 'clothing', 'home', 'rent', 'electronics', 'entertainment', 'software', 'advertising', 'travel', 'lodging', 'cash', 'fees', 'bills', 'other'] as const,
  lookupPlaces: (limit = 12) =>
    authFetch('/money/places/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit }) })
      .then((r) => json<{ looked: number; placed: number; left: number; provider: string }>(r)),
  /**
   * A statement export, for the months the bank's ninety-day window does not reach.
   * Raw fetch: authFetch always sets a JSON content type, and multipart needs the
   * browser to write its own boundary.
   */
  importStatement: async (file: File) => {
    const body = new FormData();
    body.append('file', file);
    const auth = getAuthHeaders() as unknown as Record<string, string>;
    const headers: Record<string, string> = {};
    if (auth.Authorization) headers.Authorization = auth.Authorization;
    const res = await fetch(`${API_URL}/money/statement`, { method: 'POST', headers, body, credentials: 'include' });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.success === false) throw new Error(payload?.error || 'That statement could not be read.');
    return payload.data as { read: number; created: number; attached: number; skipped: number };
  },
  questions: () => authFetch('/money/questions').then((r) => json<MoneyQuestions>(r)),
  /** One row of a list answer is one fact, so a list question sends one of these per row. */
  answerQuestion: (payload: MoneyAnswer) =>
    authFetch('/money/questions/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => json<MoneyFact>(r)),
  skipQuestion: (id: string) =>
    authFetch(`/money/questions/${encodeURIComponent(id)}/skip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => json<{ skipped: string }>(r)),
  facts: () => authFetch('/money/facts').then((r) => json<MoneyFact[]>(r)),
  /** Forget one thing they said; the question that produced it is asked again. */
  deleteFact: (id: string) => authFetch(`/money/facts/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<{ deleted: boolean }>(r)),
  accounts: () => authFetch('/money/bank/accounts').then((r) => json<MoneyAccount[]>(r)),
  connect: (bank = 'Banco Santander', country = 'ES') =>
    authFetch('/money/bank/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bank, country }) }).then((r) => json<{ url: string }>(r)),
  /** The person's own receipts address: forward a receipt or invoice there and it joins the ledger. */
  inbox: () => authFetch('/money/inbox').then((r) => json<{ address: string; domain: string; receiving: boolean }>(r)),
  /* The calendar lens: Google, or links pasted from Canvas and Blackboard. */
  calendar: () => authFetch('/money/calendar').then((r) => json<MoneyCalendar>(r)),
  calendarConnect: () => authFetch('/money/calendar/connect').then((r) => json<{ url: string }>(r)),
  addCalendarFeed: (url: string) =>
    authFetch('/money/calendar/feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).then((r) => json<MoneyCalendarFeed & { events: number | null; already: boolean }>(r)),
  removeCalendarFeed: (id: string) => authFetch(`/money/calendar/feed/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<unknown>(r)),
  /** Opening the page spends the read the schedule leaves for it, but only when one is due. */
  refreshIfStale: () => authFetch('/money/bank/refresh-if-stale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => json<{ pulled: boolean; created?: number; reason?: string; needs_reconnect?: boolean }>(r)),
  pull: () => authFetch('/money/bank/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => json<{ account: string; seen: number; created: number }[]>(r)),
  /** A key for the phone: one of the user's API keys, shown once. */
  createCaptureKey: async () => {
    const res = await authFetch('/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Phone capture (Shortcut)' }) });
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
export function euro(n: number | string | null | undefined): string {
  const v = Math.abs(Number(n) || 0);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
export function shortDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
  history: () => authFetch('/money/chat/history').then((r) => json<ChatTurnKept[]>(r)),
  /** Run an offer the person tapped; the ledger checks it again and says what it did. */
  act: (action: ChatAction) =>
    authFetch('/money/chat/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).then((r) => json<{ done: boolean; said: string }>(r)),
  ask: (message: string, history: ChatTurn[]) =>
    authFetch('/money/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history: history.slice(-10) }) })
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
        const res = await authFetch('/money/chat/stream', {
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
              try { handlers.onEvent(JSON.parse(line.slice(5).trim()) as ChatStreamEvent); } catch { /* a torn line waits for the next chunk */ }
            }
            cut = buffer.indexOf('\n\n');
          }
        }
        ok = true;
      } catch {
        ok = false;
      } finally {
        handlers.onEnd(ok);
      }
    })();
    return () => control.abort();
  },
};
