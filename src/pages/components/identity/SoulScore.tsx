/**
 * SoulScore -- Identity Richness Score + Contributors
 * ====================================================
 * Inspired by Oura Ring readiness score + contributor cards.
 * A composite "Soul Score" (0-100) as an SVG ring, and the six domains that
 * contribute to it.
 *
 * In the register: a section whose heading carries the ring at its right end,
 * and the six domains as rows under the ink rule (an icon, the domain, one grey
 * line, a lock when it is not connected). No glass cards, no glow, and the
 * domain labels are ink (they were #F5F5F4 on white).
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMotionValue, useTransform, animate } from 'framer-motion';
import {
  Music,
  Heart,
  Users,
  Brain,
  Lightbulb,
  Flame,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { usePlatformsSummary } from '@/hooks/usePlatformsSummary';
import { computeSoulScore, computeDomainScore } from '@/lib/soulScoring';
import { Section, List, Row } from '@/components/register';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SoulScoreProps {
  className?: string;
  compact?: boolean;
}

interface ContributorDomain {
  id: string;
  label: string;
  icon: LucideIcon;
  platformKey: string;
  alwaysUnlocked?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DOMAINS: ContributorDomain[] = [
  { id: 'music', label: 'Music', icon: Music, platformKey: 'spotify' },
  { id: 'body', label: 'Body', icon: Heart, platformKey: 'whoop' },
  { id: 'social', label: 'Social', icon: Users, platformKey: 'google_calendar' },
  { id: 'focus', label: 'Focus', icon: Brain, platformKey: 'github' },
  { id: 'curiosity', label: 'Curiosity', icon: Lightbulb, platformKey: 'youtube' },
  { id: 'drive', label: 'Drive', icon: Flame, platformKey: '__always__', alwaysUnlocked: true },
];

// Proper display names for each platform key (raw keys like "google_calendar"
// would otherwise render lowercase in "Connect <platform> to unlock").
const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  whoop: 'Whoop',
  google_calendar: 'Google Calendar',
  github: 'GitHub',
  youtube: 'YouTube',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// SVG presentation attributes do not resolve var(), so the ring's strokes are
// register.css's hex values written out: verdigris, ember, and the mark grey.
function getRingColor(score: number): string {
  if (score > 70) return '#4c9786';
  if (score >= 40) return '#c47833';
  return '#8c8889';
}

/* ------------------------------------------------------------------ */
/*  Animated Counter                                                   */
/* ------------------------------------------------------------------ */

const AnimatedCounter: React.FC<{ target: number }> = ({ target }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    const controls = animate(count, target, {
      duration: 1.5,
      ease: 'easeOut',
    });
    const unsubscribe = rounded.on('change', (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [target, count, rounded]);

  return <>{display}</>;
};

/* ------------------------------------------------------------------ */
/*  SVG Ring                                                           */
/* ------------------------------------------------------------------ */

const ScoreRing: React.FC<{ score: number; compact?: boolean }> = ({ score, compact }) => {
  const ringColor = getRingColor(score);
  const size = compact ? 88 : 120;
  const r = compact ? 38 : 52;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Soul score ${score} out of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eae9ea" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={4}
          strokeDasharray={Math.PI * 2 * r}
          strokeDashoffset={Math.PI * 2 * r * (1 - score / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center"
        style={{
          fontFamily: 'var(--rg-sans)',
          fontSize: compact ? 28 : 36,
          fontWeight: 300,
          letterSpacing: '-0.05em',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--rg-ink)',
        }}
      >
        <AnimatedCounter target={score} />
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const SoulScore: React.FC<SoulScoreProps> = ({ className = '', compact = false }) => {
  // Real memory count — the only reliable data source
  const { data: memorySummary } = useQuery({
    queryKey: ['memories', 'summary'],
    queryFn: async () => {
      const res = await authFetch('/memories?limit=1');
      if (!res.ok) return null;
      const json = await res.json();
      return { total: json.total ?? 0 } as { total: number };
    },
    staleTime: 15 * 60 * 1000,
  });

  // Fetch user ID from localStorage for connectors endpoint.
  // Guarded: a corrupted auth_user value must not throw during render.
  const userId = useMemo<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return JSON.parse(localStorage.getItem('auth_user') || '{}')?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  // Connected platforms — canonical platforms summary (audit 2026-05-12 H1).
  // Replaces the previous per-page /connectors/status fetch that disagreed with
  // /wiki, /dashboard, etc.
  const { data: platformsSummary } = usePlatformsSummary({ enabled: !!userId });

  // Backward-compatible connector map for the contributor locked/unlocked logic.
  const connectors = useMemo(() => {
    const map: Record<string, { connected: boolean; tokenExpired: boolean }> = {};
    for (const p of platformsSummary?.breakdown ?? []) {
      map[p.platform] = { connected: true, tokenExpired: p.state === 'expired' };
    }
    return map;
  }, [platformsSummary]);

  // Platform-level inputs from the canonical summary.
  // - connectedPlatforms (unlocks the contributor): includes ALL connected
  //   regardless of token state, so the user can see what they've linked even
  //   when a token has expired.
  // - activeCount (feeds the Soul Score numerator): only platforms that are
  //   ACTUALLY syncing — token valid and last sync within 7 days. This is the
  //   audit-2026-05-12 M5 fix: previously a 100% score was possible even with
  //   every platform stale or expired.
  const connectedPlatforms = Object.keys(connectors || {}).map((k) => k.toLowerCase());
  const activeCount = platformsSummary?.active ?? 0;
  const memoryCount = memorySummary?.total ?? 0;

  // Shared formula (src/lib/soulScoring.ts) — active-only numerator + M5
  // 95-cap when any connected platform is stale/expired. Same number as the
  // onboarding SoulRichnessBar (batch-3 step 6). The fabricated personality-
  // axes component was dropped in audit-2026-06-10 (it assumed axes exist for
  // any connected platform), so the score is now three measured components.
  const score = computeSoulScore({
    summary: platformsSummary,
    memoryCount,
  });
  const connectedSet = new Set(connectedPlatforms);

  return (
    <Section
      title="Soul score"
      // Sources = ACTIVELY syncing platforms (summary.active), matching the
      // score numerator — total counted expired/stale rows ("10 sources" bug,
      // batch-3 display convention).
      line={`Identity richness across ${activeCount} source${activeCount !== 1 ? 's' : ''}.`}
      action={<ScoreRing score={score} compact={compact} />}
      className={className}
    >
      <List label="What feeds your score">
        {DOMAINS.map((domain) => {
          const connected = domain.alwaysUnlocked || connectedSet.has(domain.platformKey);
          // Binary per-domain signal: per-domain memory volume is not available
          // on the client, so a connected domain reads as "contributing" rather
          // than fabricating a per-domain depth (audit-2026-06-10).
          const contributing = computeDomainScore(connected) > 0;
          const platformName = domain.platformKey === '__always__'
            ? ''
            : PLATFORM_DISPLAY_NAMES[domain.platformKey] ?? domain.platformKey.replace(/_/g, ' ');
          const Icon = domain.icon;
          return (
            <Row
              key={domain.id}
              icon={<Icon aria-hidden="true" />}
              title={domain.label}
              line={connected && contributing ? 'Contributing' : `Connect ${platformName} to unlock`}
              action={connected ? undefined : <Lock className="rg-chevron" aria-label="Locked" />}
            />
          );
        })}
      </List>
    </Section>
  );
};

export default SoulScore;
