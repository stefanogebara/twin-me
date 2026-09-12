/**
 * IdentityQuote — Dynamic weekly identity one-liner
 * ===================================================
 * A data-derived observation that makes the user feel "seen."
 * Pulls from twin_summaries (via /twin/identity) or soul-signature/profile.
 *
 * Example: "Someone who finds most meaning in ideas that arrive sideways, usually at night."
 *
 * In the register it is one upright Geist sentence under the list rule's
 * rhythm: no card, no left bar, no italic (Geist has no true italic).
 */

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';

function extractQuote(text: string): string | null {
  if (!text || text.length < 20) return null;
  // Extract first sentence (up to first period, exclamation, or question mark)
  const firstSentence = text.match(/^[^.!?]+[.!?]?/)?.[0]?.trim();
  return firstSentence && firstSentence.length > 20 ? firstSentence : text.slice(0, 140);
}

// Derive the quote from IdentityPage's already-cached ['twin-identity'] query
// rather than re-fetching /twin/identity under a separate key. Falls back to
// /soul-signature/profile only when the cache has no usable summary.
async function fetchQuote(cachedSummary: string): Promise<string | null> {
  const cachedQuote = extractQuote(cachedSummary);
  if (cachedQuote) return cachedQuote;

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
  const queryClient = useQueryClient();
  const cachedIdentity = queryClient.getQueryData<{ data?: { summary?: string | null } }>(['twin-identity']);
  const cachedSummary = cachedIdentity?.data?.summary || '';

  const { data: quote } = useQuery({
    queryKey: ['identity', 'quote', cachedSummary],
    queryFn: () => fetchQuote(cachedSummary),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  if (!quote) return null;

  return (
    <section className={`rg-section ${className}`}>
      <blockquote
        style={{
          margin: 0,
          maxWidth: '36ch',
          fontFamily: 'var(--rg-sans)',
          fontSize: 'clamp(20px, 2.2vw, 24px)',
          fontWeight: 300,
          lineHeight: 1.25,
          letterSpacing: '-0.02em',
          textWrap: 'balance',
          color: 'var(--rg-ink)',
        }}
      >
        &ldquo;{quote}&rdquo;
      </blockquote>
    </section>
  );
};

export default IdentityQuote;
