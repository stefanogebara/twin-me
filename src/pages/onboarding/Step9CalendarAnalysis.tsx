import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, CheckCircle } from 'lucide-react';

const Step9CalendarAnalysis = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<Array<{title: string; description: string}>>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);

  useEffect(() => {
    const checkCalendarAndAnalyze = async () => {
      try {
        const tempUserId = sessionStorage.getItem('temp_user_id');

        // Check if Calendar was connected
        if (!tempUserId) {
          // No temp user ID means no Calendar connection happened
          setLoading(false);
          setCalendarConnected(false);
          return;
        }

        // Check if Calendar is connected for this temp user
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const statusResponse = await fetch(`${apiUrl}/connectors/status?userId=${tempUserId}`);

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const calendar = statusData.data?.find((c: any) => c.platform === 'google_calendar');

          if (calendar && calendar.connected) {
            setCalendarConnected(true);

            // Try to get real calendar analysis
            const analysisResponse = await fetch(`${apiUrl}/soul-data/style-profile?userId=${tempUserId}`);

            if (analysisResponse.ok) {
              const analysisData = await analysisResponse.json();

              // Extract calendar insights from analysis
              if (analysisData.data?.workLifeBalance) {
                const balance = analysisData.data.workLifeBalance;
                const newInsights = [];

                if (balance.peakProductivityHours) {
                  const hour = balance.peakProductivityHours;
                  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
                  newInsights.push({
                    title: `${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} person`,
                    description: `You tend to schedule important work during ${timeOfDay} hours`
                  });
                }

                if (balance.meetingFrequency) {
                  newInsights.push({
                    title: 'Meeting patterns',
                    description: `You average ${balance.meetingFrequency} meetings per week`
                  });
                }

                if (balance.focusTimePercentage) {
                  newInsights.push({
                    title: 'Focus time',
                    description: `${balance.focusTimePercentage}% of your calendar is dedicated to focused work`
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
        console.error('Calendar analysis error:', error);
        setLoading(false);
        setCalendarConnected(false);
      }
    };

    checkCalendarAndAnalyze();
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
          Your time patterns
        </h1>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-stone-900" />
            <p className="text-[15px] leading-6 text-stone-600 mb-2">
              Checking your calendar connection...
            </p>
            <p className="text-sm text-stone-400">
              Preparing your schedule analysis
            </p>
          </div>
        ) : !calendarConnected ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-[15px] leading-6 text-stone-600 mb-6 text-center">
              Google Calendar wasn't connected. We'll skip the schedule analysis for now.
              <br />
              You can connect Calendar later from your dashboard.
            </p>
            <button
              onClick={() => navigate('/step10')}
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
                  Schedule Insights
                </h2>
                <p className="text-sm text-stone-600">
                  Based on your calendar activity
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
                  Your calendar analysis is being processed. Check back in your dashboard soon!
                </p>
              )}
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => navigate('/step10')}
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

export default Step9CalendarAnalysis;
