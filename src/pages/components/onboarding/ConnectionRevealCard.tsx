/**
 * ConnectionRevealCard
 * ====================
 * Shown immediately after a successful OAuth connection.
 *
 * The OAuth moment is the single highest-investment point in the user journey
 * (user just granted data access). Previously the UI only showed a toast and
 * kept the user on the same list of platforms. This card produces the "wow —
 * it already noticed something" moment by surfacing the 2–3 most recent
 * observations the memory stream generated from the fresh data.
 *
 * Behavior:
 *   1. Renders for 60s after a connection event (driven by a URL param and
 *      cleared once the user dismisses).
 *   2. Polls /mem0/memories?limit=30 once on mount and every 6s for up to 5
 *      tries, filtering for observations tagged with this platform that were
 *      created in the last 5 minutes.
 *   3. Shows "Your twin is observing..." shimmer until observations appear.
 *   4. Shows up to 3 observations in the twin's second-person voice with a
 *      CTA to continue the conversation in /talk-to-twin.
 *
 * If no observations appear within ~30s (platform may be slow to extract —
 * Gmail, LinkedIn, GitHub can take minutes) we fall back to a confident
 * "Observing in the background — come back shortly" message rather than
 * spinning indefinitely.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

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
    navigate(`/talk-to-twin?prompt=${prompt}`);
  }, [navigate, platformLabel, provider]);

  return (
    <AnimatePresence>
      <motion.div
        key="connection-reveal"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative mb-6 rounded-[20px] overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Ambient accent band — visually signals this is a meaningful moment */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, rgba(255,132,0,0.0) 0%, rgba(255,132,0,0.8) 50%, rgba(255,132,0,0.0) 100%)',
          }}
        />

        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute top-3 right-3 p-1 rounded-full transition-opacity hover:opacity-80"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-vibrant)' }} />
            <span
              className="text-[11px] font-medium uppercase tracking-[0.14em]"
              style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'Inter', sans-serif" }}
            >
              {platformLabel} connected
            </span>
          </div>

          <h3
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              fontSize: 'clamp(22px, 3.2vw, 28px)',
              fontWeight: 400,
              color: 'var(--foreground)',
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
            }}
          >
            {observations.length > 0
              ? 'Here is what your twin already noticed'
              : givenUp
                ? 'Observing in the background'
                : 'Your twin is observing...'}
          </h3>

          <div className="mt-4 space-y-2.5">
            {observations.length === 0 && !givenUp && (
              <>
                {[0, 1].map(i => (
                  <div
                    key={i}
                    className="h-[52px] rounded-[12px] animate-pulse"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  />
                ))}
              </>
            )}

            {observations.length === 0 && givenUp && (
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.60)', fontFamily: "'Inter', sans-serif" }}
              >
                Extraction is still running — come back in a minute and your twin will have something to say about your {platformLabel} data. For now, you can connect more platforms or ask your twin anything.
              </p>
            )}

            {observations.map((obs) => (
              <div
                key={obs.id}
                className="px-3.5 py-2.5 rounded-[12px]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <p
                  className="text-[13px] leading-[1.55]"
                  style={{ color: 'rgba(255,255,255,0.82)', fontFamily: "'Inter', sans-serif" }}
                >
                  {obs.content}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleAskTwin}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[100px] text-[13px] font-medium transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
              style={{ background: '#F5F5F4', color: '#110f0f', fontFamily: "'Inter', sans-serif" }}
            >
              Ask your twin about this
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDismiss}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-[100px] text-[12px] font-medium transition-all duration-150 hover:opacity-80"
              style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
            >
              Connect another
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ConnectionRevealCard;
