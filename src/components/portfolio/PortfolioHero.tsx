import React from 'react';
import { Sparkles } from 'lucide-react';
import { getPlatformLogo } from '../PlatformLogos';

const PLATFORM_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  youtube: '#FF0000',
  calendar: '#4285F4',
  'google calendar': '#4285F4',
  'google-calendar': '#4285F4',
  google_calendar: '#4285F4',
  github: '#FFFFFF',
  discord: '#5865F2',
  gmail: '#EA4335',
};

interface PortfolioHeroProps {
  firstName: string | null;
  avatarUrl: string | null;
  archetypeName: string;
  archetypeSubtitle: string;
  platforms: Array<{ name: string }>;
  colorScheme: { primary: string; secondary: string; accent: string };
}

const PortfolioHero: React.FC<PortfolioHeroProps> = ({
  firstName,
  avatarUrl,
  archetypeName,
  archetypeSubtitle,
  platforms,
  colorScheme,
}) => {
  return (
    <section
      className="relative min-h-[80vh] flex flex-col items-center justify-center px-6 py-16 overflow-hidden"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${colorScheme.primary}12 0%, ${colorScheme.secondary}08 50%, transparent 80%)`,
      }}
    >
      {/* Wordmark */}
      <a
        href="/"
        className="absolute top-6 left-6 text-lg tracking-tight transition-opacity hover:opacity-70"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: '#E8D5B7', textDecoration: 'none' }}
      >
        Twin Me
      </a>

      {/* Avatar */}
      <div className="mb-6">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-24 h-24 rounded-full object-cover"
            style={{ border: `2px solid ${colorScheme.accent}` }}
          />
        ) : (
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${colorScheme.primary}15`, border: `2px solid ${colorScheme.accent}40` }}
          >
            <Sparkles className="w-10 h-10" style={{ color: colorScheme.primary }} />
          </div>
        )}
      </div>

      {/* Pre-header */}
      <p
        className="text-sm uppercase tracking-wider mb-4 opacity-50"
        style={{ fontFamily: "'Inter', sans-serif", color: '#E8D5B7', fontSize: '14px' }}
      >
        {firstName ? `${firstName}'s Soul Signature` : 'A Soul Signature'}
      </p>

      {/* Archetype name */}
      <h1
        className="text-4xl md:text-5xl text-center mb-3"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          color: '#E8D5B7',
          fontWeight: 400,
        }}
      >
        {archetypeName}
      </h1>

      {/* Subtitle */}
      {archetypeSubtitle && (
        <p
          className="text-lg text-center italic mb-8 opacity-70"
          style={{ fontFamily: "Georgia, serif", color: '#E8D5B7', fontSize: '18px' }}
        >
          &ldquo;{archetypeSubtitle}&rdquo;
        </p>
      )}

      {/* Gradient divider */}
      <div
        className="h-px w-24 mb-8"
        style={{
          background: `linear-gradient(90deg, transparent, ${colorScheme.primary}, transparent)`,
        }}
      />

      {/* Platform icons */}
      {platforms.length > 0 && (
        <div className="flex items-center gap-3">
          {platforms.map((p) => {
            const Logo = getPlatformLogo(p.name);
            const brandColor = PLATFORM_COLORS[p.name.toLowerCase()] || '#E8D5B7';
            return (
              <div
                key={p.name}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${brandColor}18`, border: `1px solid ${brandColor}30` }}
              >
                {Logo && <Logo className="w-4 h-4" />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default PortfolioHero;
