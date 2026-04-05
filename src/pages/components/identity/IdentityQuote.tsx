/**
 * IdentityQuote — Dynamic weekly identity one-liner
 * ===================================================
 * A data-derived observation that makes the user feel "seen."
 * Pulls from twin_summaries (via /twin/identity) or soul-signature/profile.
 *
 * Example: "Someone who finds most meaning in ideas that arrive sideways, usually at night."
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { authFetch } from '@/services/api/apiBase';

function extractQuote(text: string): string | null {
  if (!text || text.length < 20) return null;
  // Extract first sentence (up to first period, exclamation, or question mark)
  const firstSentence = text.match(/^[^.!?]+[.!?]?/)?.[0]?.trim();
  return firstSentence && firstSentence.length > 20 ? firstSentence : text.slice(0, 140);
}

async function fetchQuote(): Promise<string | null> {
  // Try twin identity endpoint first (has twin_summaries data)
  try {
    const res = await authFetch('/twin/identity');
    if (res.ok) {
      const json = await res.json();
      const summary = json.data?.summary || '';
      const quote = extractQuote(summary);
      if (quote) return quote;
    }
  } catch { /* fall through */ }

  // Fallback: soul-signature profile
  try {
    const res = await authFetch('/soul-signature/profile');
    if (res.ok) {
      const json = await res.json();
      const profile = json.profile || json;
      const summary = profile?.twin_summary || profile?.summary || '';
      return extractQuote(summary);
    }
  } catch { /* fall through */ }

  return null;
}

const IdentityQuote: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { data: quote } = useQuery({
    queryKey: ['identity', 'quote'],
    queryFn: fetchQuote,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  if (!quote) return null;

  return (
    <motion.div
      className={`mb-5 ${className}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
    >
      <div
        className="rounded-[20px] px-5 py-4 transition-all duration-300 hover:-translate-y-0.5"
        style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.15)',
        }}
      >
        <div className="pl-4" style={{ borderLeft: '2px solid rgba(255,132,0,0.3)' }}>
          <p
            className="text-lg leading-relaxed"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.65)',
              maxWidth: '520px',
              letterSpacing: '-0.01em',
            }}
          >
            &ldquo;{quote}&rdquo;
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default IdentityQuote;
