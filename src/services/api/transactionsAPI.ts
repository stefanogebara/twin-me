/**
 * Transactions API Client (Financial-Emotional Twin, Phase 2A)
 */

import { authFetch, API_URL, getAuthHeaders } from './apiBase';

export interface EmotionalContext {
  hrv_score: number | null;
  recovery_score: number | null;
  sleep_score: number | null;
  music_valence: number | null;
  calendar_load: number | null;
  computed_stress_score: number | null;
  is_stress_shop_candidate: boolean | null;
  signals_found: number;
}

export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  merchant_raw: string;
  merchant_normalized: string | null;
  category: string | null;
  transaction_date: string;
  source_bank: string;
  account_type: 'checking' | 'credit_card' | 'savings';
  is_recurring?: boolean;
  created_at: string;
  emotional_context: EmotionalContext | null;
}

export interface CurrencyBreakdown {
  currency: string;
  outflow: number;
  inflow: number;
  count: number;
  stress_shop_total: number;
}

export interface TransactionsSummary {
  window_days: number;
  transaction_count: number;
  total_outflow: number;
  total_inflow: number;
  stress_shop_count: number;
  stress_shop_total: number;
  high_stress_outflow: number;
  emotional_spend_ratio: number | null;
  /** Phase 3 multi-currency breakdown. Sorted by outflow desc; [0] is dominant. */
  currencies?: CurrencyBreakdown[];
}

export interface TimelineDay {
  day: string;          // YYYY-MM-DD
  spend: number;        // outflow total (positive)
  stress_avg: number | null;  // 0–1 average stress score
  stress_shop_count: number;
  tx_count: number;
}

export interface UploadResult {
  success: boolean;
  format: string;
  source_bank: string;
  account_type: string | null;
  inserted: number;
  tagged?: number;
  tag_errors?: number;
  parse_errors: string[];
  file_hash: string;
  error?: string;
  detail?: string | string[];
}

/**
 * Upload a CSV or OFX file. Uses raw fetch (authFetch's body merging doesn't play
 * well with FormData).
 */
