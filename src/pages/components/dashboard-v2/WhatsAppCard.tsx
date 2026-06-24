/**
 * WhatsApp Card — Dashboard inline connect/message card
 * ======================================================
 * Two-step, ownership-verified connect: phone → code (sent over WhatsApp) →
 * linked. When connected, a "Message now" deep link. Glass card styling.
 * Uses the shared useWhatsAppLink hook.
 */

import { useState } from 'react';
import { MessageCircle, Check, Loader2, ExternalLink, X } from 'lucide-react';
import { TWIN_WHATSAPP_DISPLAY, TWIN_WHATSAPP_LINK } from '@/lib/whatsappConstants';
import { useWhatsAppLink } from '@/hooks/useWhatsAppLink';

const DISMISS_KEY = 'whatsapp_card_dismissed';

const cardStyle = {
  background: 'var(--glass-surface-bg)',
  backdropFilter: 'blur(42px)',
  WebkitBackdropFilter: 'blur(42px)',
  border: '1px solid var(--glass-surface-border)',
} as const;

const greenBtn = { backgroundColor: 'rgba(37,211,102,0.15)', color: 'rgba(37,211,102,0.9)' } as const;

export function WhatsAppCard() {
  const wa = useWhatsAppLink();
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [dismissed, setDismissed] = useState(() => !!sessionStorage.getItem(DISMISS_KEY));

  const submitPhone = async () => {
    const ok = await wa.requestCode(phoneInput);
    if (ok) setCodeInput('');
  };
  const submitCode = async () => {
    const ok = await wa.verifyCode(codeInput);
    if (ok) { setPhoneInput(''); setCodeInput(''); }
  };
  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, '1');
  };

  if (wa.loading) return null;
  const linked = wa.step === 'linked';
  if (dismissed && !linked) return null;

  // --- Connected state ---
  if (linked) {
    return (
      <section className="mb-6">
        <div className="relative flex items-center gap-3 rounded-[20px] px-5 py-4" style={cardStyle}>
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: 'rgba(37,211,102,0.12)' }}
          >
            <Check className="w-4 h-4" style={{ color: 'rgba(37,211,102,0.8)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--foreground)' }}>Your twin is on WhatsApp</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Message it at {TWIN_WHATSAPP_DISPLAY}
            </p>
          </div>
          <a
            href={TWIN_WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-[6px] transition-opacity hover:opacity-80"
            style={greenBtn}
          >
            <ExternalLink className="w-3 h-3" />
            Message now
          </a>
        </div>
      </section>
    );
  }

  // --- Not connected: phone / code steps ---
  return (
    <section className="mb-6">
      <div className="relative rounded-[20px] px-5 py-4" style={cardStyle}>
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 p-1 rounded-full transition-opacity hover:opacity-60"
          aria-label="Dismiss WhatsApp card"
        >
          <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: 'rgba(37,211,102,0.12)' }}
          >
            <MessageCircle className="w-4 h-4" style={{ color: 'rgba(37,211,102,0.8)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--foreground)' }}>
              Chat with your twin on WhatsApp
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {wa.step === 'code'
                ? 'Enter the code we just sent to your WhatsApp.'
                : 'Morning briefings, insights, and reminders — right in your chat.'}
            </p>
          </div>
        </div>

        {wa.step === 'phone' && (
          <div className="flex items-center gap-2">
            <input
              type="tel"
              placeholder="+55 11 99999-9999"
              value={phoneInput}
              onChange={(e) => { setPhoneInput(e.target.value); wa.clearError(); }}
              disabled={wa.busy}
              className="flex-1 text-sm px-3 py-2 rounded-[6px] bg-transparent focus:outline-none"
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: wa.error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
                color: 'var(--foreground)',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !wa.busy) submitPhone(); }}
            />
            <button
              onClick={submitPhone}
              disabled={wa.busy || !phoneInput.trim()}
              className="text-[12px] px-3 py-2 rounded-[6px] transition-opacity hover:opacity-80 disabled:opacity-40 flex items-center gap-1.5"
              style={greenBtn}
            >
              {wa.busy ? (<><Loader2 className="w-3 h-3 animate-spin" />Sending...</>) : 'Send code'}
            </button>
          </div>
        )}

        {wa.step === 'code' && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              value={codeInput}
              onChange={(e) => { setCodeInput(e.target.value.replace(/\D/g, '')); wa.clearError(); }}
              disabled={wa.busy}
              className="flex-1 text-sm px-3 py-2 rounded-[6px] bg-transparent focus:outline-none tracking-[0.3em]"
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: wa.error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
                color: 'var(--foreground)',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !wa.busy) submitCode(); }}
            />
            <button
              onClick={submitCode}
              disabled={wa.busy || codeInput.length !== 6}
              className="text-[12px] px-3 py-2 rounded-[6px] transition-opacity hover:opacity-80 disabled:opacity-40 flex items-center gap-1.5"
              style={greenBtn}
            >
              {wa.busy ? (<><Loader2 className="w-3 h-3 animate-spin" />Verifying...</>) : 'Verify'}
            </button>
          </div>
        )}

        {wa.error && (
          <p className="text-[11px] mt-2" style={{ color: 'rgba(239,68,68,0.8)' }}>{wa.error}</p>
        )}
        {wa.step === 'code' && (
          <button
            onClick={() => { setCodeInput(''); wa.cancel(); }}
            className="text-[11px] mt-2 transition-opacity hover:opacity-60"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            Use a different number
          </button>
        )}
      </div>
    </section>
  );
}
