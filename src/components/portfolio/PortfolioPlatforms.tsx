import React from 'react';
import { getPlatformLogo } from '../PlatformLogos';
import { PLATFORM_DISPLAY_NAMES } from '@/lib/platformNames';
import { Section, List, Row } from '@/components/register';

interface PlatformData {
  name: string;
  features: Array<{ type: string; value: number | string }>;
}

interface PortfolioPlatformsProps {
  platforms: PlatformData[];
}

const formatFeatureType = (type: string): string => type.replace(/_/g, ' ').toLowerCase();

const formatFeatureValue = (value: number | string): string => {
  if (typeof value === 'number') {
    if (value > 0 && value <= 1) {
      const pct = value * 100;
      // audit-2026-07-03: a true 0 and a tiny nonzero fraction (e.g. 0.003 ->
      // 0.3%) both rounded to "0%" — indistinguishable in the UI. Floor at
      // "<1%" instead of rounding tiny nonzero values down to zero.
      if (pct < 1) return '<1%';
      return `${Math.round(pct)}%`;
    }
    if (value === 0) return '0%';
    return String(Math.round(value));
  }
  return String(value);
};

/** One grey line of a platform's two headline features, in sentence case. */
const featureLine = (features: PlatformData['features']): string => {
  const line = features
    .slice(0, 2)
    .map((feat) => `${formatFeatureType(feat.type)} ${formatFeatureValue(feat.value)}`)
    .join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
};

/** Where the portrait comes from: a row per platform with its brand icon. */
const PortfolioPlatforms: React.FC<PortfolioPlatformsProps> = ({ platforms }) => {
  const platformsWithFeatures = platforms.filter((p) => p.features.length > 0);

  if (platformsWithFeatures.length === 0) return null;

  return (
    <Section title="Where it comes from">
      <List label="Data sources" className="rg-figures">
        {platformsWithFeatures.map((platform) => {
          const Logo = getPlatformLogo(platform.name);
          const displayName = PLATFORM_DISPLAY_NAMES[platform.name.toLowerCase()] || platform.name;
          return (
            <Row
              key={platform.name}
              icon={Logo ? <Logo className="w-4 h-4" /> : undefined}
              title={displayName}
              line={featureLine(platform.features)}
            />
          );
        })}
      </List>
    </Section>
  );
};

export default PortfolioPlatforms;
