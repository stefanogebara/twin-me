import React, { useEffect, useRef, useState } from 'react';
import SoulOrb from './SoulOrb';

/**
 * HatchingPhase — the twin's birth moment (sequencing 2026-08).
 *
 * Tolan's endowment ritual, adapted: after the interview, the twin exists —
 * the user names it and commits with a press-and-hold. Effort + naming +
 * a physical gesture turn "a twin" into "my twin" before the first chat.
 *
 * In the register: a quiet status line, the upright Cosmos heading, the
 * borderless field, and an ink hold button with an ink progress ring.
 */

const HOLD_MS = 1200;

// SVG presentation attributes do not resolve var(): register.css's hex.
const RING_TRACK = '#eae9ea'; // --rg-rule
const RING_INK = '#251f21';   // --rg-ink

/** Trim, collapse whitespace, cap at 40 chars. Empty -> null. */
export function sanitizeTwinName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  return name.length > 0 ? name : null;
}

interface HatchingPhaseProps {
  userFirstName: string | null;
  onCommit: (twinName: string | null) => void;
}

const HatchingPhase: React.FC<HatchingPhaseProps> = ({ userFirstName, onCommit }) => {
  const [name, setName] = useState('');
  const [progress, setProgress] = useState(0); // 0..1
  const [committed, setCommitted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const committedRef = useRef(false);
  const nameRef = useRef('');
  nameRef.current = name;

  const stopHold = () => {
    holdStartRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (!committedRef.current) setProgress(0);
  };

  const startHold = () => {
    if (committedRef.current || holdStartRef.current != null) return;
    holdStartRef.current = performance.now();
    // Interval clock rather than rAF: progress is time-based either way, and
    // intervals keep ticking where rAF suspends (throttled/virtualized tabs).
    timerRef.current = setInterval(() => {
      if (holdStartRef.current == null) return;
      const p = Math.min(1, (performance.now() - holdStartRef.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        committedRef.current = true;
        setCommitted(true);
        // A short beat on the completed ring before leaving the moment.
        setTimeout(() => onCommit(sanitizeTwinName(nameRef.current)), 900);
      }
    }, 40);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Progress ring geometry
  const R = 30;
  const CIRC = 2 * Math.PI * R;

  return (
    <div className="rs-flow flex flex-col items-center w-full max-w-md text-center">
      <p className="rs-flow-line mb-8">Something is waking up</p>

      <div className="mb-8">
        <SoulOrb phase="alive" dataPointCount={committed ? 12 : 6} />
      </div>

      <h2 className="rs-flow-title mb-3">
        {committed
          ? (sanitizeTwinName(name) ? `${sanitizeTwinName(name)} is awake.` : 'Your twin is awake.')
          : 'Your twin exists.'}
      </h2>

      {!committed && (
        <>
          <p className="rs-flow-line mb-8 max-w-sm">
            It knows {userFirstName ? `what ${userFirstName} shows the world` : 'your public surface'} and
            what you just told it. Name it, or leave it nameless, then hold to wake it.
          </p>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your twin (optional)"
            maxLength={40}
            aria-label="Twin name"
            className="n-input mb-8"
            style={{ width: '100%', maxWidth: 320, textAlign: 'center' }}
          />

          {/* Hold-to-wake */}
          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startHold(); } }}
            onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') stopHold(); }}
            aria-label="Hold to wake your twin"
            className="relative flex flex-col items-center gap-3 cursor-pointer select-none bg-transparent border-none"
          >
            <span className="relative inline-flex items-center justify-center" style={{ width: 72, height: 72 }}>
              <svg width="72" height="72" viewBox="0 0 72 72" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <circle cx="36" cy="36" r={R} fill="none" stroke={RING_TRACK} strokeWidth="3" />
                <circle
                  cx="36" cy="36" r={R} fill="none"
                  stroke={RING_INK} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - progress)}
                />
              </svg>
              <span
                className="rounded-full transition-transform duration-150"
                style={{
                  width: 44 + progress * 8,
                  height: 44 + progress * 8,
                  background: 'var(--rg-ink)',
                }}
              />
            </span>
            <span className="rs-flow-line">
              {progress > 0 ? 'Keep holding' : 'Hold to wake'}
            </span>
          </button>
        </>
      )}

      {committed && (
        <p className="rs-flow-line max-w-sm">
          It will keep learning from everything you connected.
        </p>
      )}
    </div>
  );
};

export default HatchingPhase;
