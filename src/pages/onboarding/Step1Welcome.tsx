import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Lock, Target } from 'lucide-react';

interface Step1WelcomeProps {
  onNext?: () => void;
  onPrev?: () => void;
  goToStep?: (step: number) => void;
}

const Step1Welcome: React.FC<Step1WelcomeProps> = ({ onNext }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-12 items-center">
        {/* Left: Beautiful Nature Card */}
        <div
          className="relative overflow-hidden rounded-2xl shadow-lg aspect-[3/4]"
          style={{
            background: 'linear-gradient(135deg, #1a5f4a 0%, #2d8b5f 50%, #f59e0b 100%)',
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100%25\' height=\'100%25\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'nature\' patternUnits=\'userSpaceOnUse\' width=\'40\' height=\'40\'%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'2\' fill=\'%23fbbf24\' opacity=\'0.3\'/%3E%3Ccircle cx=\'30\' cy=\'30\' r=\'3\' fill=\'%23fbbf24\' opacity=\'0.2\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'url(%23nature)\'/%3E%3C/svg%3E")'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"></div>

          <div className="absolute top-8 left-8">
            <div
              className="px-4 py-2 rounded-full backdrop-blur-md"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                fontFamily: 'EB Garamond, Georgia, serif',
                fontWeight: 500
              }}
            >
              Your Name
            </div>
          </div>

          <div className="absolute bottom-8 left-8 right-8">
            <p
              className="text-white text-lg leading-relaxed"
              style={{
                fontFamily: 'EB Garamond, Georgia, serif',
                textShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }}
            >
              "Perhaps we are searching in the branches for what we only find in the roots."
            </p>
            <p
              className="text-white/80 mt-2 text-sm"
              style={{
                fontFamily: 'EB Garamond, Georgia, serif'
              }}
            >
              — Rami
            </p>
          </div>
        </div>

        {/* Right: Welcome Content */}
        <div>
          <h1
            className="text-5xl mb-6 font-garamond font-normal tracking-tight text-stone-900"
            style={{ lineHeight: 1.1 }}
          >
            Discover Your
            <br />
            <span className="text-stone-900">Soul Signature</span>
          </h1>

          <p className="text-[15px] leading-6 mb-8 text-stone-600">
            The first platform that discovers your authentic self, with state of the art AI and your complete digital footprint
          </p>

          <button
            onClick={() => {
              if (onNext) {
                onNext();
              } else {
                navigate('/onboarding/about');
              }
            }}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-button-hover focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          >
            Begin
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="mt-8 pt-8 border-t border-stone-200">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
                <span className="text-[15px] leading-6 text-stone-600">Connect 30+ platforms</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100">
                  <Lock className="w-4 h-4 text-teal-600" />
                </div>
                <span className="text-[15px] leading-6 text-stone-600">Complete privacy control</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100">
                  <Target className="w-4 h-4 text-violet-600" />
                </div>
                <span className="text-[15px] leading-6 text-stone-600">Discover your authentic patterns</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step1Welcome;
