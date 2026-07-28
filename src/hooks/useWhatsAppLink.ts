/**
 * useWhatsAppLink — shared state machine for the secure two-step WhatsApp link.
 *
 *   phone  → requestCode()  → code   (a 6-digit code is sent to the number)
 *   code   → verifyCode()   → linked (only a verified code links the channel)
 *
 * Backed by /api/whatsapp-link/link/request + /link/verify (ownership proof).
 * While WhatsApp is dormant the request step surfaces a clear "couldn't send"
 * error and stays on the phone step — no number is ever linked unverified.
 */
import { useCallback, useEffect, useState } from 'react';
import { API_URL, getAccessToken } from '@/services/api/apiBase';

export type WhatsAppLinkStep = 'phone' | 'code' | 'linked';

function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/** E.164: a leading + and 10-15 digits. */
export function isValidE164(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone);
}

/** Strip everything but digits, keep/prepend a single leading +. */
export function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[^\d+]/g, '');
  return stripped.startsWith('+') ? stripped : `+${stripped}`;
}

export interface UseWhatsAppLink {
  step: WhatsAppLinkStep;
  loading: boolean;          // initial status fetch
  busy: boolean;             // a request/verify call is in flight
  pendingPhone: string;      // the number a code was sent to (code step)
  linkedPhone: string | null;
  error: string | null;
  info: string | null;       // transient guidance, e.g. "code sent"
  requestCode: (rawPhone: string) => Promise<boolean>;
  verifyCode: (code: string) => Promise<boolean>;
  cancel: () => void;        // back to the phone step
  unlink: () => Promise<void>;
  clearError: () => void;
}

export function useWhatsAppLink(): UseWhatsAppLink {
  const [step, setStep] = useState<WhatsAppLinkStep>('phone');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/whatsapp-link/status`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.linked) {
        setLinkedPhone(data.phone ?? null);
        setStep('linked');
      }
    } catch {
      // non-fatal: leave on the phone step
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestCode = useCallback(async (rawPhone: string): Promise<boolean> => {
    setError(null);
    setInfo(null);
    const normalized = normalizePhone(rawPhone);
    if (!isValidE164(normalized)) {
      setError('Invalid format. Use E.164 (e.g., +5511999999999).');
      return false;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/whatsapp-link/link/request`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phone: normalized }),
      });
      const data = await res.json();
      if (data.success) {
        setPendingPhone(normalized);
        setStep('code');
        setInfo('We sent a 6-digit code to your WhatsApp. Enter it below.');
        return true;
      }
      setError(data.error || 'Could not send a verification code.');
      return false;
    } catch {
      setError('Network error. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyCode = useCallback(async (code: string): Promise<boolean> => {
    setError(null);
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code.');
      return false;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/whatsapp-link/link/verify`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phone: pendingPhone, code: trimmed }),
      });
      const data = await res.json();
      if (data.success) {
        setLinkedPhone(pendingPhone);
        setStep('linked');
        setInfo(null);
        return true;
      }
      setError(data.error || 'Verification failed.');
      return false;
    } catch {
      setError('Network error. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [pendingPhone]);

  const cancel = useCallback(() => {
    setStep('phone');
    setError(null);
    setInfo(null);
  }, []);

  const unlink = useCallback(async () => {
    try {
      await fetch(`${API_URL}/whatsapp-link/unlink`, { method: 'DELETE', headers: getAuthHeaders() });
    } catch {
      // non-fatal
    }
    setLinkedPhone(null);
    setStep('phone');
    setError(null);
    setInfo(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    step, loading, busy, pendingPhone, linkedPhone, error, info,
    requestCode, verifyCode, cancel, unlink, clearError,
  };
}
