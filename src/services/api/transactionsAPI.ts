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
  /**
   * The user's saved stress-feedback for this transaction:
   * true = stress-driven, false = not, null = no feedback yet.
   * Populated by the GET / route from the transaction_feedback table so the
   * FeedbackToggle can render the prior answer instead of resetting on reload.
   */
  feedback?: boolean | null;
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
