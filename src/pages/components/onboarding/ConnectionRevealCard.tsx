/**
 * ConnectionRevealCard
 * ====================
 * Shown immediately after a successful OAuth connection.
 *
 * The OAuth moment is the single highest-investment point in the user journey
 * (user just granted data access). Previously the UI only showed a toast and
 * kept the user on the same list of platforms. This section produces the
 * "wow — it already noticed something" moment by surfacing the 2–3 most recent
 * observations the memory stream generated from the fresh data.
 *
 * Behavior:
 *   1. Renders after a connection event (driven by a URL param and cleared
 *      once the user dismisses).
 *   2. Polls /mem0/memories?limit=30 once on mount and every 6s for up to 5
 *      tries, filtering for observations tagged with this platform that were
 *      created in the last 5 minutes.
 *   3. Shows two loading rows until observations appear.
 *   4. Shows up to 3 observations as rows, with a way to continue the
 *      conversation in /talk-to-twin.
 *
 * If no observations appear within ~30s (platform may be slow to extract —
 * Gmail, LinkedIn, GitHub can take minutes) we fall back to a confident
 * "Observing in the background" line rather than spinning indefinitely.
 *
 * In the register: a section of the page kit, no card, no glow, no italic.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { Section, List, Empty } from '@/components/register';

const DISPLAY_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  google_calendar: 'Google Calendar',
  google_gmail: 'Gmail',
  google: 'Google',
  whoop: 'Whoop',
  github: 'GitHub',
  discord: 'Discord',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  twitch: 'Twitch',
  strava: 'Strava',
  notion: 'Notion',
  pinterest: 'Pinterest',
  soundcloud: 'SoundCloud',
};

const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 6_000;
const WINDOW_MINUTES = 5;
const MAX_OBSERVATIONS = 3;

type Memory = {
  id: string;
  content: string;
  memory_type?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
};

interface Props {
  provider: string;
  onDismiss: () => void;
}

function displayName(provider: string): string {
  return DISPLAY_NAMES[provider] || provider.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function matchesProvider(mem: Memory, provider: string): boolean {
  const meta = mem.metadata || {};
  const metaPlatform = String(meta.platform || meta.source || '').toLowerCase();
  const content = (mem.content || '').toLowerCase();
  const needle = provider.toLowerCase();

  if (metaPlatform === needle) return true;
  if (metaPlatform.includes(needle)) return true;
  // Fallback for observations whose metadata didn't get stamped (defensive)
  return content.includes(needle);
}

function isRecent(mem: Memory): boolean {
  if (!mem.created_at) return false;
  const ts = new Date(mem.created_at).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < WINDOW_MINUTES * 60 * 1000;
}

const ConnectionRevealCard: React.FC<Props> = ({ provider, onDismiss }) => {
  const navigate = useNavigate();
  const [observations, setObservations] = useState<Memory[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [givenUp, setGivenUp] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const platformLabel = useMemo(() => displayName(provider), [provider]);

  const fetchOnce = useCallback(async () => {
    if (cancelledRef.current) return;
    try {
      const res = await authFetch('/mem0/memories?limit=30');
      if (!res.ok) return;
      const data = await res.json();
      const memories: Memory[] = Array.isArray(data?.memories) ? data.memories : [];
      const fresh = memories
        .filter(m => m.memory_type !== 'reflection')
        .filter(m => matchesProvider(m, provider))
        .filter(isRecent)
        .slice(0, MAX_OBSERVATIONS);

      if (fresh.length > 0 && !cancelledRef.current) {
        setObservations(fresh);
      }
    } catch {
      // Non-fatal: memory stream may still be populating
    }
  }, [provider]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchOnce();
    return () => { cancelledRef.current = true; };
  }, [fetchOnce]);

  useEffect(() => {
    // Keep polling until we have observations, hit max attempts, or dismissed.
    if (observations.length > 0 || givenUp) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    if (attempts >= MAX_POLL_ATTEMPTS) {
      setGivenUp(true);
      return;
    }
    timerRef.current = setTimeout(() => {
      setAttempts(a => a + 1);
      fetchOnce();
    }, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [attempts, observations.length, givenUp, fetchOnce]);

  const handleAskTwin = useCallback(() => {
    const prompt = encodeURIComponent(
      `What did you just learn from my ${platformLabel} data? Give me the most non-obvious observation.`
    );
    // audit-2026-06-10: TalkToTwin reads ?prefill= (not ?prompt=)
    navigate(`/talk-to-twin?prefill=${prompt}`);
  }, [navigate, platformLabel, provider]);

  return (
    <AnimatePresence>
      <motion.div
        key="connection-reveal"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ marginBottom: 'var(--rg-section)' }}
      >
        <Section
          title={observations.length > 0
            ? 'Here is what your twin already noticed'
            : givenUp
              ? 'Observing in the background'
              : 'Your twin is observing'}
          line={`${platformLabel} connected`}
          action={
            <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rg-iconbtn">
              <X aria-hidden="true" />
            </button>
          }
        >
          <List label={`What your twin noticed in ${platformLabel}`}>
            {observations.length === 0 && !givenUp && [0, 1].map(i => (
              <li key={i} className="rg-row rg-row--plain" aria-hidden="true">
                <span className="rs-skel" style={{ width: i === 0 ? '80%' : '60%' }} />
                <span />
              </li>
            ))}

            {observations.length === 0 && givenUp && (
              <li>
                <Empty>Still reading your {platformLabel} data. Come back in a minute, or connect more.</Empty>
              </li>
            )}

            {observations.map((obs) => (
              <li key={obs.id} className="rg-row rg-row--plain">
                <p className="rs-prose">{obs.content}</p>
                <span />
              </li>
            ))}
          </List>

          <div className="rs-inline" style={{ marginTop: 24 }}>
            <button type="button" onClick={handleAskTwin} className="n-btn n-btn--ghost">
              Ask your twin about this
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={onDismiss} className="rs-link">
              Connect another
            </button>
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
};

export default ConnectionRevealCard;