export async function uploadStatement(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  // Auth headers manually — don't set Content-Type so browser picks multipart boundary
  const authHeaders = getAuthHeaders() as Record<string, string>;
  const headers: Record<string, string> = {};
  if (authHeaders.Authorization) headers.Authorization = authHeaders.Authorization;

  const res = await fetch(`${API_URL}/transactions/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const json = await res.json().catch(() => ({} as UploadResult));
  if (!res.ok) {
    return {
      success: false,
      format: 'unknown',
      source_bank: 'unknown',
      account_type: null,
      inserted: 0,
      parse_errors: [],
      file_hash: '',
      error: (json as { error?: string }).error || `Upload failed (${res.status})`,
      detail: (json as { detail?: string | string[] }).detail,
    };
  }
  return json as UploadResult;
}

export async function listTransactions(opts: { limit?: number; offset?: number; accountType?: string } = {}): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  if (opts.accountType) params.set('account_type', opts.accountType);
  const q = params.toString();
  const res = await authFetch(`/transactions${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error(`Failed to load transactions (${res.status})`);
  const json = await res.json();
  return json.transactions || [];
}

export async function getTransactionsSummary(): Promise<TransactionsSummary | null> {
  const res = await authFetch('/transactions/summary');
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;
  const { success: _success, ...summary } = json;
  return summary as TransactionsSummary;
}

export async function retagTransactions(): Promise<{ tagged: number; errors: number }> {
  const res = await authFetch('/transactions/retag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Retag failed (${res.status})`);
  const json = await res.json();
  return { tagged: json.tagged || 0, errors: json.errors || 0 };
}

/* -------------------------------------------------------------------------- */
/* Pluggy real-time bank sync (Phase 3.2)                                     */
/* -------------------------------------------------------------------------- */

export interface BankConnection {
  id: string;
  provider?: 'pluggy' | 'plaid';
  connector_name: string;
  status: string;
  status_detail: unknown;
  last_synced_at: string | null;
  consent_expires_at: string | null;
  created_at: string;
}

export interface ConnectTokenResponse {
  success: boolean;
  connectToken?: string;
  environment?: 'sandbox' | 'production';
  error?: string;
  // audit-2026-05-08 C1: stable error code surfaced for UI fallback messaging
  code?: 'PLUGGY_NOT_CONFIGURED' | string;
}

/**
 * Request a short-lived (30min) Pluggy connect token to open the widget.
 * `itemId` is only passed when the user is reconnecting an existing item
 * (MFA / password change flow).
 */
export async function getPluggyConnectToken(itemId?: string): Promise<ConnectTokenResponse> {
  const res = await authFetch('/transactions/pluggy/connect-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itemId ? { itemId } : {}),
  });
  // audit-2026-05-08 C1: even on !ok we want to read the body so we can pick up
  // the structured `code` (e.g. PLUGGY_NOT_CONFIGURED -> graceful UI hint).
  let body: ConnectTokenResponse | null = null;
  try { body = await res.json(); } catch { /* non-JSON body is fine */ }
  if (!res.ok) {
    return {
      success: false,
      error: body?.error || `Failed to create connect token (${res.status})`,
      code: body?.code,
    };
  }
  return body || { success: false, error: 'empty response' };
}

/**
 * Webhook-delivery fallback: ask the backend to fetch the freshly-created
 * Pluggy item and ingest it into our DB. Identical to what the webhook does,
 * but invoked directly from the widget success callback so it works:
 *   (a) in local dev where Pluggy can't reach localhost
 *   (b) in production when a webhook is missed (idempotent — re-running is safe)
 */
export interface RegisterItemResponse {
  success: boolean;
  connection?: {
    id: string;
    connector_name: string;
    status: string;
    last_synced_at: string | null;
    pluggy_item_id: string;
    provider: string;
  };
  seededTransactions?: number | null;
  error?: string;
  code?: string;
}

export async function registerPluggyItem(itemId: string): Promise<RegisterItemResponse> {
  const res = await authFetch('/transactions/pluggy/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  });
  let body: RegisterItemResponse | null = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    return {
      success: false,
      error: body?.error || `register failed (${res.status})`,
      code: body?.code,
    };
  }
  return body || { success: false, error: 'empty response' };
}

export async function listBankConnections(): Promise<BankConnection[]> {
  const res = await authFetch('/transactions/pluggy/connections');
  if (!res.ok) return [];
  const json = await res.json();
  return json.connections || [];
}

export async function deleteBankConnection(id: string, provider?: string): Promise<boolean> {
  // Plaid disconnect lives on its own route; everything else goes through
  // the pluggy route. Frontend passes the provider from the row.
  const endpoint = provider === 'plaid'
    ? `/plaid/connections/${id}`
    : `/transactions/pluggy/connections/${id}`;
  const res = await authFetch(endpoint, { method: 'DELETE' });
  if (!res.ok) return false;
  const json = await res.json();
  return !!json.success;
}

export async function syncBankConnection(id: string, provider?: string): Promise<boolean> {
  // Each provider's sync route lives under its own router — dispatch here so
  // the caller doesn't have to know about the URL split.
  const endpoint = provider === 'plaid'
    ? `/plaid/sync/${id}`
    : `/transactions/pluggy/sync/${id}`;
  const res = await authFetch(endpoint, { method: 'POST' });
  if (!res.ok) return false;
  const json = await res.json();
  return !!json.success;
}

/* -------------------------------------------------------------------------- */
/* Plaid US bank sync (Phase 4.1)                                             */
/* -------------------------------------------------------------------------- */

export interface PlaidLinkTokenResponse {
  success: boolean;
  linkToken?: string;
  expiration?: string;
  error?: string;
  code?: 'PLAID_NOT_CONFIGURED' | string;
}

/**
 * Request a short-lived (30 min) Plaid link_token for the Link drawer SDK.
 * `accessToken` is only passed when reconnecting an existing item (Plaid's
 * "update mode" after ITEM_LOGIN_REQUIRED).
 */
export async function getPlaidLinkToken(opts: {
  products?: string[];
  countryCodes?: string[];
  accessToken?: string;
} = {}): Promise<PlaidLinkTokenResponse> {
  const res = await authFetch('/plaid/link/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  let body: PlaidLinkTokenResponse | null = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    return {
      success: false,
      error: body?.error || `link/token failed (${res.status})`,
      code: body?.code,
    };
  }
  return body || { success: false, error: 'empty response' };
}

export interface PlaidExchangeResponse {
  success: boolean;
  itemId?: string;
  inserted?: number;
  error?: string;
}

/**
 * Step 2 of the Plaid Link flow. Frontend POSTs the public_token from
 * Plaid Link's onSuccess callback. Server exchanges it for a permanent
 * access_token, encrypts + stores it, and kicks off initial transaction
 * sync. Returns the count of transactions inserted on this seed pass.
 */
export async function exchangePlaidPublicToken(publicToken: string): Promise<PlaidExchangeResponse> {
  const res = await authFetch('/plaid/link/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicToken }),
  });
  let body: PlaidExchangeResponse | null = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    return {
      success: false,
      error: body?.error || `link/exchange failed (${res.status})`,
    };
  }
  return body || { success: false, error: 'empty response' };
}

