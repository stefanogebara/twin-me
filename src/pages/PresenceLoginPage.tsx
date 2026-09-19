import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import BrandMark from '@/components/brand/Mark';
import '@/styles/money-v2.css';
import '@/styles/auth.css';

/**
 * /presence/login, in the sign-in frame of /auth (auth.css inside money-v2's .mv):
 * a narrow column on the page, the title and one grey line, Continue with Google
 * as the one 48/12 call to action, and the legal line. The gradient ground, the
 * glass card, the serif and the tracked caps are gone.
 *
 * Auth itself is unchanged: Google OAuth through AuthContext, landing on
 * /presence/onboarding, or on the Presence path ProtectedRoute sent us from
 * (?redirect=): an invite link must come back to itself after the sign-in.
 */
const PRESENCE_PATH = /^\/(presence\/[A-Za-z0-9_\-/]*|presence)$/;

export default function PresenceLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded, isSignedIn, signInWithOAuth } = useAuth();
  const wanted = new URLSearchParams(location.search).get('redirect') || '';
  const landing = PRESENCE_PATH.test(wanted) ? wanted : '/presence/onboarding';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoaded && isSignedIn) navigate(landing, { replace: true });
  }, [isLoaded, isSignedIn, navigate, landing]);

  async function continueWithGoogle() {
    setLoading(true);
    setError('');
    try {
      await signInWithOAuth('google', landing);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in could not start. Please try again.');
      setLoading(false);
    }
  }

  return (
    <main className="mv au" id="main-content">
      <div className="au-col">
        <Link className="mv-pill mv-pill--ghost au-back" to="/presence">
          <ArrowLeft size={14} aria-hidden="true" /> Presence
        </Link>

        <section className="au-room">
          <h1 className="au-enter" style={{ '--i': 0 } as CSSProperties}>Return to your Presence.</h1>
          <p className="mv-sub au-enter" style={{ '--i': 1 } as CSSProperties}>
            Use the account that will own and control the voice.
          </p>
        </section>

        <section className="au-controls" aria-label="Sign in">
          <button
            type="button"
            className="mv-pill mv-pill--lg au-enter"
            style={{ '--i': 2 } as CSSProperties}
            onClick={continueWithGoogle}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <BrandMark name="google" size={16} />}
            {loading ? 'Opening Google' : 'Continue with Google'}
          </button>
          {error ? <p className="au-note au-note--error" role="alert">{error}</p> : null}
          <p className="au-note au-enter" style={{ '--i': 3 } as CSSProperties}>
            By continuing you accept TwinMe’s <Link to="/terms" className="au-link">Terms</Link> and{' '}
            <Link to="/privacy-policy" className="au-link">Privacy Policy</Link>.
          </p>
        </section>

        <footer className="au-foot au-enter" style={{ '--i': 4 } as CSSProperties}>
          We verify identity before any voice is made.
        </footer>
      </div>
    </main>
  );
}
