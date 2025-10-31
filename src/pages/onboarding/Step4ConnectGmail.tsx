import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface Step4ConnectGmailProps {
  onNext?: () => void;
  onPrev?: () => void;
  goToStep?: (step: number) => void;
}

const Step4ConnectGmail: React.FC<Step4ConnectGmailProps> = ({ onNext, onPrev }) => {
  const navigate = useNavigate();

  const handleSkip = () => {
    if (onNext) {
      onNext();
    } else {
      navigate('/onboarding/analysis');
    }
  };

  const handleBack = () => {
    if (onPrev) {
      onPrev();
    } else {
      navigate(-1);
    }
  };

  const handleConnectGmail = async () => {
    try {
      // Get or create temporary user ID for onboarding
      let tempUserId = sessionStorage.getItem('temp_user_id');
      if (!tempUserId) {
        tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('temp_user_id', tempUserId);
      }

      // Call backend to get OAuth URL with temp user ID
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiUrl}/connectors/auth/google_gmail?userId=${tempUserId}`);

      if (!response.ok) {
        console.error('Failed to initiate Gmail OAuth');
        handleSkip(); // Skip on error
        return;
      }

      const data = await response.json();
      if (data.success && data.data.authUrl) {
        // Store where to return after OAuth
        sessionStorage.setItem('oauth_return_step', 'analysis');
        // Redirect to Google OAuth
        window.location.href = data.data.authUrl;
      } else {
        handleSkip(); // Skip on error
      }
    } catch (error) {
      console.error('Gmail OAuth error:', error);
      handleSkip(); // Skip on error
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

      <div className="w-full max-w-2xl space-y-12">
        <h1 className="text-3xl font-normal tracking-tight text-stone-900 text-center font-garamond">
          Connect your Gmail account
        </h1>

        <div className="space-y-6 text-center">
          <h2 className="text-lg font-semibold text-stone-900">
            Why do we need Gmail?
          </h2>

          <p className="text-[15px] leading-6 text-stone-700">
            Twin Me needs your email to discover your authentic communication style. With email, it can:
          </p>

          <ul className="space-y-2 text-left max-w-md mx-auto text-[15px] leading-6 text-stone-700">
            <li className="flex items-start gap-2">
              <span className="text-stone-900 font-medium">•</span>
              <span>Understand your writing style and personality</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-stone-900 font-medium">•</span>
              <span>Discover your professional network</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-stone-900 font-medium">•</span>
              <span>Map your authentic communication patterns</span>
            </li>
          </ul>

          <div className="pt-4 space-y-1 text-[15px]">
            <p className="text-stone-900">
              Twin Me <strong className="font-semibold underline decoration-stone-900 underline-offset-2">will not</strong> send emails without approval.
            </p>
            <p className="text-stone-900">
              We <strong className="font-semibold underline decoration-stone-900 underline-offset-2">don't</strong> train on your data.
            </p>
          </div>
        </div>

        <div className="max-w-md mx-auto">
          <button
            onClick={handleConnectGmail}
            className="w-full flex items-center justify-between px-6 py-4 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] group"
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="#EA4335"/>
              </svg>
              <span>Connect Gmail</span>
            </div>
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={handleSkip}
            className="text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step4ConnectGmail;
