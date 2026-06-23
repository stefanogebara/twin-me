/**
 * VoiceSetupPage — /settings/voice
 * =================================
 * Phase 1 of the voice-first surface. User scans a QR code with their
 * phone's WhatsApp (Settings → Linked Devices) to link their account to
 * the TwinMe bridge service.
 *
 * Once linked, voice messages sent to themselves on WhatsApp get
 * transcribed and routed through the twin chat pipeline. The twin's
 * reply lands back in the same chat.
 *
 * State machine:
 *   loading   → polling /link/status to find current state
 *   none      → "Link your WhatsApp" CTA visible
 *   pending   → QR code shown, polling for status flip
 *   linked    → "Connected to +X" with unlink button
 *   error     → message + retry
 */

import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/services/api/apiBase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type Status = 'loading' | 'none' | 'pending' | 'linked' | 'error';

interface LinkState {
  status: Status;
  qrCode?: string;
  jid?: string;
  displayName?: string;
  phoneNumber?: string;
  linkedAt?: string;
  errorMessage?: string;
}

const POLL_INTERVAL_MS = 2500;

export default function VoiceSetupPage() {
  useDocumentTitle('Voice Bridge — TwinMe');
  const [state, setState] = useState<LinkState>({ status: 'loading' });
  const [starting, setStarting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await authFetch('/voice-bridge/link/status');
      if (!res.ok) {
        if (res.status === 503) {
          setState({ status: 'error', errorMessage: "Voice bridge isn't available right now. Please try again later." });
          return;
        }
        setState({ status: 'error', errorMessage: `Status check failed (${res.status})` });
        return;
      }
      const body = await res.json();
      setState({
        status: (body.status as Status) || 'none',
        qrCode: body.qrCode,
        jid: body.jid,
        displayName: body.displayName,
        phoneNumber: body.phoneNumber,
        linkedAt: body.linkedAt,
      });
    } catch (err) {
      setState({ status: 'error', errorMessage: 'Could not reach the bridge.' });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll while pending so the QR refreshes + we detect link success quickly
  useEffect(() => {
    if (state.status !== 'pending') return;
    const id = window.setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state.status, fetchStatus]);

  async function startLink() {
    setStarting(true);
    try {
      const res = await authFetch('/voice-bridge/link/start', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: 'error', errorMessage: body.error || `Start failed (${res.status})` });
        return;
      }
      // Bridge returned the first QR; pull it into state and start polling
      await fetchStatus();
    } finally {
      setStarting(false);
    }
  }

  async function cancelLink() {
    try {
      const res = await authFetch('/voice-bridge/link/cancel', { method: 'POST' });
      if (!res.ok) {
        setState((prev) => ({ ...prev, status: 'error', errorMessage: "Couldn't cancel linking. Please try again." }));
        return;
      }
      setState({ status: 'none' });
    } catch {
      setState((prev) => ({ ...prev, status: 'error', errorMessage: "Couldn't cancel linking. Please try again." }));
    }
  }

  async function unlink() {
    if (!confirm('Unlink your WhatsApp from TwinMe? You can re-link any time.')) return;
    // Verify the server-side unlink succeeded before showing disconnected —
    // a failed unlink must not falsely read as disconnected while the bridge
    // still holds session keys (audit-2026-06-10).
    try {
      const res = await authFetch('/voice-bridge/unlink', { method: 'POST' });
      if (!res.ok) {
        setState((prev) => ({ ...prev, status: 'error', errorMessage: "Couldn't unlink. Please try again." }));
        return;
      }
      setState({ status: 'none' });
    } catch {
      setState((prev) => ({ ...prev, status: 'error', errorMessage: "Couldn't unlink. Please try again." }));
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <header className="mb-8">
        <h1
          className="text-[36px] mb-2"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            letterSpacing: '-0.02em',
            color: '#F5F5F4',
          }}
        >
          Voice bridge
        </h1>
        <p className="text-[15px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Talk to your twin from WhatsApp. Voice messages get transcribed and routed
          to the same brain as the web chat — the twin replies in text.
        </p>
      </header>

      <section
        className="rounded-[20px] px-6 py-5 mb-5"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
        }}
      >
        {state.status === 'loading' && (
          <div className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Checking your bridge status…
          </div>
        )}

        {state.status === 'none' && (
          <div className="flex flex-col items-start gap-4">
            <div>
              <p className="text-[15px] mb-1" style={{ color: '#F5F5F4' }}>
                Not connected yet
              </p>
              <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                One scan with your phone's WhatsApp and you're done.
              </p>
            </div>
            <button
              onClick={startLink}
              disabled={starting}
              className="px-5 py-2 rounded-[100px] text-[14px] font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
              style={{ background: '#F5F5F4', color: '#110f0f' }}
            >
              {starting ? 'Generating QR…' : 'Link WhatsApp'}
            </button>
          </div>
        )}

        {state.status === 'pending' && (
          <div className="flex flex-col items-center text-center">
            {state.qrCode ? (
              <div
                className="p-4 rounded-[12px] mb-4"
                style={{ background: '#fff' }}
              >
                {/* The bridge returns a data URL (image/png base64) or text */}
                {state.qrCode.startsWith('data:image') ? (
                  <img src={state.qrCode} alt="WhatsApp link QR" className="w-56 h-56" />
                ) : (
                  <pre className="text-[10px] leading-tight" style={{ color: '#000' }}>
                    {state.qrCode}
                  </pre>
                )}
              </div>
            ) : (
              <div className="w-56 h-56 mb-4 rounded-[12px] animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
            )}
            <ol
              className="text-[13px] text-left list-decimal pl-5 mb-4 space-y-1 max-w-md"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              <li>Open WhatsApp on your phone</li>
              <li>Tap Settings → Linked Devices → Link a Device</li>
              <li>Scan this QR code with your phone's camera</li>
            </ol>
            <button
              onClick={cancelLink}
              className="text-[12px] underline"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Cancel
            </button>
          </div>
        )}

        {state.status === 'linked' && (
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-3">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ background: '#10b77f' }}
                aria-hidden="true"
              />
              <p className="text-[15px]" style={{ color: '#F5F5F4' }}>
                Connected to <strong>{state.displayName || state.phoneNumber || 'WhatsApp'}</strong>
              </p>
            </div>
            {state.linkedAt && (
              <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Linked {new Date(state.linkedAt).toLocaleString()}
              </p>
            )}
            <p className="text-[13px] mt-2 max-w-md" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Send yourself a voice note on WhatsApp and your twin will reply.
            </p>
            <button
              onClick={unlink}
              className="text-[13px] underline mt-2"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Unlink
            </button>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[14px]" style={{ color: 'rgba(217,119,6,0.9)' }}>
              {state.errorMessage || 'Something went wrong.'}
            </p>
            <button
              onClick={fetchStatus}
              className="text-[13px] underline"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Retry
            </button>
          </div>
        )}
      </section>

      <section className="text-[12px] space-y-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <p>
          <strong>Privacy:</strong> the bridge holds your WhatsApp Web session keys (the same
          ones your browser's WhatsApp Web uses). Voice audio is transcribed via Whisper and
          stored as text only — the raw audio is discarded after transcription.
        </p>
        <p>
          <strong>How it works:</strong> the bridge runs as a long-lived Go service on Fly.io.
          WhatsApp Web sessions need a persistent connection, which is why this lives outside
          our serverless API.
        </p>
      </section>
    </div>
  );
}
