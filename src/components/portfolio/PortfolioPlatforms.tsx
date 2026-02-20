import React from 'react';
import { motion } from 'framer-motion';
import { getPlatformLogo } from '../PlatformLogos';

const PLATFORM_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  youtube: '#FF0000',
  calendar: '#4285F4',
  'google calendar': '#4285F4',
  'google-calendar': '#4285F4',
  google_calendar: '#4285F4',
  whoop: '#44D62C',
  twitch: '#9146FF',
  github: '#FFFFFF',
  discord: '#5865F2',
  gmail: '#EA4335',
};

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  google_youtube: 'YouTube',
  calendar: 'Google Calendar',
  google_calendar: 'Google Calendar',
  'google-calendar': 'Google Calendar',
  whoop: 'Whoop',
  twitch: 'Twitch',
  github: 'GitHub',
  discord: 'Discord',
  gmail: 'Gmail',
};

interface PlatformData {
  name: string;
  features: Array<{ type: string; value: number | string }>;
}

interface PortfolioPlatformsProps {
  platforms: PlatformData[];
}

const formatFeatureType = (type: string): string => {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatFeatureValue = (value: number | string): string => {
  if (typeof value === 'number') {
    if (value >= 0 && value <= 1) return `${Math.round(value * 100)}%`;
    return String(Math.round(value));
  }
  return String(value);
};

const PortfolioPlatforms: React.FC<PortfolioPlatformsProps> = ({ platforms }) => {
  const platformsWithFeatures = platforms.filter((p) => p.features.length > 0);

  if (platformsWithFeatures.length === 0) return null;

  return (
    <section className="py-16 px-6 flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-3xl"
      >
        {/* Section label */}
        <p
          className="text-xs uppercase tracking-wider text-center mb-10 opacity-50"
          style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
        >
          Data Sources
        </p>

        {/* Platform tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {platformsWithFeatures.map((platform, i) => {
            const Logo = getPlatformLogo(platform.name);
            const brandColor = PLATFORM_COLORS[platform.name.toLowerCase()] || '#E8D5B7';
            const displayName = PLATFORM_DISPLAY_NAMES[platform.name.toLowerCase()] || platform.name;

            return (
              <motion.div
                key={platform.name}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="rounded-xl p-5"
                style={{
                  background: 'linear-gradient(145deg, rgba(232, 213, 183, 0.04) 0%, rgba(232, 213, 183, 0.01) 100%)',
                  border: `1px solid ${brandColor}20`,
                }}
              >
                {/* Platform header */}
                <div className="flex items-center gap-3 mb-4">
                  {Logo && (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${brandColor}15` }}
                    >
                      <span style={{ color: brandColor }}>
                        <Logo className="w-4 h-4" />
                      </span>
                    </div>
                  )}
                  <span
                    className="text-sm font-medium"
                    style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
                  >
                    {displayName}
                  </span>
                </div>

                {/* Feature badges */}
                <div className="flex flex-wrap gap-2">
                  {platform.features.slice(0, 2).map((feat, j) => (
                    <span
                      key={j}
                      className="text-xs px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: `${brandColor}12`,
                        color: brandColor,
                        border: `1px solid ${brandColor}25`,
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {formatFeatureType(feat.type)}: {formatFeatureValue(feat.value)}
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
};

export default PortfolioPlatforms;
