/**
 * WhatsApp Connect — Self-Serve Phone Linking
 * ============================================
 * Settings card for linking/unlinking WhatsApp.
 * Uses /api/whatsapp-link endpoints.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Check, Loader2, ExternalLink } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';
import { TWIN_WHATSAPP_DISPLAY, TWIN_WHATSAPP_LINK } from '@/lib/whatsappConstants';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

const getAuthHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

/**
 * Validate E.164: starts with +, 10-15 digits total.
 */
function isValidE164(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone);
}

/**
 * Strip non-digit characters except leading +.
 */
function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[^\d+]/g, '');
  return stripped.startsWith('+') ? stripped : `+${stripped}`;
}

interface WhatsAppStatus {
  linked: boolean;
  enabled: boolean;
  phone: string | null;
}

interface WhatsAppConnectProps {
  isDemoMode: boolean;
}

const WhatsAppConnect: React.FC<WhatsAppConnectProps> = ({ isDemoMode }) => {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/whatsapp-link/status`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setStatus({ linked: data.linked, enabled: data.enabled, phone: data.phone });
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleLink = async () => {
    if (isDemoMode) return;
    setError(null);
    setSuccess(false);

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
        setStatus({ linked: true, enabled: true, phone: normalized });
        setPhoneInput('');
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to link WhatsApp.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (isDemoMode) return;
    try {
      await fetch(`${API_URL}/whatsapp-link/unlink`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setStatus({ linked: false, enabled: false, phone: null });
      setSuccess(false);
      setError(null);
    } catch {
      // non-fatal
    }
  };

  if (loading) {
    return (
      <div className="py-4 text-center text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div
        className="flex items-center justify-between py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-3">
          <MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} />
          <div>
            <span className="text-sm" style={{ color: 'var(--foreground)' }}>WhatsApp</span>
            <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {status?.linked
                ? 'Connected — twin sends insights here'
                : 'Your twin will send you daily briefings and insights via WhatsApp'}
            </p>
          </div>
        </div>

        {status?.linked ? (
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-[11px]"
              style={{ color: 'rgba(16,183,127,0.8)' }}
            >
              <Check className="w-3 h-3" /> {status.phone}
            </span>
            <button
              onClick={handleUnlink}
              className="text-[11px] transition-opacity hover:opacity-60"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Unlink
            </button>
          </div>
        ) : null}
      </div>

      {/* Link form (when not linked) */}
      {!status?.linked && (
        <div
          className="py-4 space-y-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="flex items-center gap-2">
            <input
              type="tel"
              placeholder="+55 11 99999-9999"
              value={phoneInput}
              onChange={(e) => {
                setPhoneInput(e.target.value);
                setError(null);
              }}
              disabled={isDemoMode || linking}
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
              disabled={isDemoMode || linking || !phoneInput.trim()}
              className="text-[12px] px-3 py-2 rounded-[6px] transition-opacity hover:opacity-80 disabled:opacity-40 flex items-center gap-1.5"
              style={{
                backgroundColor: 'var(--button-bg-dark, #252222)',
                color: 'var(--foreground)',
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
            <p className="text-[11px]" style={{ color: 'rgba(239,68,68,0.8)' }}>
              {error}
            </p>
          )}
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Enter your number in international format with country code.
          </p>
        </div>
      )}

      {/* Success instructions (shown after linking or when already linked) */}
      {status?.linked && (
        <div
          className="py-4 space-y-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          {success && (
            <p className="text-[12px] font-medium" style={{ color: 'rgba(16,183,127,0.9)' }}>
              Connected! Your twin is ready on WhatsApp.
            </p>
          )}
          <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Message your twin at{' '}
            <span style={{ color: 'var(--foreground)' }}>{TWIN_WHATSAPP_DISPLAY}</span>
          </p>
          <a
            href={TWIN_WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-[6px] transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'rgba(37,211,102,0.15)', color: 'rgba(37,211,102,0.9)' }}
          >
            <ExternalLink className="w-3 h-3" />
            Message now
          </a>
        </div>
      )}
    </div>
  );
};

export default WhatsAppConnect;
