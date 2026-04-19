// src/components/onboarding/SoulRichnessBar.tsx
import React from 'react';

// Weights reflect data richness per platform (active integrations only).
// Unknown/future platforms default to 5. Bar caps at 100%.
const WEIGHTS: Record<string, number> = {
  spotify: 20,
  google_calendar: 15,
  youtube: 15,
  whoop: 15,
  google_gmail: 10,
  discord: 10,
  linkedin: 10,
  github: 10,
  reddit: 8,
  twitch: 8,
};

const label = (s: number) =>
  s < 20 ? 'Barely scratching the surface' :
  s < 40 ? 'Starting to see you' :
  s < 60 ? 'Getting interesting' :
  s < 80 ? 'Your soul is taking shape' : 'Deeply understood';

const SoulRichnessBar: React.FC<{ connectedPlatforms: string[]; isLoading?: boolean }> = ({ connectedPlatforms, isLoading }) => {
  const score = Math.min(100, connectedPlatforms.reduce((s, p) => s + (WEIGHTS[p] ?? 5), 0));
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
          Soul Richness
        </span>
        <span style={{ color: 'var(--foreground)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontWeight: 500 }}>
          {isLoading ? '—' : `${score}%`}
        </span>
      </div>
      <div
        className="h-[3px] rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${score}%`,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.35), rgba(255,255,255,0.55))',
          }}
        />
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
        {isLoading ? 'Checking your connections...' : label(score)}
      </p>
    </div>
  );
};

export default SoulRichnessBar;
