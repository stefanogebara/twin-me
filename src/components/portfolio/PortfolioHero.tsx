import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { getPlatformLogo } from '../PlatformLogos';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

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
      <motion.a
        href="/"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
        className="absolute top-6 left-6 text-lg tracking-tight transition-opacity hover:opacity-70"
        style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7', textDecoration: 'none' }}
      >
        Twin Me
      </motion.a>

      {/* Avatar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
        className="mb-6"
      >
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
      </motion.div>

      {/* Pre-header */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
        className="text-sm uppercase tracking-wider mb-4"
        style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7', fontSize: '14px' }}
      >
        {firstName ? `${firstName}'s Soul Signature` : 'A Soul Signature'}
      </motion.p>

      {/* Archetype name */}
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4, ease: EASE }}
        className="text-4xl md:text-5xl text-center mb-3"
        style={{
          fontFamily: 'var(--font-heading)',
          color: '#E8D5B7',
          fontWeight: 400,
        }}
      >
        {archetypeName}
      </motion.h1>

      {/* Subtitle */}
      {archetypeSubtitle && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
          className="text-lg text-center italic mb-8"
          style={{ fontFamily: 'var(--font-accent, Georgia, serif)', color: '#E8D5B7', fontSize: '18px' }}
        >
          "{archetypeSubtitle}"
        </motion.p>
      )}

      {/* Gradient divider */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
        className="h-px w-24 mb-8"
        style={{
          background: `linear-gradient(90deg, transparent, ${colorScheme.primary}, transparent)`,
        }}
      />

      {/* Platform icons */}
      {platforms.length > 0 && (
        <div className="flex items-center gap-3">
          {platforms.map((p, i) => {
            const Logo = getPlatformLogo(p.name);
            const brandColor = PLATFORM_COLORS[p.name.toLowerCase()] || '#E8D5B7';
            return (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.8 + i * 0.05, ease: EASE }}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${brandColor}18`, border: `1px solid ${brandColor}30` }}
              >
                {Logo && <Logo className="w-4 h-4" />}
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default PortfolioHero;
