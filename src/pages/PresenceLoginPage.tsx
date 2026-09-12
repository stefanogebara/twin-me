import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/money-v2.css';
import '@/styles/auth.css';

/**
 * /presence/login, in the sign-in frame of /auth (auth.css inside money-v2's .mv):
 * a narrow column on the page, the title and one grey line, Continue with Google
 * as the one 48/12 call to action, and the legal line. The gradient ground, the
 * glass card, the serif and the tracked caps are gone.
 *
 * Auth itself is unchanged: Google OAuth through AuthContext, landing on
 * /presence/onboarding.
 */
export default function PresenceLoginPage() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, signInWithOAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoaded && isSignedIn) navigate('/presence/onboarding', { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  async function continueWithGoogle() {
    setLoading(true);
    setError('');
    try {
      await signInWithOAuth('google', '/presence/onboarding');
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
            {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : null}
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
