import React, { useState, useMemo } from 'react';
import { Check, Lock, ArrowRight, X } from 'lucide-react';
import { PlatformLogo } from '@/components/PlatformLogos';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import type { PlatformsSummary } from '@/hooks/usePlatformsSummary';

export interface GoogleWorkspaceConnectProps {
  /** Canonical platform state from usePlatformsSummary (batch-3 unification). */
  summary: PlatformsSummary | undefined;
  navigate: (path: string) => void;
}

interface GoogleService {
  id: string;
  name: string;
  logoKey: string;
}

// replan-2026-06-10 Track C: only promise what the product actually reads.
// The Drive fetcher was deleted (Drive/Docs/Sheets are no longer ingested);
// the shared Google OAuth scopes are unchanged, but the UI promises only
// Gmail + Calendar.
const GOOGLE_SERVICES: GoogleService[] = [
  { id: 'google_gmail', name: 'Gmail', logoKey: 'google_gmail' },
  { id: 'google_calendar', name: 'Calendar', logoKey: 'google_calendar' },
];

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
      if (!response.ok || !data.authUrl) {
        setConnectError(data?.error || 'Could not start Google connection. Please try again.');
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      setConnectError('Connection failed. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <>
      <div
        className="rounded-[8px] p-4 mb-4"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-7 h-7">
            <PlatformLogo platform="google" size={20} />
          </div>
          <div>
            <h3 className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              Google Workspace
            </h3>
            {isAnyGoogleConnected && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(16,183,127,0.8)' }}>
                <Check className="w-3 h-3" /> Connected
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-[12px] leading-relaxed mb-4" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
          Connect once to unlock Gmail and Calendar.
        </p>

        {/* Service badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {GOOGLE_SERVICES.map((service) => (
            <div
              key={service.id}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px]"
              style={{
                background: isAnyGoogleConnected
                  ? 'rgba(16,183,127,0.08)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${
                  isAnyGoogleConnected
                    ? 'rgba(16,183,127,0.15)'
                    : 'rgba(255,255,255,0.06)'
                }`,
                color: isAnyGoogleConnected
                  ? 'rgba(16,183,127,0.95)'
                  : 'rgba(255,255,255,0.55)',
              }}
            >
              <PlatformLogo platform={service.logoKey} size={12} />
              <span>{service.name}</span>
              {isAnyGoogleConnected ? (
                <Check className="w-2.5 h-2.5" />
              ) : (
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ border: '1px solid rgba(255,255,255,0.15)' }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Capability description */}
        <p className="text-[11px] leading-relaxed mb-5" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
          Your twin can read your emails and check your schedule — all in your voice.
        </p>

        {/* CTA or Connected state */}
        {!isAnyGoogleConnected ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{
              background: '#F5F0EB',
              color: 'var(--primary-foreground, #110f0f)',
            }}
          >
            {connecting ? (
              'Connecting...'
            ) : (
              <>
                Connect Google Workspace
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => navigate('/get-started')}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] transition-opacity hover:opacity-60"
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255, 255, 255, 0.55)',
            }}
          >
            Manage connections
          </button>
        )}

        {/* Error message */}
        {connectError && (
          <p className="text-[12px] text-center mt-3" style={{ color: '#dc2626' }}>
            {connectError}
          </p>
        )}

        {/* Trust badge */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          <Lock className="w-3 h-3" style={{ color: 'rgba(255, 255, 255, 0.55)' }} />
          <span className="text-[10px]" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
            Enterprise-grade encryption. We never train on your data.
          </span>
        </div>
      </div>

      {/* "Check all the boxes" modal */}
      {showCheckboxModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="relative w-full max-w-md rounded-2xl p-6"
            style={{
              background: 'var(--glass-surface-bg, rgba(30,28,34,0.95))',
              backdropFilter: 'blur(42px)',
              WebkitBackdropFilter: 'blur(42px)',
              border: '1px solid var(--glass-surface-border, rgba(255,255,255,0.10))',
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowCheckboxModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg transition-opacity hover:opacity-60"
              style={{ color: 'rgba(255, 255, 255, 0.55)' }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal content */}
            <div className="flex items-center gap-3 mb-4">
              <PlatformLogo platform="google" size={28} />
              <h3 className="text-base font-medium" style={{ color: 'var(--foreground)' }}>
                One more thing
              </h3>
            </div>

            <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Google will ask you to approve permissions. Make sure to{' '}
              <strong style={{ color: 'var(--foreground)' }}>check all the boxes</strong>{' '}
              so your twin can access Gmail and Calendar.
            </p>

            {/* Visual hint */}
            <div
              className="rounded-[8px] p-4 mb-5"
              style={{ border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-[11px] font-medium mb-3" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
                On the Google consent screen:
              </p>
              {/* This list mirrors Google's consent screen. The shared OAuth
                  scopes still include Drive/Contacts (Track C keeps the scopes,
                  kills the Drive fetcher), so the boxes the user sees there are
                  unchanged — do not trim this list without trimming scopes. */}
              {['View and send email', 'View and edit calendar', 'View files in Drive', 'View contacts'].map(
                (item) => (
                  <div key={item} className="flex items-center gap-2 py-1">
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center"
                      style={{ background: 'rgba(66,133,244,0.2)', border: '1px solid rgba(66,133,244,0.3)' }}
                    >
                      <Check className="w-2.5 h-2.5" style={{ color: '#4285F4' }} />
                    </div>
                    <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {item}
                    </span>
                  </div>
                )
              )}
            </div>

            <button
              onClick={handleContinueConnect}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                background: '#F5F0EB',
                color: 'var(--primary-foreground, #110f0f)',
              }}
            >
              Continue to Google
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default GoogleWorkspaceConnect;
