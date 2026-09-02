import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/presence-cosmos.css';

/**
 * /presence/login — Cosmos auth layout (see the Auth section of presence-cosmos.css):
 * a narrow centered column on linen — mark, small heading, one action, wordmark as the
 * floor — beside a paper-white panel holding a loose stack of polaroids with a curator
 * caption, the way cosmos.so/start frames a featured board next to the form.
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
    <main className="presence-cosmos" id="main-content">
      <div className="pc-auth">
        <section className="pc-auth-left">
          <Link className="pc-auth-back" to="/presence"><ArrowLeft size={15} /> Presence</Link>
          <Mark />

          <div className="pc-auth-card">
            <h1>Welcome back.</h1>
            <p className="pc-auth-sub">
              Sign in or <Link to="/presence/onboarding">create a Presence</Link>
            </p>

            <div className="pc-auth-actions">
              <button className="pc-auth-google" onClick={continueWithGoogle} disabled={loading}>
                {loading ? <Loader2 className="pc-spin" size={18} /> : <span className="pc-auth-g">G</span>}
                Continue with Google
              </button>
            </div>

            {error ? <p className="pc-auth-error" role="alert">{error}</p> : null}

            <p className="pc-auth-legal">
              By continuing, you agree to TwinMe’s <Link to="/terms">Terms</Link> and{' '}
              <Link to="/privacy">Privacy Policy</Link>.
            </p>

            <p className="pc-auth-trust">
              <ShieldCheck size={16} />
              One verified account owns the voice, the consent record, and the family relay.
            </p>
          </div>

          <div className="pc-auth-wordmark" aria-hidden="true">PRESENCE</div>
        </section>

        <aside className="pc-auth-panel" aria-hidden="true">
          <img src="/images/presence/cosmos-01-album.jpg" alt="" style={{ top: '-4%', width: 220, height: 290, transform: 'translateX(-50%) rotate(-2deg)' }} />
          <img src="/images/presence/cosmos-film-poster.jpg" alt="" style={{ top: '30%', width: 360, height: 240, transform: 'translateX(-50%) rotate(1.5deg)' }} />
          <img src="/images/presence/cosmos-03-garden.jpg" alt="" style={{ top: '64%', width: 200, height: 270, transform: 'translateX(-50%) rotate(-3deg)' }} />
          <p className="pc-auth-caption">
            <strong>Sofia tells the story of the train to Petrópolis.</strong>
            Heard patiently, kept for her family.
          </p>
        </aside>
      </div>
    </main>
  );
}
