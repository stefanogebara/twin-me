import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';

const Step6InterestDiscovery = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [interests, setInterests] = useState('');

  useEffect(() => {
    const storedInterests = sessionStorage.getItem('onboarding_interests') || 'various interests and activities';
    setInterests(storedInterests);

    // Simulate AI research loading
    setTimeout(() => {
      setLoading(false);
    }, 3000);
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
          Discovering your unique patterns
        </h1>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-stone-900" />
            <p className="text-[15px] leading-6 text-stone-600">
              Analyzing your interests and passions...
            </p>
          </div>
        ) : (
          <>
            <div className="p-8 bg-white border border-stone-200 rounded-2xl shadow-sm">
              <h2 className="text-2xl font-medium text-stone-900 font-garamond mb-6">
                Your Interest Profile
              </h2>

              <p className="text-[15px] leading-7 text-stone-700 space-y-4">
                <span className="block">
                  Based on what you've shared, you demonstrate a rich tapestry of interests that reveal a curious and multifaceted personality. Your passions suggest someone who values both introspection and active engagement with the world.
                </span>
                <span className="block">
                  Your interests indicate a balance between creative expression and analytical thinking, suggesting a well-rounded approach to life's experiences.
                </span>
              </p>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate('/step5')}
                className="inline-flex items-center justify-center px-5 py-2.5 text-[15px] leading-5 font-medium text-stone-700 bg-white border border-stone-200 rounded-lg transition-all duration-200 hover:bg-stone-50 hover:border-stone-300"
              >
                Edit
              </button>

              <button
                onClick={() => navigate('/step7')}
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

export default Step6InterestDiscovery;
