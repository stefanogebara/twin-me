/**
 * WhatsApp Card — Dashboard inline connect/message card
 * ======================================================
 * If not connected: phone input + connect button.
 * If connected: "Message now" deep link.
 * Glass card styling matching dashboard design.
 */

import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Check, Loader2, ExternalLink, X } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';
import {
  TWIN_WHATSAPP_DISPLAY,
  TWIN_WHATSAPP_LINK,
} from '@/lib/whatsappConstants';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

const getAuthHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

function isValidE164(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone);
}

function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[^\d+]/g, '');
  return stripped.startsWith('+') ? stripped : `+${stripped}`;
}

const DISMISS_KEY = 'whatsapp_card_dismissed';

export function WhatsAppCard() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLinked, setJustLinked] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => !!sessionStorage.getItem(DISMISS_KEY),
  );

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/whatsapp-link/status`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setLinked(data.linked && data.enabled);
      } else {
        setLinked(false);
      }
    } catch {
      setLinked(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleLink = async () => {
    setError(null);
    const normalized = normalizePhone(phoneInput);
    if (!isValidE164(normalized)) {
      setError('Invalid format. Use E.164 (e.g., +5511999999999).');
      return;
    }

    setLinking(true);
    try {
      const res = await fetch(`${API_URL}/whatsapp-link/link`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phone: normalized }),
      });
      const data = await res.json();
      if (data.success) {
        setLinked(true);
        setPhoneInput('');
        setJustLinked(true);
      } else {
        setError(data.error || 'Failed to link WhatsApp.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLinking(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, '1');
  };

  // Don't render while loading, or if dismissed and not linked
  if (linked === null) {
    // Show unlinked state after 3s timeout (API may have failed silently)
    return null;
  }
  if (dismissed && !linked) return null;

  // --- Connected state ---
  if (linked) {
    return (
      <section className="mb-6">
        <div
          className="relative flex items-center gap-3 rounded-[20px] px-5 py-4"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
          }}
        >
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: 'rgba(37,211,102,0.12)' }}
          >
            <Check className="w-4 h-4" style={{ color: 'rgba(37,211,102,0.8)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--foreground)' }}>
              {justLinked ? 'Connected!' : 'Your twin is on WhatsApp'}
            </p>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              Message it at {TWIN_WHATSAPP_DISPLAY}
            </p>
          </div>
          <a
            href={TWIN_WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-[6px] transition-opacity hover:opacity-80"
            style={{
              backgroundColor: 'rgba(37,211,102,0.15)',
              color: 'rgba(37,211,102,0.9)',
            }}
          >
            <ExternalLink className="w-3 h-3" />
            Message now
          </a>
        </div>
      </section>
    );
  }

  // --- Not connected state ---
  return (
    <section className="mb-6">
      <div
        className="relative rounded-[20px] px-5 py-4"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 p-1 rounded-full transition-opacity hover:opacity-60"
          aria-label="Dismiss WhatsApp card"
        >
          <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: 'rgba(37,211,102,0.12)' }}
          >
            <MessageCircle
              className="w-4 h-4"
              style={{ color: 'rgba(37,211,102,0.8)' }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--foreground)' }}>
              Chat with your twin on WhatsApp
            </p>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              Morning briefings, insights, and reminders — right in your chat.
            </p>
          </div>
        </div>

        {/* Inline phone input + connect */}
        <div className="flex items-center gap-2">
          <input
            type="tel"
            placeholder="+55 11 99999-9999"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value);
              setError(null);
            }}
            disabled={linking}
            className="flex-1 text-sm px-3 py-2 rounded-[6px] bg-transparent focus:outline-none"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: error
                ? '1px solid rgba(239,68,68,0.5)'
                : '1px solid rgba(255,255,255,0.08)',
              color: 'var(--foreground)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !linking) handleLink();
            }}
          />
          <button
            onClick={handleLink}
            disabled={linking || !phoneInput.trim()}
            className="text-[12px] px-3 py-2 rounded-[6px] transition-opacity hover:opacity-80 disabled:opacity-40 flex items-center gap-1.5"
            style={{
              backgroundColor: 'rgba(37,211,102,0.15)',
              color: 'rgba(37,211,102,0.9)',
            }}
          >
            {linking ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Linking...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </div>

        {error && (
          <p className="text-[11px] mt-2" style={{ color: 'rgba(239,68,68,0.8)' }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
