// src/hooks/useSubscription.ts
// audit-2026-05-23 demo mode plumbing removed
import { useEffect, useState } from 'react';
import { API_URL, getAccessToken } from '@/services/api/apiBase';


export function useSubscription() {
  const [plan, setPlan] = useState<'free' | 'pro' | 'max'>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    fetch(`${API_URL}/billing/subscription`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setPlan(d.subscription?.plan || 'free'))
      .catch(() => setPlan('free'))
      .finally(() => setLoading(false));
  }, []);

  return { plan, loading };
}
