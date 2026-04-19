/**
 * TemporalComparison — "You then vs you now"
 * ============================================
 * Two-column glass card showing a contrast between the user ~60 days ago
 * (THEN) and the user today (NOW), generated from the memory stream by
 * api/services/temporalComparisonService.js.
 *
 * Renders NOTHING when the backend reports `available: false` — we never
 * want to show an empty/placeholder state here.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { authFetch } from '@/services/api/apiBase';

interface TemporalComparisonResponse {
  available: boolean;
  then?: string;
  now?: string;
  generatedAt?: string;
  reason?: string;
}

async function fetchTemporalComparison(): Promise<TemporalComparisonResponse> {
  const res = await authFetch('/identity/temporal-comparison');
  if (!res.ok) return { available: false };
  return res.json();
}

const TemporalComparison: React.FC = () => {
  const { data } = useQuery<TemporalComparisonResponse>({
    queryKey: ['identity-temporal-comparison'],
    queryFn: fetchTemporalComparison,
    staleTime: 12 * 60 * 60 * 1000, // 12h — backend TTL is 24h
    retry: false,
  });

  if (!data || !data.available || !data.then || !data.now) {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
    >
      <h2
        className="mb-4"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 'clamp(22px, 3vw, 28px)',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        How you've changed
      </h2>

      <div
        className="rounded-[20px] px-5 py-5"
        style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px rgba(0,0,0,0.15)',
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-5 sm:gap-4 items-stretch">
          {/* THEN */}
          <div className="flex flex-col gap-2">
            <span
              className="text-[10px] font-medium uppercase tracking-[0.16em]"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
            >
              Then
            </span>
            <p
              className="text-[14.5px] leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.75)', fontFamily: "'Inter', sans-serif" }}
            >
              {data.then}
            </p>
          </div>

          {/* Arrow — desktop only */}
          <div
            className="hidden sm:flex items-center justify-center px-2"
            aria-hidden="true"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            <span className="text-xl select-none">→</span>
          </div>

          {/* NOW — left border accent */}
          <div
            className="flex flex-col gap-2 pl-4 sm:pl-5"
            style={{ borderLeft: '3px solid var(--accent-vibrant)' }}
          >
            <span
              className="text-[10px] font-medium uppercase tracking-[0.16em]"
              style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'Inter', sans-serif" }}
            >
              Now
            </span>
            <p
              className="text-[14.5px] leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}
            >
              {data.now}
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default TemporalComparison;
