import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/presence-marketing.css';

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
    <main className="presence-login" id="main-content">
      <Link className="presence-login-back" to="/presence"><ArrowLeft size={15} /> Presence</Link>
      <section className="presence-login-copy">
        <p className="presence-kicker">Your family relay</p>
        <h1>Continue building a Presence that sounds like you.</h1>
        <p>Your setup, voice consent and family relationship stay attached to one verified account.</p>
        <div className="presence-login-trust"><ShieldCheck size={17} /><span>We verify identity before any provider-backed voice can be created.</span></div>
      </section>
      <section className="presence-login-card" aria-labelledby="presence-login-title">
        <div>
          <p className="presence-kicker">Sign in</p>
          <h2 id="presence-login-title">Return to your Presence</h2>
          <p>Use the account that will own and control the voice.</p>
        </div>
        <button className="presence-google-button" onClick={continueWithGoogle} disabled={loading}>
          {loading ? <Loader2 className="presence-spin" size={17} /> : <span className="presence-google-g">G</span>}
          Continue with Google
          <ArrowRight size={15} />
        </button>
        {error ? <p className="presence-login-error" role="alert">{error}</p> : null}
        <p className="presence-login-legal">By continuing, you agree to TwinMe’s <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>
      </section>
    </main>
  );
}