export async function syncPlaidConnection(id: string): Promise<boolean> {
  const res = await authFetch(`/plaid/sync/${id}`, { method: 'POST' });
  if (!res.ok) return false;
  const json = await res.json();
  return !!json.success;
}

export interface PlaidHolding {
  institutionName: string;
  accountId: string;
  accountName: string;
  accountMask: string | null;
  accountType: string;
  ticker: string | null;
  name: string;
  type: string | null;
  quantity: number;
  institutionPrice: number | null;
  costBasis: number;
  value: number;
  currency: string;
  gainLoss: number;
  gainLossPct: number;
}

export interface PlaidHoldingsResponse {
  success: boolean;
  holdings: PlaidHolding[];
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  currency: string;
  itemsScanned: number;
  itemsWithError: number;
  error?: string;
  code?: 'PLAID_NOT_CONFIGURED' | string;
}

export interface PlaidInvestmentEvent {
  id: string;
  ticker: string | null;
  name: string;
  type: string;                  // buy | sell | cash | fee | dividend | transfer
  rawCategory: string | null;
  amount: number;                // signed: negative = cash out (buy), positive = cash in (sell)
  currency: string;
  transactionDate: string;       // YYYY-MM-DD
  emotionalContext: {
    recoveryScore: number | null;
    musicValence: number | null;
    calendarLoad: number | null;
    sleepScore: number | null;
    computedStressScore: number | null;
    emotionLabel: string | null; // "low recovery (38%)" / "high stress (72%)" / null
  } | null;
}

export interface PlaidInvestmentActivityResponse {
  success: boolean;
  events: PlaidInvestmentEvent[];
  range?: { since: string; limit: number };
  error?: string;
}

/**
 * Recent investment events (buys/sells/dividends) joined with the
 * emotional-context fingerprint. The moat surface — ChatGPT Personal
 * Finance can show what you bought; this shows it alongside the Whoop
 * recovery score, music valence, and calendar load at the moment.
 */
export async function getPlaidInvestmentActivity(
  opts: { limit?: number; sinceDays?: number } = {},
): Promise<PlaidInvestmentActivityResponse> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.sinceDays) qs.set('sinceDays', String(opts.sinceDays));
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await authFetch(`/plaid/investment-activity${suffix}`);
  let body: PlaidInvestmentActivityResponse | null = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    return { success: false, events: [], error: body?.error || `failed (${res.status})` };
  }
  return body || { success: false, events: [], error: 'empty response' };
}

/**
 * Fetch the user's brokerage holdings aggregated across every linked Plaid
 * item. Empty result when nothing is connected — the card renders an
 * informative empty state in that case.
 */
export async function getPlaidHoldings(): Promise<PlaidHoldingsResponse> {
  const res = await authFetch('/plaid/holdings');
  let body: PlaidHoldingsResponse | null = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    return {
      success: false,
      holdings: [],
      totalValue: 0,
      totalCost: 0,
      totalGainLoss: 0,
      currency: 'USD',
      itemsScanned: 0,
      itemsWithError: 0,
      error: body?.error || `holdings failed (${res.status})`,
      code: body?.code,
    };
  }
  return body || {
    success: false,
    holdings: [],
    totalValue: 0,
    totalCost: 0,
    totalGainLoss: 0,
    currency: 'USD',
    itemsScanned: 0,
    itemsWithError: 0,
    error: 'empty response',
  };
}

