/**
 * WhatsApp Connect — Self-Serve Phone Linking
 * ============================================
 * One row of the page kit (render it inside a List), and what it opens to.
 * Two-step, ownership-verified: enter number → receive a code on WhatsApp →
 * enter the code → linked. Uses the shared useWhatsAppLink hook
 * (/api/whatsapp-link endpoints).
 */

import React, { useState } from 'react';
import { MessageCircle, Loader2, ExternalLink } from 'lucide-react';
import { TWIN_WHATSAPP_DISPLAY, TWIN_WHATSAPP_LINK } from '@/lib/whatsappConstants';
import { useWhatsAppLink, isValidE164, normalizePhone } from '@/hooks/useWhatsAppLink';
import { Row } from '@/components/register';

const WhatsAppConnect: React.FC = () => {
  const wa = useWhatsAppLink();
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  // Real-time format feedback (audit-2026-07-03) — only shown once the user has
  // typed something, so the field doesn't start in an error state.
  const [phoneFormatError, setPhoneFormatError] = useState<string | null>(null);

  const submitPhone = async () => {
    if (phoneInput.trim() && !isValidE164(normalizePhone(phoneInput))) {
      setPhoneFormatError('Use international format, for example +5511999999999.');
      return;
    }
    const ok = await wa.requestCode(phoneInput);
    if (ok) setCodeInput('');
  };

  const submitCode = async () => {
    const ok = await wa.verifyCode(codeInput);
    if (ok) { setPhoneInput(''); setCodeInput(''); setPhoneFormatError(null); }
  };

  if (wa.loading) {
    return (
      <li className="rs-note">
        <Loader2 className="animate-spin" aria-hidden="true" />
        Checking WhatsApp
      </li>
    );
  }

  const linked = wa.step === 'linked';
  const fieldError = wa.error || phoneFormatError;

  return (
    <>
      <Row
        icon={<MessageCircle />}
        title="WhatsApp"
        line={linked
          ? <><span className="rs-ok">Connected</span> · {wa.linkedPhone}</>
          : 'Daily briefings and insights on WhatsApp'}
        action={linked ? (
          <button type="button" onClick={wa.unlink} className="n-btn n-btn--ghost">Unlink</button>
        ) : undefined}
        className="rs-row-has-body"
      />

      {/* Step 1: phone */}
      {wa.step === 'phone' && (
        <li className="rs-body">
          <div className="rs-inline">
            <input
              type="tel"
              placeholder="+1 415 555 0100"
              value={phoneInput}
              aria-label="Your WhatsApp number"
              aria-invalid={!!fieldError}
              onChange={(e) => {
                const next = e.target.value;
                setPhoneInput(next);
                wa.clearError();
                if (!next.trim() || isValidE164(normalizePhone(next))) {
                  setPhoneFormatError(null);
                } else {
                  setPhoneFormatError('Use international format, for example +5511999999999.');
                }
              }}
              disabled={wa.busy}
              className="n-input"
              onKeyDown={(e) => { if (e.key === 'Enter' && !wa.busy) submitPhone(); }}
            />
            <button
              type="button"
              onClick={submitPhone}
              disabled={wa.busy || !phoneInput.trim()}
              className="n-btn n-btn--ghost"
            >
              {wa.busy ? (<><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Sending</>) : 'Send code'}
            </button>
          </div>
          {fieldError
            ? <p className="rs-bad" role="alert" style={{ margin: 0 }}>{fieldError}</p>
            : <p className="rs-quiet">We send a code to confirm the number is yours.</p>}
        </li>
      )}

      {/* Step 2: code */}
      {wa.step === 'code' && (
        <li className="rs-body">
          <div className="rs-inline">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              aria-label="The 6-digit code"
              value={codeInput}
              onChange={(e) => { setCodeInput(e.target.value.replace(/\D/g, '')); wa.clearError(); }}
              disabled={wa.busy}
              className="n-input"
              style={{ letterSpacing: '0.2em' }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !wa.busy) submitCode(); }}
            />
            <button
              type="button"
              onClick={submitCode}
              disabled={wa.busy || codeInput.length !== 6}
              className="n-btn n-btn--ghost"
            >
              {wa.busy ? (<><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Verifying</>) : 'Verify'}
            </button>
          </div>
          {wa.info && !wa.error && (
            <p className="rs-quiet">
              {wa.info} Sent to <span className="rs-strong">{wa.pendingPhone}</span>.
            </p>
          )}
          {wa.error && <p className="rs-bad" role="alert" style={{ margin: 0 }}>{wa.error}</p>}
          <button
            type="button"
            onClick={() => { setCodeInput(''); wa.cancel(); }}
            className="rs-link"
            style={{ justifySelf: 'start' }}
          >
            Use a different number
          </button>
        </li>
      )}

      {/* Linked */}
      {linked && (
        <li className="rs-body">
          <div className="rs-inline" style={{ justifyContent: 'space-between' }}>
            <p className="rs-quiet" style={{ color: 'var(--rg-ink-2)' }}>
              Message your twin at <span className="rs-strong">{TWIN_WHATSAPP_DISPLAY}</span>
            </p>
            <a
              href={TWIN_WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="n-btn n-btn--ghost"
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Message now
            </a>
          </div>
        </li>
      )}
    </>
  );
};

export default WhatsAppConnect;
