import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
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
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (!data.summary) return null;

  const pullQuote = extractFirstSentence(data.summary);

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl p-6 md:p-8 h-full"
      style={{
        backgroundColor: isDark ? 'rgba(35, 32, 40, 0.7)' : 'rgba(248, 246, 255, 0.9)',
        border: isDark
          ? '1px solid rgba(155, 89, 182, 0.2)'
          : '1px solid rgba(155, 89, 182, 0.15)',
        boxShadow: isDark
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(155, 89, 182, 0.1)'
          : '0 8px 32px rgba(155, 89, 182, 0.08)',
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{
          background: 'linear-gradient(180deg, #9B59B6 0%, rgba(155, 89, 182, 0.2) 100%)',
        }}
      />

      {/* Background glow */}
      <div
        className="absolute top-0 left-0 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(155, 89, 182, 0.08) 0%, transparent 70%)',
          transform: 'translate(-30%, -30%)',
        }}
      />

      <div className="relative pl-2">
        <p
          className="text-xs uppercase tracking-widest font-medium mb-4"
          style={{ color: '#9B59B6' }}
        >
          Soul Summary
        </p>

        <blockquote
          className="text-xl md:text-2xl leading-snug font-light mb-5"
          style={{
            color: isDark ? '#E8E6D9' : '#1a1714',
            letterSpacing: '-0.01em',
          }}
        >
          {pullQuote}
        </blockquote>

        <p
          className="text-xs"
          style={{ color: isDark ? 'rgba(193, 192, 182, 0.35)' : '#a8a29e' }}
        >
          Last updated {timeAgoLabel(data.generatedAt)}
        </p>
      </div>
    </motion.div>
  );
};
