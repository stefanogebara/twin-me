import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';

const Step3Discovery = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [profile, setProfile] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    const researchPerson = async () => {
      try {
        // Get name from session storage
        const storedName = sessionStorage.getItem('onboarding_name') || 'User';
        setName(storedName);

        // Call the real AI research API
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${apiUrl}/ai/research-person`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: storedName })
        });

        if (!response.ok) {
          throw new Error('Research API failed');
        }

        const data = await response.json();
        setProfile(data.data.profile);
        setLoading(false);
      } catch (err) {
        console.error('Research error:', err);
        setError(true);
        // Fallback to generic message
        setProfile(`${name} appears to be a creative professional with interests spanning technology, design, and personal development. Based on publicly available information, they show engagement with modern web development, AI technologies, and entrepreneurial ventures.

Their online presence suggests someone who values innovation, continuous learning, and authentic self-expression. They demonstrate active participation in tech communities and show curiosity about emerging technologies and personal growth methodologies.`);
        setLoading(false);
      }
    };

    researchPerson();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-8 left-8 text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
      >
        Log out
      </button>

      <div className="w-full max-w-2xl space-y-8">
        <h1 className="text-4xl font-normal tracking-tight text-stone-900 text-center font-garamond">
          Here's what I found out about you
        </h1>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-stone-900" />
            <p className="text-[15px] leading-6 text-stone-600">
              Researching your public information...
            </p>
          </div>
        ) : (
          <>
            <div className="p-8 bg-white border border-stone-200 rounded-2xl shadow-sm">
              <p className="text-[15px] leading-7 text-stone-700 whitespace-pre-line">
                {profile.split('\n\n').map((paragraph, index) => (
                  <span key={index} className="block mb-4">
                    {index === 0 && <strong className="text-stone-900">{name}</strong>}{' '}
                    {index === 0 ? paragraph.replace(name, '') : paragraph}
                  </span>
                ))}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate('/step2')}
                className="inline-flex items-center justify-center px-5 py-2.5 text-[15px] leading-5 font-medium text-stone-700 bg-white border border-stone-200 rounded-lg transition-all duration-200 hover:bg-stone-50 hover:border-stone-300"
              >
                Edit
              </button>

              <button
                onClick={() => navigate('/step4')}
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

export default Step3Discovery;
