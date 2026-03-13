import React from 'react';
import { motion } from 'framer-motion';
import { toSecondPerson } from '@/lib/utils';
import type { TwinSummaryData } from './types';

interface Props {
  data: TwinSummaryData;
}

function extractFirstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return match ? match[0].trim() : text.slice(0, 160).trim();
}

function timeAgoLabel(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export const BentoHero: React.FC<Props> = ({ data }) => {
  if (!data.summary) return null;

  const pullQuote = extractFirstSentence(data.summary);

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl p-6 md:p-8 h-full"
      style={{
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid var(--glass-surface-border)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{
          background: 'linear-gradient(180deg, var(--accent-vibrant) 0%, rgba(255, 132, 0, 0.15) 100%)',
        }}
      />

      {/* Background glow */}
      <div
        className="absolute top-0 left-0 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--accent-vibrant-glow) 0%, transparent 70%)',
          transform: 'translate(-30%, -30%)',
        }}
      />

      <div className="relative pl-2">
        <p
          className="text-xs uppercase tracking-widest font-medium mb-4"
          style={{ color: 'var(--accent-amber)' }}
        >
          Soul Summary
        </p>

        <blockquote
          className="text-xl md:text-2xl leading-snug font-light mb-5"
          style={{
            color: 'var(--text-narrative)',
            letterSpacing: '-0.01em',
          }}
        >
          {toSecondPerson(pullQuote)}
        </blockquote>

        <p
          className="text-xs"
          style={{ color: 'var(--text-narrative-muted)' }}
        >
          Last updated {timeAgoLabel(data.generatedAt)}
        </p>
      </div>
    </motion.div>
  );
};
