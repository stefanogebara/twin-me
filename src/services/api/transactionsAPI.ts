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

export interface SavingsSummary {
  window_days: number;
  waited_count: number;
  proceeded_count: number;
  dismissed_count: number;
  total_saved: number;
  biggest_save: number;
  median_discretionary_amount: number;
}

export interface SpendingPattern {
  kind: 'category_stress' | 'weekday' | 'biology_impulse' | 'music_mood';
  headline: string;
  detail: string;
  impact_score?: number;
  ratio?: number;
  [key: string]: unknown;
}

export interface PatternsResult {
  hasData: boolean;
  minTransactionsReached?: boolean;
  patterns: SpendingPattern[];
  txCount?: number;
  minRequired?: number;
}

export async function getSpendingPatterns(): Promise<PatternsResult | null> {
  const res = await authFetch('/transactions/patterns');
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;
  const { success: _success, ...result } = json;
  return result as PatternsResult;
}

export async function getSavings(): Promise<SavingsSummary | null> {
  const res = await authFetch('/transactions/savings');
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;
  const { success: _success, ...summary } = json;
  return summary as SavingsSummary;
}

export interface NudgeRecent {
  id: string;
  title: string;
  body: string;
  amount: number;
  merchant: string;
  category: string | null;
  stress_score: number | null;
  followed: boolean | null;
  checked: boolean;
  created_at: string;
}

export interface NudgeStats {
  window_days: number;
  total_sent: number;
  checked_count: number;
  followed_count: number;
  follow_rate: number | null;
  est_saved: number;
  dominant_currency: string;
  recent?: NudgeRecent[];
}

/** Phase 3.5 "before it happens": daily risk forecast for impulse spending. */
export interface RiskForecast {
  status: 'high_risk' | 'low_risk' | 'no_history' | 'no_biology' | 'insufficient_data';
  headline?: string;
  detail?: string;
  message?: string;
  expected_extra?: number;
  current_biology?: { recovery: number | null; sleep: number | null; hrv: number | null; source: string; at: string };
  baseline?: { stress_days: number; normal_days: number; stress_avg_discretionary: number | null; normal_avg_discretionary: number | null; currency: string };
}

export async function getRiskForecast(): Promise<RiskForecast | null> {
  const res = await authFetch('/transactions/risk-forecast');
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;
  return (json.forecast || null) as RiskForecast | null;
}

/** Phase 3.4b affirmation card: how did the user respond to stress nudges? */
export async function getNudgeStats(): Promise<NudgeStats | null> {
  const res = await authFetch('/transactions/nudge-stats');
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;
  const { success: _success, ...stats } = json;
  return stats as NudgeStats;
}

/* -------------------------------------------------------------------------- */
/* Pluggy real-time bank sync (Phase 3.2)                                     */
/* -------------------------------------------------------------------------- */

export interface BankConnection {
  id: string;
  provider?: 'pluggy' | 'truelayer';
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

export async function deleteBankConnection(id: string): Promise<boolean> {
  const res = await authFetch(`/transactions/pluggy/connections/${id}`, { method: 'DELETE' });
  if (!res.ok) return false;
  const json = await res.json();
  return !!json.success;
}

export async function syncBankConnection(id: string, provider?: string): Promise<boolean> {
  // TrueLayer sync lives under a separate router. Dispatch on provider so the
  // caller doesn't have to know about the URL split.
  const endpoint = provider === 'truelayer'
    ? `/truelayer/sync/${id}`
    : `/transactions/pluggy/sync/${id}`;
  const res = await authFetch(endpoint, { method: 'POST' });
  if (!res.ok) return false;
  const json = await res.json();
  return !!json.success;
}

/* -------------------------------------------------------------------------- */
/* TrueLayer EU/UK bank sync (Phase 4)                                        */
/* -------------------------------------------------------------------------- */

export interface TrueLayerAuthUrlResponse {
  success: boolean;
  authUrl?: string;
  error?: string;
  // audit-2026-05-08 C1: stable error code surfaced for UI fallback messaging
  code?: 'TRUELAYER_NOT_CONFIGURED' | string;
}

/**
 * Request a TrueLayer OAuth authorization URL. The frontend then window.location
 * assigns to it — TrueLayer handles bank selection + consent, redirects back to
 * /api/truelayer/callback which completes the handshake and redirects to /money.
 */
export async function getTrueLayerAuthUrl(providers?: string): Promise<TrueLayerAuthUrlResponse> {
  const res = await authFetch('/truelayer/auth-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(providers ? { providers } : {}),
  });
  // audit-2026-05-08 C1: read body on !ok too, to surface structured `code`.
  let body: TrueLayerAuthUrlResponse | null = null;
  try { body = await res.json(); } catch { /* non-JSON is fine */ }
  if (!res.ok) {
    return {
      success: false,
      error: body?.error || `auth-url failed (${res.status})`,
      code: body?.code,
    };
  }
  return body || { success: false, error: 'empty response' };
}

export async function syncTrueLayerConnection(id: string): Promise<boolean> {
  const res = await authFetch(`/truelayer/sync/${id}`, { method: 'POST' });
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

export async function getTimelineAnalysis(): Promise<TimelineDay[]> {
  // audit-2026-05-08 frontend HIGH-1: route is mounted at /api/transactions/timeline-analysis,
  // not /api/timeline-analysis (server.js:626 mounts transactionsRoutes at /api/transactions).
  const res = await authFetch('/transactions/timeline-analysis');
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
