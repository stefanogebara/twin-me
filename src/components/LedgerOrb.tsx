/**
 * The orb: the ledger at work, in view.
 *
 * A dotted thought-orb (Jakub Antalik's thinking-orbs engine, vendored in src/lib/orb)
 * drawn in the register's warm ink. It has one meaning on every screen: real work is
 * running right now. It is never decoration, never shown at rest, and there is one per
 * screen at most. Each state names the kind of work:
 *
 *   searching    a bank or the ledger is being read
 *   solving      the model is reasoning
 *   composing    an answer is being written
 *   connecting   waiting on somebody else: a bank's consent page, a sign-in email
 *   weaving      the month is being recomputed after new rows
 *   shaping      places are being looked up, the ledger is learning
 *   breathing    a page on its way (the loading screen)
 *   working      anything else
 *   listening    reserved for voice; not used yet
 *
 * Two tuned sizes exist, 20 (inline with text) and 64 (a screen's centre); any other size
 * borrows the nearer preset's geometry. Reduced motion gets one still frame. The canvas
 * sleeps when it is off screen or the tab is hidden.
 */
import { useEffect, useRef } from 'react';
import { MODE_DRAWS, resolvePreset } from '../lib/orb/engine.js';
import { inkOf } from '../lib/orb/ink';
import { useT } from '@/lib/i18n';

export type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping';

const LABEL: Record<OrbState, string> = {
  working: 'Working', searching: 'Reading', solving: 'Working it out', listening: 'Listening', connecting: 'Waiting on the other side',
  weaving: 'Recomputing', composing: 'Writing', breathing: 'One moment', shaping: 'Learning',
};

type Props = {
  state?: OrbState;
  /** CSS pixels. 20 inline, 64 for a screen; other sizes borrow the nearer preset. */
  size?: number;
  /** A multiplier on the state's own tempo. */
  speed?: number;
  paused?: boolean;
  /** What a screen reader hears; the state's word when not given. */
  label?: string;
  className?: string;
};


export default function LedgerOrb({ state = 'working', size = 20, speed = 1, paused = false, label, className }: Props) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d') as (CanvasRenderingContext2D & { __orb?: { ink: number[]; page: number[] } }) | null;
    if (!ctx) return;
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.__orb = inkOf(canvas);
    const preset = resolvePreset(state, size >= 40 ? 64 : 20);
    const draw = MODE_DRAWS[preset.mode];
    const tempo = preset.speed * speed;
    const frame = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      draw(ctx, size, t, false, preset.opts);
    };
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || paused) { frame(0.6); return; }

    let raf = 0;
    let running = false;
    let inView = true;
    const tick = () => { frame((performance.now() / 1000) * tempo); if (running) raf = requestAnimationFrame(tick); };
    const start = () => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') stop(); else if (inView) start(); };
    const io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView && document.visibilityState !== 'hidden') start(); else stop(); })
      : null;
    frame((performance.now() / 1000) * tempo);
    io?.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    if (!io) start();
    return () => { stop(); io?.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [state, size, speed, paused]);

  return (
    <canvas
      ref={ref}
      className={`orb${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={label || t(LABEL[state])}
      style={{ width: size, height: size }}
    />
  );
}
