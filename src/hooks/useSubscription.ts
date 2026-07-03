// src/hooks/useSubscription.ts
// audit-2026-05-23 demo mode plumbing removed
import { useEffect, useState } from 'react';
import { API_URL, getAccessToken } from '@/services/api/apiBase';


export function useSubscription() {
  const [plan, setPlan] = useState<'free' | 'pro' | 'max'>('free');
  const [loading, setLoading] = useState(true);
  // Expose whether the plan reflects a real answer or a fail-closed fallback,
  // so callers can distinguish "genuinely free" from "couldn't load" instead
  // of silently downgrading a paying user's UI (audit-2026-07-03 error-ux).
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    fetch(`${API_URL}/billing/subscription`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(`Subscription request failed (${r.status})`);
        return r.json();
      })
      .then(d => {
        setPlan(d.subscription?.plan || 'free');
        setError(false);
      })
      .catch(err => {
        // Fail closed to 'free' for entitlement safety, but don't swallow the
        // error — log it with context and flag it for the caller.
        console.error('Failed to load subscription plan:', err);
        setPlan('free');
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  return { plan, loading, error };
}
