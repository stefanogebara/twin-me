/**
 * IdentityQuote — Dynamic weekly identity one-liner
 * ===================================================
 * A data-derived observation that makes the user feel "seen."
 * Regenerated weekly, cached in the twin summary.
 *
 * Example: "Someone who finds most meaning in ideas that arrive sideways, usually at night."
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { authFetch } from '@/services/api/apiBase';

async function fetchQuote(): Promise<string | null> {
  try {
    const res = await authFetch('/soul-signature/profile');
    if (!res.ok) return null;
    const json = await res.json();
    const profile = json.profile || json;
    // Use the twin summary's first sentence as the identity quote
    const summary = profile?.twin_summary || profile?.summary || '';
    if (!summary) return null;
    // Extract first sentence (up to first period, exclamation, or ~120 chars)
    const firstSentence = summary.match(/^[^.!?]+[.!?]?/)?.[0]?.trim();
    return firstSentence && firstSentence.length > 20 ? firstSentence : summary.slice(0, 120);
  } catch {
    return null;
  }
}

const IdentityQuote: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { data: quote } = useQuery({
    queryKey: ['identity', 'quote'],
    queryFn: fetchQuote,
    staleTime: 24 * 60 * 60 * 1000, // 24h cache
    retry: 1,
  });

  if (!quote) return null;

  return (
    <motion.div
      className={`mb-10 ${className}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
    >
      <p
        className="text-center text-lg leading-relaxed"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.55)',
          maxWidth: '480px',
          margin: '0 auto',
          letterSpacing: '-0.01em',
        }}
      >
        &ldquo;{quote}&rdquo;
      </p>
    </motion.div>
  );
};

export default IdentityQuote;
