import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Brain, MessageSquare, Clock, Shield } from 'lucide-react';

const Step11MemorySystem = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: MessageSquare,
      color: '#D97706',
      title: 'Contextual conversations',
      description: 'Your Twin remembers past conversations and can reference them in future interactions, creating a continuous and meaningful dialogue.'
    },
    {
      icon: Clock,
      color: '#10B981',
      title: 'Temporal awareness',
      description: 'Your Twin understands the timeline of your life events, recognizing how your interests and preferences have evolved over time.'
    },
    {
      icon: Brain,
      color: '#8B5CF6',
      title: 'Pattern recognition',
      description: 'Your Twin identifies patterns in your behavior, preferences, and communication style to better represent your authentic self.'
    },
    {
      icon: Shield,
      color: '#EA4335',
      title: 'Privacy-respecting memory',
      description: 'You control what your Twin remembers. You can edit or delete any memory at any time, ensuring complete privacy control.'
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

      <div className="w-full max-w-3xl space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-normal tracking-tight text-stone-900 font-garamond">
            Your Twin's memory system
          </h1>
          <p className="text-[15px] leading-6 text-stone-600">
            How your digital twin learns and remembers
          </p>
        </div>

        <div className="p-8 bg-white border border-stone-200 rounded-2xl shadow-sm">
          <div className="space-y-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={index} className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${feature.color}15` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: feature.color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-stone-900 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-[15px] leading-6 text-stone-600">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => navigate('/step12')}
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

export default Step11MemorySystem;
