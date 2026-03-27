/**
 * SoulScore -- Identity Richness Score + Contributor Cards
 * =========================================================
 * Inspired by Oura Ring readiness score + contributor cards.
 * Shows a composite "Soul Score" (0-100) with an animated SVG ring
 * and 6 domain contributor cards in a responsive grid.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SoulScoreProps {
  className?: string;
}

interface MultimodalProfile {
  platforms?: string[];
  multimodal_types?: string[];
}

interface ScalingMetrics {
  platform_count?: number;
  memory_count?: number;
  axes_count?: number;
}

interface ContributorDomain {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  platformKey: string;
  alwaysUnlocked?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const DOMAINS: ContributorDomain[] = [
  { id: 'music', label: 'Music', icon: Music, color: '#1DB954', platformKey: 'spotify' },
  { id: 'body', label: 'Body', icon: Heart, color: '#00B4D8', platformKey: 'whoop' },
  { id: 'social', label: 'Social', icon: Users, color: '#4285F4', platformKey: 'google_calendar' },
  { id: 'focus', label: 'Focus', icon: Brain, color: '#A78BFA', platformKey: 'github' },
  { id: 'curiosity', label: 'Curiosity', icon: Lightbulb, color: '#F59E0B', platformKey: 'youtube' },
  { id: 'drive', label: 'Drive', icon: Flame, color: '#EF4444', platformKey: '__always__', alwaysUnlocked: true },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getRingColor(score: number): string {
  if (score > 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
  return 'rgba(255,255,255,0.20)';
}

function getQualitativeLabel(score: number): { text: string; color: string } {
  if (score > 75) return { text: 'Deep', color: '#22c55e' };
  if (score >= 40) return { text: 'Growing', color: '#f59e0b' };
  return { text: 'New', color: 'rgba(255,255,255,0.35)' };
}

function computeSoulScore(
  platformCount: number,
  memoryCount: number,
  axesCount: number,
  multimodalCount: number,
): number {
  return Math.round(
    (Math.min(platformCount, 10) / 10) * 25 +
    (memoryCount > 1000 ? 25 : (memoryCount / 1000) * 25) +
    (axesCount > 0 ? 25 : 0) +
    (Math.min(multimodalCount, 4) / 4) * 25,
  );
}

function computeDomainScore(connected: boolean, memoryCount: number): number {
  if (!connected) return 0;
  if (memoryCount > 500) return 85;
  if (memoryCount > 200) return 65;
  if (memoryCount > 50) return 45;
  return 25;
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

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const ringColor = getRingColor(score);
  const offset = RING_CIRCUMFERENCE * (1 - score / 100);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle
          cx="60" cy="60" r={RING_RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
        />
        <circle
          cx="60" cy="60" r={RING_RADIUS}
          fill="none"
          stroke={ringColor}
          strokeWidth="8"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[36px] font-normal tracking-[-0.72px]"
          style={{ fontFamily: "'Instrument Serif', serif", color: '#F5F5F4' }}
        >
          <AnimatedCounter target={score} />
        </span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Contributor Card                                                   */
/* ------------------------------------------------------------------ */

interface ContributorCardProps {
  domain: ContributorDomain;
  connected: boolean;
  score: number;
  index: number;
}

const ContributorCard: React.FC<ContributorCardProps> = ({ domain, connected, score, index }) => {
  const Icon = domain.icon;
  const locked = !connected;
  const label = locked ? 'LOCKED' : getQualitativeLabel(score);
  const platformName = domain.platformKey === '__always__'
    ? ''
    : domain.platformKey.replace('_', ' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.1, duration: 0.5, ease: 'easeOut' }}
      style={{
        background: locked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        borderRadius: 20,
      }}
      className="px-4 py-4 flex flex-col gap-2.5"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            size={18}
            style={{ color: locked ? 'rgba(255,255,255,0.15)' : domain.color }}
          />
          <span
            className="text-[13px] font-medium"
            style={{
              fontFamily: "'Inter', sans-serif",
              color: locked ? 'rgba(255,255,255,0.25)' : '#F5F5F4',
            }}
          >
            {domain.label}
          </span>
        </div>
        {locked ? (
          <Lock size={14} style={{ color: 'rgba(255,255,255,0.15)' }} />
        ) : (
          <span
            className="text-[11px]"
            style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.35)' }}
          >
            {'\u2192'}
          </span>
        )}
      </div>

      {/* Status */}
      {locked ? (
        <span
          className="text-[11px]"
          style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.25)' }}
        >
          Connect {platformName} to unlock
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <span
            className="text-[13px] font-medium"
            style={{ fontFamily: "'Inter', sans-serif", color: label.color }}
          >
            {label.text}
          </span>
          <div
            className="flex-1 h-1 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ delay: 0.5 + index * 0.1, duration: 1, ease: 'easeOut' }}
              style={{ backgroundColor: domain.color, opacity: 0.7 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const SoulScore: React.FC<SoulScoreProps> = ({ className = '' }) => {
  const { data: multimodal } = useQuery({
    queryKey: ['twin', 'multimodal-profile'],
    queryFn: async () => {
      const res = await authFetch('/twin/multimodal-profile');
      if (!res.ok) return null;
      return (await res.json()).data as MultimodalProfile;
    },
    staleTime: 60 * 60 * 1000,
  });

  const { data: scaling } = useQuery({
    queryKey: ['tribe', 'scaling-metrics'],
    queryFn: async () => {
      const res = await authFetch('/tribe/scaling-metrics');
      if (!res.ok) return null;
      return (await res.json()).data as ScalingMetrics;
    },
    staleTime: 60 * 60 * 1000,
  });

  const platforms = multimodal?.platforms ?? [];
  const platformCount = scaling?.platform_count ?? platforms.length;
  const memoryCount = scaling?.memory_count ?? 0;
  const axesCount = scaling?.axes_count ?? 0;
  const multimodalCount = multimodal?.multimodal_types?.length ?? 0;

  const score = computeSoulScore(platformCount, memoryCount, axesCount, multimodalCount);
  const connectedSet = new Set(platforms.map((p: string) => p.toLowerCase()));

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={className}
    >
      {/* Section label */}
      <div className="flex items-center gap-2 mb-6">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getRingColor(score) }} />
        <h2
          className="text-[11px] font-medium tracking-widest uppercase"
          style={{ color: '#F5F5F4', fontFamily: "'Inter', sans-serif" }}
        >
          Soul Score
        </h2>
      </div>

      {/* Score ring + subtitle */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <ScoreRing score={score} />
        <p
          className="text-[13px]"
          style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.35)' }}
        >
          Identity richness across {platformCount} source{platformCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Contributor grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {DOMAINS.map((domain, i) => {
          const connected = domain.alwaysUnlocked || connectedSet.has(domain.platformKey);
          const domainScore = domain.alwaysUnlocked
            ? computeDomainScore(true, memoryCount)
            : computeDomainScore(connected, memoryCount);
          return (
            <ContributorCard
              key={domain.id}
              domain={domain}
              connected={connected}
              score={domainScore}
              index={i}
            />
          );
        })}
      </div>
    </motion.section>
  );
};

export default SoulScore;
