import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Database, Lock, Zap } from 'lucide-react';

const Step10HowItWorks = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Sparkles,
      color: '#D97706',
      title: 'Soul Signature Discovery',
      description: 'We analyze your digital footprint across platforms to discover your authentic patterns, interests, and personality traits.'
    },
    {
      icon: Database,
      color: '#8B5CF6',
      title: 'Comprehensive Data Integration',
      description: 'Connect 30+ platforms including Netflix, Spotify, Gmail, and more to build a complete picture of your digital self.'
    },
    {
      icon: Lock,
      color: '#10B981',
      title: 'Privacy-First Control',
      description: 'You have complete control over what data is collected, analyzed, and shared. Your privacy settings are granular and transparent.'
    },
    {
      icon: Zap,
      color: '#F59E0B',
      title: 'AI-Powered Insights',
      description: 'Advanced AI analyzes your patterns to reveal insights about your personality, preferences, and authentic self.'
    }
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-8 left-8 text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
      >
        Back
      </button>

      <div className="w-full max-w-5xl space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-normal tracking-tight text-stone-900 font-garamond">
            How Twin Me works
          </h1>
          <p className="text-[15px] leading-6 text-stone-600">
            Discover your authentic self through AI-powered analysis of your digital footprint
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="p-8 bg-white border border-stone-200 rounded-2xl shadow-sm"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${feature.color}15` }}
                >
                  <Icon className="w-6 h-6" style={{ color: feature.color }} />
                </div>
                <h3 className="text-2xl font-medium text-stone-900 font-garamond mb-3">
                  {feature.title}
                </h3>
                <p className="text-[15px] leading-6 text-stone-600">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => navigate('/step11')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step10HowItWorks;
