import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Music, Film, Gamepad2, Book, Briefcase, Mail, Code, Linkedin } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface RootsVsBranchesProps {
  personalDataPoints: number;
  professionalDataPoints: number;
  personalPlatforms: string[];
  professionalPlatforms: string[];
}

export const RootsVsBranches: React.FC<RootsVsBranchesProps> = ({
  personalDataPoints,
  professionalDataPoints,
  personalPlatforms,
  professionalPlatforms
}) => {
  const { theme } = useTheme();
  const totalDataPoints = personalDataPoints + professionalDataPoints;
  const personalPercentage = totalDataPoints > 0 ? (personalDataPoints / totalDataPoints) * 100 : 0;
  const professionalPercentage = totalDataPoints > 0 ? (professionalDataPoints / totalDataPoints) * 100 : 0;

  const getPlatformIcon = (platform: string) => {
    const lower = platform.toLowerCase();
    if (lower.includes('spotify') || lower.includes('music')) return Music;
    if (lower.includes('netflix') || lower.includes('film')) return Film;
    if (lower.includes('game') || lower.includes('steam')) return Gamepad2;
    if (lower.includes('book') || lower.includes('read')) return Book;
    if (lower.includes('linkedin')) return Linkedin;
    if (lower.includes('mail') || lower.includes('gmail')) return Mail;
    if (lower.includes('github') || lower.includes('code')) return Code;
    if (lower.includes('brief') || lower.includes('work')) return Briefcase;
    return Music;
  };

  return (
    <div className="mb-8">
      <div className="mb-6">
        <h2 className="text-2xl text-[hsl(var(--claude-text))] mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
          Roots vs Branches
        </h2>
        <p className="text-[hsl(var(--claude-text-secondary))]">
          Your soul signature lives in the roots - the personal choices and authentic interests that can't be cloned
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* THE ROOTS - Personal/Authentic */}
        <Card
          className="backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)] p-8 relative overflow-hidden hover:shadow-lg transition-shadow duration-200"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.05)' : 'rgba(34, 197, 94, 0.03)',
            borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            borderWidth: '1px',
            borderStyle: 'solid'
          }}
        >
          {/* Decorative root pattern */}
          <div className="absolute inset-0 opacity-5 pointer-events-none">
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <path d="M100,100 Q80,140 60,180 M100,100 Q100,140 100,180 M100,100 Q120,140 140,180"
                    stroke="currentColor" strokeWidth="2" fill="none" className="text-green-900"/>
            </svg>
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-3xl">🌱</span>
                  <h3 className="text-xl text-[hsl(var(--claude-text))]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
                    The Roots
                  </h3>
                </div>
                <p className="text-sm text-[hsl(var(--claude-text-secondary))]">Your authentic soul signature</p>
              </div>
              <Badge className="bg-green-500 text-white border-0 text-lg px-4 py-2">
                {Math.round(personalPercentage)}%
              </Badge>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl text-[hsl(var(--claude-text))]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
                  {personalDataPoints.toLocaleString()}
                </span>
                <span className="text-[hsl(var(--claude-text-secondary))]">authentic moments</span>
              </div>
              <div className="h-3 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${personalPercentage}%` }}
                />
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--claude-text))]">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>Entertainment choices reveal true interests</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--claude-text))]">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>Personal content shows genuine curiosity</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--claude-text))]">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>Lifestyle patterns expose characteristic behavior</span>
              </div>
            </div>

            {/* Connected Personal Platforms */}
            {personalPlatforms.length > 0 && (
              <div>
                <p className="text-xs text-[hsl(var(--claude-text-secondary))] mb-2">Connected Soul Windows:</p>
                <div className="flex flex-wrap gap-2">
                  {personalPlatforms.slice(0, 6).map((platform, index) => {
                    const Icon = getPlatformIcon(platform);
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-1.5 bg-green-500/10 text-green-700 px-2 py-1 rounded-md text-xs"
                      >
                        <Icon className="w-3 h-3" />
                        <span>{platform}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* THE BRANCHES - Professional/Public */}
        <Card
          className="backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)] p-8 relative overflow-hidden hover:shadow-lg transition-shadow duration-200"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.05)' : 'rgba(245, 158, 11, 0.03)',
            borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            borderWidth: '1px',
            borderStyle: 'solid'
          }}
        >
          {/* Decorative branch pattern */}
          <div className="absolute inset-0 opacity-5 pointer-events-none">
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <path d="M100,100 Q80,60 60,20 M100,100 Q100,60 100,20 M100,100 Q120,60 140,20"
                    stroke="currentColor" strokeWidth="2" fill="none" className="text-amber-900"/>
            </svg>
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-3xl">🌳</span>
                  <h3 className="text-xl text-[hsl(var(--claude-text))]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
                    The Branches
                  </h3>
                </div>
                <p className="text-sm text-[hsl(var(--claude-text-secondary))]">Your public persona</p>
              </div>
              <Badge className="bg-stone-600 text-white border-0 text-lg px-4 py-2">
                {Math.round(professionalPercentage)}%
              </Badge>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl text-[hsl(var(--claude-text))]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
                  {professionalDataPoints.toLocaleString()}
                </span>
                <span className="text-[hsl(var(--claude-text-secondary))]">public signals</span>
              </div>
              <div className="h-3 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-stone-600 transition-all duration-500"
                  style={{ width: `${professionalPercentage}%` }}
                />
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--claude-text))]">
                <div className="w-2 h-2 rounded-full bg-stone-600" />
                <span>Easy to clone and replicate</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--claude-text))]">
                <div className="w-2 h-2 rounded-full bg-stone-600" />
                <span>Visible to everyone, lacks soul</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--claude-text))]">
                <div className="w-2 h-2 rounded-full bg-stone-600" />
                <span>Useful context, not authentic signature</span>
              </div>
            </div>

            {/* Connected Professional Platforms */}
            {professionalPlatforms.length > 0 && (
              <div>
                <p className="text-xs text-[hsl(var(--claude-text-secondary))] mb-2">Connected Work Channels:</p>
                <div className="flex flex-wrap gap-2">
                  {professionalPlatforms.slice(0, 4).map((platform, index) => {
                    const Icon = getPlatformIcon(platform);
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-1.5 bg-stone-600/10 text-amber-700 px-2 py-1 rounded-md text-xs"
                      >
                        <Icon className="w-3 h-3" />
                        <span>{platform}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Philosophy Statement */}
      <Card
        className="mt-6 backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)] p-6"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        <div className="text-center">
          <p className="text-[hsl(var(--claude-text))] leading-relaxed">
            <span className="font-semibold text-[hsl(var(--claude-text))]">Everything public about you is increasingly easy to clone.</span>
            {' '}But information doesn't have a soul. The beauty of your digital twin is discovering the{' '}
            <span className="font-semibold text-green-700">signature of your originality</span> - not just what you wrote or your professional content,
            but your <span className="italic">curiosities</span>, your <span className="italic">characteristic patterns</span>,
            the things that make you genuinely yourself.
          </p>
        </div>
      </Card>
    </div>
  );
};
