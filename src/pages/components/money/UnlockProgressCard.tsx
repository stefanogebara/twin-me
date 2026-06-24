/**
 * UnlockProgressCard — the ONE honest promise card (replan-2026-06-10 Track D)
 * ============================================================================
 * Replaces the four permanently-empty promise surfaces (stress-spend
 * patterns, daily risk forecast, nudges & wins tab, savings hero). Instead
 * of three empty-state shrines, one meter that states concretely what
 * unlocks when, with live counts computed from data the page already
 * fetches (no new endpoints).
 */

import React from 'react';
import { Lock, Activity } from 'lucide-react';
import type { TimelineDay, Transaction } from '@/services/api/transactionsAPI';
import { computeUnlockProgress } from './unlockProgress';

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--glass-surface-bg)',
  border: '1px solid var(--glass-surface-border)',
  backdropFilter: 'blur(42px)',
  WebkitBackdropFilter: 'blur(42px)',
  borderRadius: 20,
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'Geist', 'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'rgba(255, 255, 255, 0.55)',
};

interface Props {
  timeline: TimelineDay[];
  transactions: Transaction[];
}

export function UnlockProgressCard({ timeline, transactions }: Props) {
  const progress = computeUnlockProgress(timeline, transactions);

  return (
    <div
      data-testid="unlock-progress-card"
      className="mt-6"
      style={{ ...CARD_STYLE, padding: '24px 24px 20px' }}
    >
      <div className="flex items-center gap-2 mb-3">
        {progress.unlocked ? (
          <Activity className="w-3.5 h-3.5" style={{ color: 'rgba(232, 160, 80, 0.85)' }} />
        ) : (
          <Lock className="w-3.5 h-3.5" style={{ color: 'rgba(255, 255, 255, 0.55)' }} />
        )}
        <p style={{ ...LABEL_STYLE, marginBottom: 0 }}>
          {progress.unlocked ? 'Pattern analysis running' : 'What unlocks next'}
        </p>
      </div>

      <p
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 19,
          lineHeight: 1.4,
          color: 'var(--foreground)',
          letterSpacing: '-0.01em',
          marginBottom: 6,
        }}
      >
        {progress.unlocked
          ? `You have ${progress.overlapDays} days of overlap between your spending and your body data.`
          : 'Connect your bank and wear your Whoop.'}
      </p>
      <p
        style={{
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontSize: 13,
          color: 'rgba(255,255,255,0.55)',
          lineHeight: 1.55,
          marginBottom: 16,
        }}
      >
        {progress.unlocked
          ? 'Your stress-spend patterns are being analyzed. Strong correlations between stress, body, and spending will appear here as they emerge.'
          : `After about ${progress.targetDays} days where transactions and recovery data overlap, your stress-spend patterns unlock: which purchases happen under stress, when impulse risk is highest, and what pausing saves you.`}
      </p>

      {/* Progress meter */}
      <div
        aria-hidden
        style={{
          height: 6,
          borderRadius: 100,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: `${progress.pct}%`,
            height: '100%',
            borderRadius: 100,
            background: 'rgba(232, 160, 80, 0.75)',
            transition: 'width 300ms ease-out',
          }}
        />
      </div>
      <p
        style={{
          fontFamily: "'Geist', 'Inter', sans-serif",
          fontSize: 12,
          color: 'rgba(255, 255, 255, 0.55)',
        }}
      >
        {progress.transactionDays} day{progress.transactionDays === 1 ? '' : 's'} of transactions
        {' · '}
        {progress.overlapDays} of {progress.targetDays} overlap day{progress.targetDays === 1 ? '' : 's'} with body data
      </p>
    </div>
  );
}
