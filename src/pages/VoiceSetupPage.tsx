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
 *
 * In the register: one row for the connection (no card), and what it opens to.
 */

import { useEffect, useState, useCallback } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, PageHead, List, Row } from '@/components/register';
import '@/styles/register-public.css';
import '@/styles/register-settings.css';

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
  // Two-tap unlink confirmation (replaces browser confirm(), audit-2026-07-03)
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);

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
        // audit-2026-07-03: prefer the human-friendly error_description over
        // the machine-only error slug (e.g. "waha_unreachable").
        setState({ status: 'error', errorMessage: body.error_description || body.error || `Start failed (${res.status})` });
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
    // Two-tap confirm (same idiom as IdentityNarrativeCard's revert) instead
    // of the browser confirm() dialog, which is unstyled, thread-blocking,
    // and inconsistent with the design system (audit-2026-07-03).
    if (!confirmingUnlink) {
      setConfirmingUnlink(true);
      window.setTimeout(() => setConfirmingUnlink(false), 4000);
      return;
    }
    setConfirmingUnlink(false);
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

  const linkedName = state.displayName || state.phoneNumber || 'WhatsApp';

  const line =
    state.status === 'loading' ? 'Checking your connection'
    : state.status === 'none' ? 'Not connected. One scan with your phone.'
    : state.status === 'pending' ? 'Scan the code with your phone'
    : state.status === 'linked'
      ? <><span className="rs-ok">Connected</span> · {linkedName}{state.linkedAt ? `, since ${new Date(state.linkedAt).toLocaleDateString()}` : ''}</>
    : <span className="rs-bad">{state.errorMessage || 'Something went wrong.'}</span>;

  const action =
    state.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--rg-ink-2)' }} aria-label="Loading" />
    : state.status === 'none' ? (
      <button type="button" onClick={startLink} disabled={starting} className="n-btn n-btn--primary">
        {starting ? 'Making a code' : 'Link WhatsApp'}
      </button>
    )
    : state.status === 'pending' ? (
      <button type="button" onClick={cancelLink} className="n-btn n-btn--ghost">Cancel</button>
    )
    : state.status === 'linked' ? (
      <button type="button" onClick={unlink} className={`n-btn n-btn--ghost${confirmingUnlink ? ' rg-danger' : ''}`}>
        {confirmingUnlink ? 'Tap again to unlink' : 'Unlink'}
      </button>
    )
    : <button type="button" onClick={fetchStatus} className="n-btn n-btn--ghost">Retry</button>;

  return (
    <Page className="rs">
      <PageHead title="Voice bridge" line="Talk to your twin from WhatsApp. It replies in text." />

      <List label="Voice bridge" className="pb-stack">
        <Row
          icon={<MessageCircle />}
          title="WhatsApp"
          line={line}
          action={action}
          className={state.status === 'pending' || state.status === 'linked' ? 'rs-row-has-body' : undefined}
        />

        {state.status === 'pending' && (
          <li className="rs-body">
            {state.qrCode ? (
              // The QR keeps a white ground so any phone camera can read it.
              <div style={{ justifySelf: 'start', padding: 12, background: 'var(--rg-white)', border: '1px solid var(--rg-rule)', borderRadius: 4 }}>
                {/* The bridge returns a data URL (image/png base64) or text */}
                {state.qrCode.startsWith('data:image') ? (
                  <img src={state.qrCode} alt="WhatsApp link QR" className="w-56 h-56" />
                ) : (
                  <pre className="text-[10px] leading-tight" style={{ color: 'var(--rg-ink)', margin: 0 }}>
                    {state.qrCode}
                  </pre>
                )}
              </div>
            ) : (
              <div className="w-56 h-56 animate-pulse" style={{ background: 'var(--rg-field)', borderRadius: 4 }} />
            )}
            <ol className="rs-steps">
              <li>Open WhatsApp on your phone</li>
              <li>Tap Settings, then Linked devices, then Link a device</li>
              <li>Scan this code</li>
            </ol>
          </li>
        )}

        {state.status === 'linked' && (
          <li className="rs-body">
            <p className="rs-quiet" style={{ color: 'var(--rg-ink-2)' }}>Send yourself a voice note on WhatsApp and your twin will reply.</p>
          </li>
        )}
      </List>

      <p className="rs-quiet" style={{ marginTop: 24 }}>
        The bridge keeps your WhatsApp Web session. Voice notes become text, and the audio is deleted.
      </p>
    </Page>
  );
}
