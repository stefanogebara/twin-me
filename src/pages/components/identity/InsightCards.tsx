/**
 * InsightCards -- personality moments, as register rows
 * =====================================================
 * Listening, energy rhythm, top dimension, data footprint and twin accuracy.
 * Once a swipeable strip of glass cards with coloured borders; in the register
 * each moment is a row (a 32px icon, the title, one grey line) under the list's
 * ink rule. The name is kept for its caller.
 */

import React from 'react';
import { Music, Zap, Sparkles, Database, Target } from 'lucide-react';
import { List, Row } from '@/components/register';

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
    night_owl: 'Night owl',
    early_bird: 'Early bird',
    afternoon_peak: 'Afternoon peak',
    even_keel: 'Even keel',
  };
  return labels[raw] ?? raw.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
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

// ── Row definitions ──────────────────────────────────────────────────────

interface CardDef {
  id: string;
  title: string;
  icon: React.ReactNode;
  line: string;
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

  // 1. Listening
  const musicAxis = findMusicAxis(axes);
  cards.push({
    id: 'listening-dna',
    title: 'Your listening',
    icon: <Music aria-hidden="true" />,
    line: musicAxis ? musicAxis.label : 'Connect Spotify to discover',
  });

  // 2. Energy rhythm
  cards.push({
    id: 'energy-rhythm',
    title: 'Your energy rhythm',
    icon: <Zap aria-hidden="true" />,
    line: formatChronotype(chronotype),
  });

  // 3. Top dimension
  if (axes.length > 0) {
    cards.push({
      id: 'top-dimension',
      title: 'Your top dimension',
      icon: <Sparkles aria-hidden="true" />,
      line: axes[0].label,
    });
  }

  // 4. Data footprint
  const days = daysSinceJoined(joinedAt);
  cards.push({
    id: 'data-footprint',
    title: 'Your data footprint',
    icon: <Database aria-hidden="true" />,
    line: [
      `${memoryCount.toLocaleString('en-US')} memories`,
      `${platformCount} platform${platformCount === 1 ? '' : 's'}`,
      days > 0 ? `${days} days` : null,
    ].filter(Boolean).join(' · '),
  });

  // 5. Twin accuracy
  cards.push({
    id: 'twin-accuracy',
    title: 'Twin accuracy',
    icon: <Target aria-hidden="true" />,
    line: fidelityScore != null ? `${Math.round(fidelityScore * 100)}% fidelity score` : 'Chat more to measure accuracy',
  });

  return cards;
}

// ── Component ────────────────────────────────────────────────────────────

const InsightCards: React.FC<InsightCardsProps> = (props) => {
  const { className = '' } = props;
  const cards = buildCards(props);

  if (cards.length === 0) return null;

  return (
    <List className={className} label="Insights">
      {cards.map((card) => (
        <Row key={card.id} icon={card.icon} title={card.title} line={card.line} />
      ))}
    </List>
  );
};

export default InsightCards;
