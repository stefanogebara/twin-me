/**
 * TwinReflection Component
 *
 * The twin's reflection in the register: a section whose list holds the one
 * paragraph the page keeps, under the list's ink rule. Patterns and figures
 * around it are rows. No cards, no tinted labels, no quote marks.
 */

import React from 'react';
import type { ReactNode } from 'react';
import { TrendingUp, Heart, Lightbulb } from 'lucide-react';
import { Section, List, Row } from '@/components/register';

interface TwinReflectionProps {
  reflection: string;
  timestamp?: Date | string;
  confidence?: 'high' | 'medium' | 'low';
  isNew?: boolean;
  className?: string;
  /** More rows under the paragraph (the evidence). */
  children?: ReactNode;
}

/**
 * Format time ago in a human-friendly way
 */
function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Observed just now';
  if (diffHours < 24) return `Observed ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Observed ${diffDays}d ago`;
  return `Observed on ${then.toLocaleDateString()}`;
}

const CONFIDENCE_LABEL = {
  high: 'high confidence',
  medium: 'an emerging pattern',
  low: 'an early observation',
} as const;

export const TwinReflection: React.FC<TwinReflectionProps> = ({
  reflection,
  timestamp,
  confidence,
  className,
  children,
}) => {
  const line = [timestamp ? formatTimeAgo(timestamp) : null, confidence ? CONFIDENCE_LABEL[confidence] : null]
    .filter(Boolean)
    .join(', ');

  return (
    <Section title="What your twin noticed" line={line || undefined} className={className}>
      <List>
        <li className="ri-block">
          <p className="ri-prose">{reflection}</p>
        </li>
        {children}
      </List>
    </Section>
  );
};

/**
 * Pattern observation - one row: the pattern, then how often it shows up.
 * Render inside a List.
 */
interface PatternObservationProps {
  text: string;
  occurrences?: 'often' | 'sometimes' | 'noticed';
  className?: string;
}

const occurrenceLabel = {
  often: 'Recurring pattern',
  sometimes: 'Sometimes noticed',
  noticed: 'New observation',
};

export const PatternObservation: React.FC<PatternObservationProps> = ({
  text,
  occurrences = 'noticed',
  className,
}) => {
  const Icon = occurrences === 'often' ? TrendingUp : occurrences === 'sometimes' ? Heart : Lightbulb;
  return <Row icon={<Icon />} title={text} line={occurrenceLabel[occurrences]} className={className} />;
};

/**
 * StatCard - one figure as a row: what it is, then the value. Render inside a List.
 */
interface StatCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon }) => (
  <Row icon={icon} title={label} line={value} />
);

export default TwinReflection;
