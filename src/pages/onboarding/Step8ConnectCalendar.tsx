import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const Step8ConnectCalendar = () => {
  const navigate = useNavigate();

  const handleConnectCalendar = async () => {
    try {
      // Get or create temporary user ID for onboarding
      let tempUserId = sessionStorage.getItem('temp_user_id');
      if (!tempUserId) {
        tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('temp_user_id', tempUserId);
      }

      // Call backend to get OAuth URL with temp user ID
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiUrl}/connectors/auth/google_calendar?userId=${tempUserId}`);

      if (!response.ok) {
        console.error('Failed to initiate Calendar OAuth');
        navigate('/step9'); // Skip on error
        return;
      }

      const data = await response.json();
      if (data.success && data.data.authUrl) {
        // Store where to return after OAuth
        sessionStorage.setItem('oauth_return_step', 'step9');
        // Redirect to Google OAuth
        window.location.href = data.data.authUrl;
      } else {
        navigate('/step9'); // Skip on error
      }
    } catch (error) {
      console.error('Calendar OAuth error:', error);
      navigate('/step9'); // Skip on error
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-8 left-8 text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
      >
        Back
      </button>

      <div className="w-full max-w-2xl space-y-12">
        <h1 className="text-3xl font-normal tracking-tight text-stone-900 text-center font-garamond">
          Connect your Google Calendar
        </h1>

        <div className="space-y-6 text-center">
          <h2 className="text-lg font-semibold text-stone-900">
            Why do we need your calendar?
          </h2>

          <p className="text-[15px] leading-6 text-stone-700">
            Your calendar reveals your natural rhythms and priorities. With access, Twin Me can:
          </p>

          <ul className="space-y-2 text-left max-w-md mx-auto text-[15px] leading-6 text-stone-700">
            <li className="flex items-start gap-2">
              <span className="text-stone-900 font-medium">•</span>
              <span>Understand your daily routines and preferences</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-stone-900 font-medium">•</span>
              <span>Learn when you're most productive</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-stone-900 font-medium">•</span>
              <span>Discover your work-life balance patterns</span>
            </li>
          </ul>

          <div className="pt-4 space-y-1 text-[15px]">
            <p className="text-stone-900">
              Twin Me <strong className="font-semibold underline decoration-stone-900 underline-offset-2">will not</strong> modify calendar events without approval.
            </p>
            <p className="text-stone-900">
              We <strong className="font-semibold underline decoration-stone-900 underline-offset-2">don't</strong> train on your data.
            </p>
          </div>
        </div>

        <div className="max-w-md mx-auto">
          <button
            onClick={handleConnectCalendar}
            className="w-full flex items-center justify-between px-6 py-4 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] group"
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3.01 4.9 3.01 6L3 20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V10H19V20ZM19 8H5V6H19V8Z" fill="#4285F4"/>
              </svg>
              <span>Connect Google Calendar</span>
            </div>
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={() => navigate('/step9')}
            className="text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step8ConnectCalendar;
