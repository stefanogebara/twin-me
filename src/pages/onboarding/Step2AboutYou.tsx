import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const Step2AboutYou = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');

  const handleContinue = () => {
    if (fullName.trim()) {
      sessionStorage.setItem('onboarding_name', fullName);
      navigate('/step3');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-8 left-8 text-[15px] text-stone-600 hover:text-stone-900 transition-colors"
      >
        Back
      </button>

      <div className="w-full max-w-md space-y-12">
        <h1 className="text-4xl font-normal tracking-tight text-stone-900 text-center font-garamond">
          Tell me about yourself
        </h1>

        <div className="space-y-6">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="What's your full name?"
            className="w-full px-5 py-4 text-[15px] leading-5 text-stone-900 placeholder:text-stone-400 bg-stone-50 border border-stone-200 rounded-xl shadow-input transition-all duration-200 hover:bg-stone-100 hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleContinue();
              }
            }}
            autoFocus
          />

          <button
            onClick={handleContinue}
            disabled={!fullName.trim()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-button-hover focus:outline-none focus:ring-2 focus:ring-stone-900/10 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step2AboutYou;
