/**
 * InsightCards -- Swipeable Personality Moment Cards (Spotify Wrapped style)
 * ==========================================================================
 * Horizontal scrollable card strip with 4-5 bold visual insight cards.
 * Each card is a standalone "personality moment" with colored accent border.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Music, Zap, Sparkles, Database, Target } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────

interface PersonalityAxis {
  label: string;
  description: string;
}

interface InsightCardsProps {
  axes?: PersonalityAxis[];
  memoryCount?: number;
  platformCount?: number;
  fidelityScore?: number | null;
  joinedAt?: string | null;
  chronotype?: string | null;
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatChronotype(raw: string | null | undefined): string {
  if (!raw) return 'Unknown';
  const labels: Record<string, string> = {
    night_owl: 'Night Owl',
    early_bird: 'Early Bird',
    afternoon_peak: 'Afternoon Peak',
    even_keel: 'Even Keel',
  };
  return labels[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function chronotypeIcon(raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.includes('night') || raw.includes('owl')) return '\u{1F319}';
  if (raw.includes('early') || raw.includes('bird')) return '\u{2600}';
  if (raw.includes('afternoon')) return '\u{26C5}';
  return '\u{231A}';
}

function daysSinceJoined(joinedAt: string | null | undefined): number {
  if (!joinedAt) return 0;
  const joined = new Date(joinedAt);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - joined.getTime()) / (1000 * 60 * 60 * 24)));
}

function findMusicAxis(axes: PersonalityAxis[]): PersonalityAxis | null {
  const musicKeywords = ['music', 'hip-hop', 'listening', 'spotify', 'song', 'genre', 'rhythm', 'audio', 'sound'];
  return (
    axes.find((a) =>
      musicKeywords.some(
        (kw) => a.label.toLowerCase().includes(kw) || a.description.toLowerCase().includes(kw),
      ),
    ) ?? null
  );
}

// ── Card definitions ─────────────────────────────────────────────────────

interface CardDef {
  id: string;
  title: string;
  accentColor: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

function buildCards(props: InsightCardsProps): CardDef[] {
  const {
    axes = [],
    memoryCount = 0,
    platformCount = 0,
    fidelityScore,
    joinedAt,
    chronotype,
  } = props;

  const cards: CardDef[] = [];

  // 1. Listening DNA
  const musicAxis = findMusicAxis(axes);
  cards.push({
    id: 'listening-dna',
    title: 'Your Listening DNA',
    accentColor: 'rgba(30,215,96,0.8)', // Spotify green
    icon: <Music className="w-4 h-4" style={{ color: 'rgba(30,215,96,0.5)' }} />,
    content: musicAxis ? (
      <div>
        <p
          className="text-sm font-semibold mb-1"
          style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}
        >
          {musicAxis.label}
        </p>
        <p
          className="text-xs leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
        >
          {musicAxis.description.length > 100
            ? musicAxis.description.slice(0, 100) + '...'
            : musicAxis.description}
        </p>
      </div>
    ) : (
      <p
        className="text-xs"
        style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
      >
        Connect Spotify to discover
      </p>
    ),
  });

  // 2. Energy Rhythm
  cards.push({
    id: 'energy-rhythm',
    title: 'Your Energy Rhythm',
    accentColor: 'rgba(251,191,36,0.8)', // amber
    icon: <Zap className="w-4 h-4" style={{ color: 'rgba(251,191,36,0.5)' }} />,
    content: (
      <div className="flex items-center gap-3">
        <span className="text-2xl">{chronotypeIcon(chronotype)}</span>
        <p
          className="text-sm font-semibold"
          style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}
        >
          {formatChronotype(chronotype)}
        </p>
      </div>
    ),
  });

  // 3. Top Dimension
  if (axes.length > 0) {
    const topAxis = axes[0];
    cards.push({
      id: 'top-dimension',
      title: 'Your Top Dimension',
      accentColor: 'rgba(199,146,234,0.8)', // purple/lavender
      icon: <Sparkles className="w-4 h-4" style={{ color: 'rgba(199,146,234,0.5)' }} />,
      content: (
        <div>
          <p
            className="text-sm font-semibold mb-1"
            style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}
          >
            {topAxis.label}
          </p>
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
          >
            {topAxis.description.length > 90
              ? topAxis.description.slice(0, 90) + '...'
              : topAxis.description}
          </p>
        </div>
      ),
    });
  }

  // 4. Data Footprint
  const days = daysSinceJoined(joinedAt);
  cards.push({
    id: 'data-footprint',
    title: 'Your Data Footprint',
    accentColor: 'rgba(245,158,11,0.8)', // amber/orange
    icon: <Database className="w-4 h-4" style={{ color: 'rgba(245,158,11,0.5)' }} />,
    content: (
      <div className="flex gap-4">
        <div>
          <p
            className="text-lg font-semibold"
            style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}
          >
            {memoryCount.toLocaleString()}
          </p>
          <p
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
          >
            memories
          </p>
        </div>
        <div>
          <p
            className="text-lg font-semibold"
            style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}
          >
            {platformCount}
          </p>
          <p
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
          >
            platforms
          </p>
        </div>
        {days > 0 && (
          <div>
            <p
              className="text-lg font-semibold"
              style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}
            >
              {days}
            </p>
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
            >
              days
            </p>
          </div>
        )}
      </div>
    ),
  });

  // 5. Twin Accuracy
  cards.push({
    id: 'twin-accuracy',
    title: 'Twin Accuracy',
    accentColor: 'rgba(45,212,191,0.8)', // teal
    icon: <Target className="w-4 h-4" style={{ color: 'rgba(45,212,191,0.5)' }} />,
    content:
      fidelityScore != null ? (
        <div>
          <p
            className="text-2xl font-semibold"
            style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}
          >
            {Math.round(fidelityScore * 100)}%
          </p>
          <p
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
          >
            fidelity score
          </p>
        </div>
      ) : (
        <p
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
        >
          Chat more to measure accuracy
        </p>
      ),
  });

  return cards;
}

// ── Component ────────────────────────────────────────────────────────────

const InsightCards: React.FC<InsightCardsProps> = (props) => {
  const { className = '' } = props;
  const cards = buildCards(props);

  if (cards.length === 0) return null;

  return (
    <motion.div
      className={`mb-14 ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-6 px-6"
        style={{ scrollbarWidth: 'none' }}
      >
        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            className="snap-start flex-shrink-0 w-[280px]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '20px',
              borderLeft: `4px solid ${card.accentColor}`,
            }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-[13px] font-semibold"
                style={{ color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif" }}
              >
                {card.title}
              </span>
              <span className="opacity-60">{card.icon}</span>
            </div>

            {/* Content area */}
            <div className="min-h-[80px] flex items-start">{card.content}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default InsightCards;
