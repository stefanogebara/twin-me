import React from 'react';
import { Sparkles, Heart, Brain, Palette, Music, Film, Gamepad2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useTheme } from '@/contexts/ThemeContext';

interface SoulEssenceProps {
  uniquenessScore: number;
  topInterests: string[];
  coreTraits: string[];
  soulSignatureProgress: number;
}

export const SoulSignatureEssence: React.FC<SoulEssenceProps> = ({
  uniquenessScore,
  topInterests,
  coreTraits,
  soulSignatureProgress
}) => {
  const { theme } = useTheme();
  const getEssenceIcon = (interest: string) => {
    const lowerInterest = interest.toLowerCase();
    if (lowerInterest.includes('music')) return Music;
    if (lowerInterest.includes('film') || lowerInterest.includes('movie')) return Film;
    if (lowerInterest.includes('game') || lowerInterest.includes('gaming')) return Gamepad2;
    if (lowerInterest.includes('art') || lowerInterest.includes('creative')) return Palette;
    if (lowerInterest.includes('emotion') || lowerInterest.includes('heart')) return Heart;
    return Sparkles;
  };

  return (
    <div className="mb-8">
      {/* Hero Section - Clean minimal design */}
      <div
        className={`relative overflow-hidden rounded-2xl p-8 shadow-sm mb-6 transition-all duration-300 ${
          theme === 'dark'
            ? 'bg-stone-900 border border-stone-800'
            : 'bg-white border border-slate-200'
        }`}
      >

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-xl ${
                  theme === 'dark'
                    ? 'bg-stone-800 border border-stone-700'
                    : 'bg-slate-50 border border-slate-200'
                }`}>
                  <Sparkles className={`w-8 h-8 ${
                    theme === 'dark' ? 'text-stone-400' : 'text-slate-600'
                  }`} />
                </div>
                <h1 className={`text-4xl font-medium ${
                  theme === 'dark' ? 'text-stone-50' : 'text-slate-900'
                }`} style={{ fontFamily: 'var(--_typography---font--styrene-a)' }}>
                  Your Soul Signature
                </h1>
              </div>
              <p className={`text-lg max-w-2xl leading-relaxed ${
                theme === 'dark' ? 'text-stone-300' : 'text-slate-700'
              }`}>
                The authentic patterns, curiosities, and characteristics that make you <span className={`font-semibold ${
                  theme === 'dark' ? 'text-stone-100' : 'text-slate-900'
                }`}>uniquely you</span>
              </p>
            </div>

            {/* Uniqueness Score - Clean design */}
            <div className="text-right">
              <div className={`inline-flex flex-col items-end rounded-2xl px-8 py-5 ${
                theme === 'dark'
                  ? 'bg-stone-800 border border-stone-700'
                  : 'bg-slate-50 border border-slate-200'
              }`}>
                <span className={`text-sm mb-1 font-medium ${
                  theme === 'dark' ? 'text-stone-400' : 'text-slate-500'
                }`}>Authenticity</span>
                <span className={`text-5xl font-medium ${
                  theme === 'dark' ? 'text-stone-100' : 'text-slate-900'
                }`} style={{ fontFamily: 'var(--_typography---font--styrene-a)' }}>
                  {Math.round(uniquenessScore)}%
                </span>
                <span className={`text-xs mt-1 ${
                  theme === 'dark' ? 'text-stone-500' : 'text-slate-400'
                }`}>Discovered</span>
              </div>
            </div>
          </div>

          {/* Progress Bar - Clean design */}
          <div className={`mb-6 rounded-xl p-4 ${
            theme === 'dark'
              ? 'bg-stone-800 border border-stone-700'
              : 'bg-slate-50 border border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${
                theme === 'dark' ? 'text-stone-300' : 'text-slate-700'
              }`}>Soul Discovery Progress</span>
              <span className={`text-sm font-semibold ${
                theme === 'dark' ? 'text-stone-200' : 'text-slate-800'
              }`}>{Math.round(soulSignatureProgress)}% Complete</span>
            </div>
            <div className={`h-3 rounded-full overflow-hidden ${
              theme === 'dark' ? 'bg-stone-700' : 'bg-slate-200'
            }`}>
              <div
                className={`h-full transition-all duration-500 ${
                  theme === 'dark' ? 'bg-stone-400' : 'bg-slate-600'
                }`}
                style={{ width: `${soulSignatureProgress}%` }}
              />
            </div>
          </div>

          {/* Core Essence Grid - Redesigned */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Your Authentic Interests */}
            <div className={`rounded-xl p-5 transition-all duration-200 ${
              theme === 'dark'
                ? 'bg-stone-800 border border-stone-700 hover:bg-stone-800/90'
                : 'bg-white border border-slate-200 hover:bg-slate-50'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <Heart className={`w-5 h-5 ${
                  theme === 'dark' ? 'text-stone-400' : 'text-slate-600'
                }`} />
                <h3 className={`text-lg font-medium ${
                  theme === 'dark' ? 'text-stone-100' : 'text-slate-900'
                }`}>
                  Your Interests
                </h3>
              </div>
              <div className="space-y-2">
                {topInterests.length > 0 ? (
                  topInterests.slice(0, 5).map((interest, index) => {
                    const Icon = getEssenceIcon(interest);
                    return (
                      <div key={index} className={`flex items-center gap-3 p-3 rounded-lg transition-colors duration-200 ${
                        theme === 'dark'
                          ? 'bg-stone-700/30 border border-stone-600/30 hover:bg-stone-700/50'
                          : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                      }`}>
                        <Icon className={`w-4 h-4 flex-shrink-0 ${
                          theme === 'dark' ? 'text-stone-400' : 'text-slate-600'
                        }`} />
                        <span className={`text-sm ${
                          theme === 'dark' ? 'text-stone-200' : 'text-slate-700'
                        }`}>{interest}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className={`text-center py-6 ${
                    theme === 'dark' ? 'text-stone-400' : 'text-slate-500'
                  }`}>
                    <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Connect platforms to discover interests</p>
                  </div>
                )}
              </div>
            </div>

            {/* Core Personality Traits */}
            <div className={`rounded-xl p-5 transition-all duration-200 ${
              theme === 'dark'
                ? 'bg-stone-800 border border-stone-700 hover:bg-stone-800/90'
                : 'bg-white border border-slate-200 hover:bg-slate-50'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <Brain className={`w-5 h-5 ${
                  theme === 'dark' ? 'text-stone-400' : 'text-slate-600'
                }`} />
                <h3 className={`text-lg font-medium ${
                  theme === 'dark' ? 'text-stone-100' : 'text-slate-900'
                }`}>
                  Personality Traits
                </h3>
              </div>
              <div className="space-y-2">
                {coreTraits.length > 0 ? (
                  coreTraits.slice(0, 5).map((trait, index) => (
                    <div key={index} className={`flex items-center gap-3 p-3 rounded-lg transition-colors duration-200 ${
                      theme === 'dark'
                        ? 'bg-stone-700/30 border border-stone-600/30 hover:bg-stone-700/50'
                        : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                    }`}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        theme === 'dark' ? 'bg-stone-400' : 'bg-slate-500'
                      }`} />
                      <span className={`text-sm ${
                        theme === 'dark' ? 'text-stone-200' : 'text-slate-700'
                      }`}>{trait}</span>
                    </div>
                  ))
                ) : (
                  <div className={`text-center py-6 ${
                    theme === 'dark' ? 'text-stone-400' : 'text-slate-500'
                  }`}>
                    <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Connect platforms to reveal traits</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quote about authenticity */}
      <div className="text-center py-4">
        <p className={`italic text-sm ${
          theme === 'dark' ? 'text-stone-400' : 'text-slate-600'
        }`}>
          "Perhaps we are searching in the branches for what we only find in the roots." - Rami
        </p>
      </div>
    </div>
  );
};
