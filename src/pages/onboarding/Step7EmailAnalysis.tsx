import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, CheckCircle } from 'lucide-react';

const Step7EmailAnalysis = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [insights, setInsights] = useState<Array<{title: string; description: string}>>([]);
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    const checkGmailAndAnalyze = async () => {
      try {
        const storedName = sessionStorage.getItem('onboarding_name') || 'User';
        setName(storedName);

        const tempUserId = sessionStorage.getItem('temp_user_id');

        // Check if Gmail was connected
        if (!tempUserId) {
          // No temp user ID means no Gmail connection happened
          setLoading(false);
          setGmailConnected(false);
          return;
        }

        // Check if Gmail is connected for this temp user
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const statusResponse = await fetch(`${apiUrl}/connectors/status?userId=${tempUserId}`);

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const gmail = statusData.data?.find((c: any) => c.platform === 'google_gmail');

          if (gmail && gmail.connected) {
            setGmailConnected(true);

            // Try to get real email analysis
            const analysisResponse = await fetch(`${apiUrl}/soul-data/style-profile?userId=${tempUserId}`);

            if (analysisResponse.ok) {
              const analysisData = await analysisResponse.json();

              // Extract communication insights from analysis
              if (analysisData.data?.communicationStyle) {
                const style = analysisData.data.communicationStyle;
                const newInsights = [];

                if (style.tone) {
                  newInsights.push({
                    title: style.tone,
                    description: `Your communication has a ${style.tone.toLowerCase()} tone`
                  });
                }

                if (style.formality) {
                  newInsights.push({
                    title: style.formality,
                    description: `You maintain a ${style.formality.toLowerCase()} level of formality`
                  });
                }

                if (style.avgResponseTime) {
                  newInsights.push({
                    title: 'Response pattern',
                    description: `You typically respond within ${style.avgResponseTime}`
                  });
                }

                if (newInsights.length > 0) {
                  setInsights(newInsights);
                }
              }
            }
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Email analysis error:', error);
        setLoading(false);
        setGmailConnected(false);
      }
    };

    checkGmailAndAnalyze();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-8 left-8 text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
      >
        Back
      </button>

      <div className="w-full max-w-2xl space-y-8">
        <h1 className="text-4xl font-normal tracking-tight text-stone-900 text-center font-garamond">
          Your communication style
        </h1>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-stone-900" />
            <p className="text-[15px] leading-6 text-stone-600 mb-2">
              Checking your email connection...
            </p>
            <p className="text-sm text-stone-400">
              Preparing your communication analysis
            </p>
          </div>
        ) : !gmailConnected ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-[15px] leading-6 text-stone-600 mb-6 text-center">
              Gmail wasn't connected. We'll skip the email analysis for now.
              <br />
              You can connect Gmail later from your dashboard.
            </p>
            <button
              onClick={() => navigate('/step8')}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="p-8 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-6">
              <div>
                <h2 className="text-2xl font-medium text-stone-900 font-garamond mb-2">
                  Email Style Analysis
                </h2>
                <p className="text-sm text-stone-600">
                  Based on your recent email history
                </p>
              </div>

              {insights.length > 0 ? (
                <div className="space-y-4">
                  {insights.map((insight, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-green-500" />
                      <div>
                        <p className="font-medium text-stone-900 mb-1">
                          {insight.title}
                        </p>
                        <p className="text-sm text-stone-600">
                          {insight.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-600">
                  Your email analysis is being processed. Check back in your dashboard soon!
                </p>
              )}
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => navigate('/step8')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-stone-900/10"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Step7EmailAnalysis;
