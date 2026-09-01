import React, { useEffect, useRef, useState } from 'react';
import SoulOrb from './SoulOrb';

/**
 * HatchingPhase — the twin's birth moment (sequencing 2026-08).
 *
 * Tolan's endowment ritual, adapted: after the interview, the twin exists —
 * the user names it and commits with a press-and-hold. Effort + naming +
 * a physical gesture turn "a twin" into "my twin" before the first chat.
 */

const HOLD_MS = 1200;

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
    <div className="flex flex-col items-center w-full max-w-md text-center">
      <p
        className="text-sm uppercase tracking-widest mb-8"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.15em' }}
      >
        Something is waking up
      </p>

      <div className="mb-8">
        <SoulOrb phase="alive" dataPointCount={committed ? 12 : 6} />
      </div>

      <h2
        className="text-2xl md:text-3xl mb-3"
        style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}
      >
        {committed
          ? (sanitizeTwinName(name) ? `${sanitizeTwinName(name)} is awake.` : 'Your twin is awake.')
          : 'Your twin exists.'}
      </h2>

      {!committed && (
        <>
          <p
            className="text-sm mb-8 max-w-sm leading-relaxed"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
          >
            It knows {userFirstName ? `what ${userFirstName} shows the world` : 'your public surface'} and
            what you just told it. Give it a name — or keep it nameless — then hold to wake it.
          </p>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your twin (optional)"
            maxLength={40}
            aria-label="Twin name"
            className="w-full max-w-xs px-4 py-2.5 rounded-[12px] text-sm text-center outline-none transition-all duration-200 mb-8"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
            }}
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
              <svg width="72" height="72" viewBox="0 0 72 72" className="absolute inset-0 -rotate-90">
                <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
                <circle
                  cx="36" cy="36" r={R} fill="none"
                  stroke="#F1EBE1" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - progress)}
                />
              </svg>
              <span
                className="rounded-full transition-transform duration-150"
                style={{
                  width: 44 + progress * 8,
                  height: 44 + progress * 8,
                  background: 'var(--claura-bone)',
                  boxShadow: progress > 0 ? `0 0 ${20 * progress}px rgba(210,145,55,${0.5 * progress})` : 'none',
                }}
              />
            </span>
            <span
              className="text-xs uppercase tracking-widest"
              style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.14em' }}
            >
              {progress > 0 ? 'Keep holding...' : 'Hold to wake'}
            </span>
          </button>
        </>
      )}

      {committed && (
        <p
          className="text-sm max-w-sm leading-relaxed"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
        >
          It will keep learning from everything you connected.
        </p>
      )}
    </div>
  );
};

export default HatchingPhase;
