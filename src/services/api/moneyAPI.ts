/**
 * Money v2 API client: the ledger, its receipts, what comes back on its own, this month, the sources.
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */
import { authFetch } from './apiBase';

export type MoneyTransaction = {
  id: string; occurred_at: string; posted_at: string | null; amount: number | string; currency: string;
  merchant_raw: string | null; merchant_key: string; merchant_name: string | null; category: string | null;
  channel: string | null; card_last4: string | null; is_recurring: boolean; verdict: 'worth_it' | 'not_me' | null;
};
export type MoneySighting = { id: string; source: string; seen_at: string; raw_text: string | null; amount: number | string | null; currency: string | null; occurred_at: string | null; parse_confidence: number | string | null };
export type MoneyRecurring = { merchant_key: string; cadence: string; typical_amount: number | string; occurrences: number; first_seen: string; last_seen: string; next_expected: string | null; is_subscription: boolean; platform?: string | null; uses?: number | null; cost_per_use?: number | null };
export type MoneyForecast = {
  month: string; as_of: string; days_left: number; spent: number; committed: number; expected: number; baseline_rest: number;
  projected_p10: number; projected_p50: number; projected_p90: number; history_days: number;
  committed_items: { merchant_key: string; typical_amount: number | string; next_expected: string }[];
};
export type MoneyAccount = { id: string; provider: string; name: string | null; iban_mask: string | null; currency: string; consent_expires_at: string | null; last_pulled_at: string | null };

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
  accounts: () => authFetch('/money/bank/accounts').then((r) => json<MoneyAccount[]>(r)),
  connect: (bank = 'Banco Santander', country = 'ES') =>
    authFetch('/money/bank/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bank, country }) }).then((r) => json<{ url: string }>(r)),
  pull: () => authFetch('/money/bank/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => json<{ account: string; seen: number; created: number }[]>(r)),
  /** A key for the phone: one of the user's API keys, shown once. */
  createCaptureKey: async () => {
    const res = await authFetch('/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Phone capture (Shortcut)' }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.key) throw new Error(body?.error || 'Could not create a key');
    return body.key as string;
  },
};

export function euro(n: number | string | null | undefined): string {
  const v = Math.abs(Number(n) || 0);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v);
}
export function shortDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
