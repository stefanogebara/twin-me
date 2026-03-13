import React from 'react';
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
    <div
      className="relative overflow-hidden rounded-lg p-6 md:p-8 h-full"
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{
          background: 'linear-gradient(180deg, #10b77f 0%, rgba(16, 183, 127, 0.15) 100%)',
        }}
      />

      <div className="relative pl-2">
        <p
          className="text-[11px] font-medium tracking-widest uppercase mb-4"
          style={{ color: '#10b77f' }}
        >
          Soul Summary
        </p>

        <blockquote
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '28px',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: 'var(--foreground)',
            lineHeight: 1.3,
            marginBottom: '20px',
          }}
        >
          {toSecondPerson(pullQuote)}
        </blockquote>

        <p
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          Last updated {timeAgoLabel(data.generatedAt)}
        </p>
      </div>
    </div>
  );
};
