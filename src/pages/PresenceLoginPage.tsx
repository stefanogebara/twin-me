import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/presence-cosmos.css';

/**
 * /presence/login — the sign-in frame (see the Auth section of presence-cosmos.css),
 * in the register since 2026-09-12: a flat page with the mark, a title, one grey line
 * and one 48/12 call to action in a 360px column; on wide screens the photograph is the
 * right half, its caption on a frosted chip.
 *
 * Auth itself is unchanged: Google OAuth through AuthContext, landing on /presence/onboarding.
 */

function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" />
      <circle cx="14" cy="5" r="2.7" />
      <circle cx="23" cy="5" r="2.7" />
      <circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" />
      <circle cx="14" cy="23" r="2.7" />
      <circle cx="5" cy="23" r="2.7" />
      <circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

export default function PresenceLoginPage() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, signInWithOAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Sign in · Presence';
    return () => { document.title = previousTitle; };
  }, []);

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
    <main className="presence-cosmos pc-app" id="main-content">
      <div className="pc-auth" style={{ ["--auth-still" as string]: "url('/images/presence/cosmos-02-window.jpg')" } as React.CSSProperties}>
        <section className="pc-auth-left">
          <Link className="pc-auth-back" to="/presence"><ArrowLeft size={14} /> Presence</Link>

          <div className="pc-auth-card">
            <Mark />
            <h1 className="pc-apphead-title">Welcome back.</h1>
            <p className="pc-apphead-line">
              Sign in, or <Link to="/presence/onboarding">create a Presence</Link>.
            </p>

            <div className="pc-auth-actions">
              <button className="pc-btn pc-btn--cta pc-auth-google" onClick={continueWithGoogle} disabled={loading}>
                {loading ? <Loader2 className="pc-spin" size={16} /> : <span className="pc-auth-g" aria-hidden="true" />}
                Continue with Google
              </button>
            </div>

            {error ? <p className="pc-auth-error" role="alert">{error}</p> : null}

            <p className="pc-auth-legal">
              By continuing you accept TwinMe’s <Link to="/terms">Terms</Link> and{' '}
              <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </section>

        <aside className="pc-auth-panel" aria-hidden="true">
          <p className="pc-auth-caption">
            <strong>Sofia tells the story of the train to Petrópolis.</strong>
            Heard patiently, kept for her family.
          </p>
        </aside>
      </div>
    </main>
  );
}
