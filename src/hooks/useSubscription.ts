// src/hooks/useSubscription.ts
import { useEffect, useState } from 'react';
import { API_URL, getAccessToken, isDemoMode } from '@/services/api/apiBase';


export function useSubscription() {
  const [plan, setPlan] = useState<'free' | 'pro' | 'max'>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Demo mode: pretend user is on pro plan, no API call
    if (isDemoMode()) {
      setPlan('pro');
      setLoading(false);
      return;
    }

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
