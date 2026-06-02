import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../services/api/apiBase';

/**
 * Desktop (Tauri) Google sign-in handoff.
 *
 * Google blocks OAuth inside the embedded webview, and the desktop OAuth callback
 * isn't a registered Google redirect URI. So the desktop opens the SYSTEM browser
 * here. This page:
 *   - if the user is NOT signed in: runs the normal web Google sign-in (whose
 *     /oauth/callback redirect URI IS registered), returning here once authed;
 *   - if signed in: mints a one-time auth code (POST /auth/desktop-handoff) and
 *     deep-links it back into the app (twinme://auth?auth_code=...), where the
 *     existing claim flow establishes the session and lands on /soul-reveal.
 *
 * No Google Cloud Console change required.
 */
export default function DesktopHandoff() {
  const { isLoaded, isSignedIn, signInWithOAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;

    if (!isSignedIn) {
      // Not signed in yet — run the standard web Google sign-in and come back.
      signInWithOAuth('google', '/desktop-handoff').catch((e) => {
        console.error('[desktop-handoff] sign-in start failed', e);
        setError('Could not start Google sign-in. Please try again from the TwinMe app.');
      });
      return;
    }

    // Signed in — mint a one-time code and hand the session to the desktop app.
    (async () => {
      try {
        const res = await authFetch('/auth/desktop-handoff', { method: 'POST' });
        if (!res.ok) throw new Error(`handoff failed: ${res.status}`);
        const data = await res.json();
        if (!data?.auth_code) throw new Error('no auth_code returned');
        window.location.href = `twinme://auth?auth_code=${encodeURIComponent(data.auth_code)}`;
      } catch (e) {
        console.error('[desktop-handoff] mint failed', e);
        setError('Could not connect to the desktop app. Return to TwinMe and try again.');
      }
    })();
  }, [isLoaded, isSignedIn, signInWithOAuth]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#13121a',
        color: '#f5f5f4',
        fontFamily: '"Geist", "Inter", system-ui, sans-serif',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 380 }}>
        <div
          style={{
            fontFamily: '"Instrument Serif", Georgia, serif',
            fontSize: 32,
            letterSpacing: '-0.02em',
            marginBottom: 12,
          }}
        >
          {error ? 'Something went wrong' : isSignedIn ? 'Returning you to TwinMe…' : 'Signing you in…'}
        </div>
        <p style={{ color: 'rgba(245,245,244,0.6)', fontSize: 15, lineHeight: 1.55, margin: 0 }}>
          {error ||
            'Connecting your account, then handing you back to the TwinMe desktop app. You can close this tab once the app reopens.'}
        </p>
      </div>
    </div>
  );
}
