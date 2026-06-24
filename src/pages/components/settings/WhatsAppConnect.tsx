/**
 * WhatsApp Connect — Self-Serve Phone Linking
 * ============================================
 * Settings card for linking/unlinking WhatsApp. Two-step, ownership-verified:
 * enter number → receive a code on WhatsApp → enter the code → linked.
 * Uses the shared useWhatsAppLink hook (/api/whatsapp-link endpoints).
 */

import React, { useState } from 'react';
import { MessageCircle, Check, Loader2, ExternalLink } from 'lucide-react';
import { TWIN_WHATSAPP_DISPLAY, TWIN_WHATSAPP_LINK } from '@/lib/whatsappConstants';
import { useWhatsAppLink } from '@/hooks/useWhatsAppLink';

const WhatsAppConnect: React.FC = () => {
  const wa = useWhatsAppLink();
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');

  const submitPhone = async () => {
    const ok = await wa.requestCode(phoneInput);
    if (ok) setCodeInput('');
  };

  const submitCode = async () => {
    const ok = await wa.verifyCode(codeInput);
    if (ok) { setPhoneInput(''); setCodeInput(''); }
  };

  if (wa.loading) {
    return (
      <div className="py-4 text-center text-[12px]" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
        Loading...
      </div>
    );
  }

  const linked = wa.step === 'linked';

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
            <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
              {linked
                ? 'Connected — twin sends insights here'
                : 'Your twin will send you daily briefings and insights via WhatsApp'}
            </p>
          </div>
        </div>

        {linked && (
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-[11px]"
              style={{ color: 'rgba(16,183,127,0.8)' }}
            >
              <Check className="w-3 h-3" /> {wa.linkedPhone}
            </span>
            <button
              onClick={wa.unlink}
              className="text-[11px] transition-opacity hover:opacity-60"
              style={{ color: 'rgba(255, 255, 255, 0.55)' }}
            >
              Unlink
            </button>
          </div>
        )}
      </div>

      {/* Step 1: phone */}
      {wa.step === 'phone' && (
        <div className="py-4 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-2">
            <input
              type="tel"
              placeholder="+1 415 555 0100"
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
              style={{ backgroundColor: 'var(--button-bg-dark, #252222)', color: 'var(--foreground)' }}
            >
              {wa.busy ? (<><Loader2 className="w-3 h-3 animate-spin" />Sending...</>) : 'Send code'}
            </button>
          </div>
          {wa.error && <p className="text-[11px]" style={{ color: 'rgba(239,68,68,0.8)' }}>{wa.error}</p>}
          <p className="text-[11px]" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
            Enter your number in international format. We will send a code to confirm it is yours.
          </p>
        </div>
      )}

      {/* Step 2: code */}
      {wa.step === 'code' && (
        <div className="py-4 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
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
              style={{ backgroundColor: 'rgba(37,211,102,0.15)', color: 'rgba(37,211,102,0.9)' }}
            >
              {wa.busy ? (<><Loader2 className="w-3 h-3 animate-spin" />Verifying...</>) : 'Verify & connect'}
            </button>
          </div>
          {wa.info && !wa.error && (
            <p className="text-[11px]" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
              {wa.info} Sent to <span style={{ color: 'var(--foreground)' }}>{wa.pendingPhone}</span>.
            </p>
          )}
          {wa.error && <p className="text-[11px]" style={{ color: 'rgba(239,68,68,0.8)' }}>{wa.error}</p>}
          <button
            onClick={() => { setCodeInput(''); wa.cancel(); }}
            className="text-[11px] transition-opacity hover:opacity-60"
            style={{ color: 'rgba(255, 255, 255, 0.55)' }}
          >
            Use a different number
          </button>
        </div>
      )}

      {/* Linked */}
      {linked && (
        <div className="py-4 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <p className="text-[12px]" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
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
