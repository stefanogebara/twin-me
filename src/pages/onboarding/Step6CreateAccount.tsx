import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignUp, useSignIn } from '@clerk/clerk-react';
import { ArrowRight, Loader2, AlertCircle } from 'lucide-react';

interface Step6CreateAccountProps {
  onNext?: () => void;
  onPrev?: () => void;
  goToStep?: (step: number) => void;
}

const Step6CreateAccount: React.FC<Step6CreateAccountProps> = ({ onNext, onPrev }) => {
  const navigate = useNavigate();
  const { signUp, setActive } = useSignUp();
  const { signIn } = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');

  const handleBack = () => {
    if (onPrev) {
      onPrev();
    } else {
      navigate(-1);
    }
  };

  const handleComplete = async () => {
    if (onNext) {
      onNext();
    } else {
      navigate('/soul-signature');
    }
  };

  const handleGoogleSignIn = async () => {
    if (!signIn) return;

    try {
      setLoading(true);
      setError('');

      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/soul-signature',
      });
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setError(err?.errors?.[0]?.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUp) return;

    try {
      setLoading(true);
      setError('');

      // Get name from onboarding
      const name = sessionStorage.getItem('onboarding_name') || '';
      const [firstName, ...lastNameParts] = name.split(' ');
      const lastName = lastNameParts.join(' ');

      // Create the sign up
      await signUp.create({
        emailAddress: email,
        password: password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

      // Send verification email
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      // Show verification input
      setVerifying(true);
      setLoading(false);
    } catch (err: any) {
      console.error('Sign up error:', err);
      setError(err?.errors?.[0]?.message || 'Failed to create account');
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUp || !setActive) return;

    try {
      setLoading(true);
      setError('');

      // Verify the email code
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status === 'complete') {
        // Set the session active
        await setActive({ session: completeSignUp.createdSessionId });

        // Complete onboarding
        await handleComplete();
      } else {
        setError('Verification incomplete. Please try again.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(err?.errors?.[0]?.message || 'Failed to verify email');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <button
        onClick={handleBack}
        className="absolute top-8 left-8 text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
      >
        Back
      </button>

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-normal tracking-tight text-stone-900 mb-3 font-garamond">
            Create your account
          </h1>
          <p className="text-[15px] leading-6 text-stone-600">
            Start discovering your soul signature
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {!verifying ? (
          <>
            <form onSubmit={handleEmailSignUp} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-stone-900 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 text-[15px] text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-300 transition-all"
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-stone-900 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 text-[15px] text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-300 transition-all"
                  placeholder="At least 8 characters"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-white bg-stone-900 rounded-xl transition-all duration-200 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-stone-900/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-stone-100 text-stone-600">Or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </>
        ) : (
          <form onSubmit={handleVerifyEmail} className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-[15px] leading-6 text-stone-700">
                We sent a verification code to
              </p>
              <p className="text-[15px] leading-6 font-medium text-stone-900">
                {email}
              </p>
            </div>

            <div>
              <label htmlFor="code" className="block text-sm font-medium text-stone-900 mb-2">
                Verification Code
              </label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full px-4 py-3 text-[15px] text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-300 transition-all text-center tracking-widest"
                placeholder="000000"
                maxLength={6}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-white bg-stone-900 rounded-xl transition-all duration-200 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-stone-900/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Verify Email
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setVerifying(false);
                setCode('');
                setError('');
              }}
              className="w-full text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Step6CreateAccount;
