import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, ArrowRight, X } from 'lucide-react';
import { PlatformLogo } from '@/components/PlatformLogos';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import type { PlatformsSummary } from '@/hooks/usePlatformsSummary';
import { Row } from '@/components/register';

export interface GoogleWorkspaceConnectProps {
  /** Canonical platform state from usePlatformsSummary (batch-3 unification). */
  summary: PlatformsSummary | undefined;
  navigate: (path: string) => void;
}

/**
 * Google Workspace as one row of the page kit: render it inside a List. One
 * connection unlocks Gmail and Calendar (bundled scopes).
 */
const GoogleWorkspaceConnect: React.FC<GoogleWorkspaceConnectProps> = ({
  summary,
  navigate,
}) => {
  const [showCheckboxModal, setShowCheckboxModal] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // If ANY Google service is connected, all are connected (bundled scopes).
  // Batch-3 convention: only state==='expired' (genuine auth failure) is not
  // connected; stale entries still count.
  const isAnyGoogleConnected = useMemo(() => {
    return !!summary?.breakdown.some(
      (entry) => entry.platform.startsWith('google_') && entry.state !== 'expired'
    );
  }, [summary]);

  const handleConnect = () => {
    setShowCheckboxModal(true);
  };

  const [connectError, setConnectError] = useState<string | null>(null);

  const handleContinueConnect = async () => {
    setShowCheckboxModal(false);
    setConnecting(true);
    setConnectError(null);
    try {
      const token = getAccessToken();
      if (!token) {
        setConnectError('Please sign in again to connect Google Workspace.');
        return;
      }
      const response = await fetch(`${API_URL}/entertainment/connect/google_gmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      // Require an absolute https URL before navigating — a malformed authUrl
      // would otherwise be treated as a relative path and strand the user on a
      // 404 with no error state (audit-2026-07-03).
      if (!response.ok || typeof data?.authUrl !== 'string' || !/^https:\/\//i.test(data.authUrl)) {
        setConnectError(data?.error || 'Could not start Google connection. Please try again.');
        return;
      }
      window.location.href = data.authUrl;
    } catch (err) {
      console.error('Google Workspace connect failed:', err);
      setConnectError('Connection failed. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <>
      <Row
        icon={<PlatformLogo platform="google" size={16} />}
        title="Google Workspace"
        line={connectError
          ? <span className="rs-bad">{connectError}</span>
          : isAnyGoogleConnected
            ? <><span className="rs-ok">Connected</span> · Gmail and Calendar</>
            : 'Gmail and Calendar, in one step'}
        action={!isAnyGoogleConnected ? (
          <button type="button" className="n-btn n-btn--ghost" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting' : 'Connect'}
          </button>
        ) : (
          <button type="button" className="n-btn n-btn--ghost" onClick={() => navigate('/get-started')}>
            Manage
          </button>
        )}
      />

      {/* "Check all the boxes": a plain dialog, portalled out of the list. */}
      {showCheckboxModal && createPortal(
        <div className="rs-overlay">
          <div className="rs-dialog" role="dialog" aria-modal="true" aria-labelledby="gw-dialog-title">
            <button
              type="button"
              onClick={() => setShowCheckboxModal(false)}
              className="rg-iconbtn"
              aria-label="Close"
            >
              <X aria-hidden="true" />
            </button>
            <h2 id="gw-dialog-title">One more thing</h2>
            <p>Google will ask you to approve access. Tick every box so your twin can read Gmail and Calendar.</p>
            {/* This list mirrors Google's consent screen. The shared OAuth
                scopes still include Drive/Contacts (Track C keeps the scopes,
                kills the Drive fetcher), so the boxes the user sees there are
                unchanged — do not trim this list without trimming scopes. */}
            <ul className="rs-checks">
              {['View and send email', 'View and edit calendar', 'View files in Drive', 'View contacts'].map(
                (item) => (
                  <li key={item}>
                    <span aria-hidden="true"><Check /></span>
                    <span>{item}</span>
                  </li>
                )
              )}
            </ul>
            <p>We never train on your data.</p>
            <button type="button" onClick={handleContinueConnect} className="n-btn n-btn--primary">
              Continue to Google
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default GoogleWorkspaceConnect;
