/**
 * TemporalComparison — "You then vs you now"
 * ============================================
 * A contrast between the user ~60 days ago (THEN) and the user today (NOW),
 * generated from the memory stream by
 * api/services/temporalComparisonService.js.
 *
 * In the register: a section of two rows, each showing its first sentence
 * with the rest behind a press. No card, no tracked caps, no italic.
 *
 * Renders NOTHING when the backend reports `available: false` — we never
 * want to show an empty/placeholder state here.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import { Section, List } from '@/components/register';
import ExpandRow from './ExpandRow';

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

/** The first sentence as the row's grey line, the rest behind the press. */
function firstSentence(text: string): { first: string; rest: string } {
  const idx = text.search(/[.!?]\s/);
  if (idx === -1) return { first: text, rest: '' };
  return { first: text.slice(0, idx + 1), rest: text.slice(idx + 2).trim() };
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

  const then = firstSentence(data.then);
  const now = firstSentence(data.now);

  return (
    <Section title="How you've changed">
      <List>
        <ExpandRow title="Two months ago" line={then.first} more={then.rest || null} />
        <ExpandRow title="Now" line={now.first} more={now.rest || null} />
      </List>
    </Section>
  );
};

export default TemporalComparison;