export async function deletePlaidConnection(id: string): Promise<boolean> {
  const res = await authFetch(`/plaid/connections/${id}`, { method: 'DELETE' });
  if (!res.ok) return false;
  const json = await res.json();
  return !!json.success;
}

export async function setTransactionFeedback(transactionId: string, isStressDriven: boolean): Promise<boolean> {
  const res = await authFetch(`/transactions/${transactionId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_stress_driven: isStressDriven }),
  });
  if (!res.ok) return false;
  const json = await res.json();
  return !!json.success;
}

export async function getTimelineAnalysis(windowDays = 30): Promise<TimelineDay[]> {
  // audit-2026-05-08 frontend HIGH-1: route is mounted at /api/transactions/timeline-analysis,
  // not /api/timeline-analysis (server.js:626 mounts transactionsRoutes at /api/transactions).
  // replan-2026-06-10 Track D: every consumer labels this chart "30 days"
  // (MoneyPage card header, StressSpendTimeline banner) but the backend
  // default window is 90 — pin the request to the labeled window.
  const res = await authFetch(`/transactions/timeline-analysis?window_days=${windowDays}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.days || []).map((d: TimelineDay) => ({
    ...d,
    spend: Number(d.spend),
    stress_avg: d.stress_avg !== null ? Number(d.stress_avg) : null,
    stress_shop_count: Number(d.stress_shop_count),
    tx_count: Number(d.tx_count),
  }));
}

export interface RecurringSubscription {
  merchant: string;
  category: string | null;
  monthlyAvg: number;
  currency: string;
  chargeCount: number;
  firstChargeDate: string;
  lastChargeDate: string;
  totalSpentToDate: number;
  firstChargeContext: string | null;
  source: string;
}

export interface RecurringSubscriptionsResponse {
  success: boolean;
  count: number;
  totalMonthly: number;
  currency: string;
  synthesis: string;
  stressfulSignupCount: number;
  subscriptions: RecurringSubscription[];
  error?: string;
}

/** Fetch the user's detected recurring subscriptions for /money/insights. */
export async function getRecurringSubscriptions(
  opts: { limit?: number; minMonthly?: number } = {},
): Promise<RecurringSubscriptionsResponse> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.minMonthly) qs.set('minMonthly', String(opts.minMonthly));
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await authFetch(`/transactions/recurring-subscriptions${suffix}`);
  let body: RecurringSubscriptionsResponse | null = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    return {
      success: false,
      count: 0,
      totalMonthly: 0,
      currency: 'USD',
      synthesis: '',
      stressfulSignupCount: 0,
      subscriptions: [],
      error: body?.error || `failed (${res.status})`,
    };
  }
  return body || {
    success: false,
    count: 0,
    totalMonthly: 0,
    currency: 'USD',
    synthesis: '',
    stressfulSignupCount: 0,
    subscriptions: [],
    error: 'empty response',
  };
}

export interface InvestmentCorrelationInsight {
  id: string;
  insight: string;
  urgency: 'high' | 'medium' | 'low';
  category: string;
  department?: string | null;
  created_at: string;
  sources?: string[] | null;
  metadata?: {
    subcategory?: string;
    pattern?: 'sells_low_recovery' | 'buys_high_stress' | 'recovery_direction_gap' | string;
    n?: number;
    k?: number;
    buy_avg?: number;
    sell_avg?: number;
    gap?: number;
  } | null;
}

/**
 * Fetch the dedicated investment-correlation insights from proactive_insights.
 * These are deterministic, pattern-derived rows written by
 * investmentCorrelationInsights.js — the "moat" insights that join
 * trade activity with Whoop recovery + computed stress.
 */
export async function getInvestmentCorrelationInsights(
  opts: { limit?: number; includeDelivered?: boolean } = {},
): Promise<InvestmentCorrelationInsight[]> {
  const qs = new URLSearchParams({ subcategory: 'investment_correlation' });
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.includeDelivered) qs.set('include_delivered', 'true');
  const res = await authFetch(`/insights/proactive?${qs}`);
  if (!res.ok) return [];
  try {
    const body = await res.json();
    return Array.isArray(body?.insights) ? body.insights : [];
  } catch {
    return [];
  }
}
