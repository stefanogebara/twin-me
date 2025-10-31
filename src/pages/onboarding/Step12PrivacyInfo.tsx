import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, Lock, Database, CheckCircle } from 'lucide-react';

const Step12PrivacyInfo = () => {
  const navigate = useNavigate();

  const privacyFeatures = [
    {
      icon: Eye,
      color: '#10B981',
      title: 'Complete transparency',
      description: 'You can see exactly what data we\'ve collected from each platform at any time. Nothing is hidden.'
    },
    {
      icon: Lock,
      color: '#D97706',
      title: 'Granular control',
      description: 'Use our Privacy Spectrum to control exactly how much of each life cluster (hobbies, work, relationships, etc.) is revealed.'
    },
    {
      icon: Database,
      color: '#8B5CF6',
      title: 'No AI training',
      description: 'We never use your data to train AI models. Your information is exclusively for creating your Soul Signature.'
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
            Things to know about your privacy
          </h1>
          <p className="text-[15px] leading-6 text-stone-600">
            Your data, your control
          </p>
        </div>

        <div className="space-y-4">
          {privacyFeatures.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="p-6 bg-white border border-stone-200 rounded-2xl shadow-sm"
              >
                <div className="flex items-start gap-4">
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
              </div>
            );
          })}
        </div>

        <div className="p-6 bg-stone-50 border border-stone-200 rounded-2xl">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-stone-900" />
            <p className="text-[15px] leading-6 text-stone-700">
              You can disconnect any platform, delete specific data points, or delete your entire account at any time. Your data is always under your control.
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => navigate('/step13')}
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

export default Step12PrivacyInfo;
