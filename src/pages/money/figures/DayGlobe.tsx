/**
 * Today as a globe.
 *
 * The orb engine's dotted globe, at rest, carrying the day: its marks fill from the bottom
 * as the day is spent, ember below the waterline, hollow ink above it; the number of what
 * is left sits inside on a small clearing. Over the day's allowance, the whole globe is
 * filled in the danger colour and the number says by how much. It turns at a quarter of
 * the searching state's pace, takes one breath when what was spent changes, and holds a
 * still frame under reduced motion. Tapping it is the page's business (onTap).
 */
import { useEffect, useRef } from 'react';
import { MODE_FRAMES, resolvePreset } from '../../../lib/orb/engine.js';
import { paletteOf, rgba, lerp } from './orbColors';
import { euro } from '../../../services/api/moneyAPI';

type Props = { left: number; spent: number; over?: boolean; size?: number; label: string; onTap?: () => void; open?: boolean };

export default function DayGlobe({ left, spent, over = false, size = 240, label, onTap, open = false }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const state = useRef({ spent, breathe: 0 });

  useEffect(() => {
    if (state.current.spent !== spent) { state.current.spent = spent; state.current.breathe = performance.now(); }
  }, [spent]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
    const pal = paletteOf(canvas);
    const preset = resolvePreset('searching', 64);
    const frames = MODE_FRAMES[preset.mode];
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cx = size / 2, cy = size / 2;
    let t = 0, last = performance.now(), raf = 0, running = true;
    const draw = (now: number) => {
      t += ((now - last) / 1000) * preset.speed * 0.15; last = now;
      const since = state.current.breathe ? (now - state.current.breathe) / 1000 : 9;
      const puff = since < 1.4 ? Math.sin((since / 1.4) * Math.PI) * 0.05 : 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
      const f = frames(size, still ? 0.6 : t, preset.opts);
      const total = spent + Math.max(0, left);
      const share = over ? 1 : total > 0 ? Math.min(1, spent / total) : 0;
      const ys = f.dots.map((d) => d.y); const top = Math.min(...ys), bottom = Math.max(...ys);
      const water = bottom - (bottom - top) * share;
      const fill = over ? pal.danger : pal.ember;
      for (const d of [...f.dots].sort((a, b) => a.z - b.z)) {
        const sx = cx + (d.x - cx) * (1 + puff), sy = cy + (d.y - cy) * (1 + puff); const r = Math.max(0.9, d.r);
        ctx.beginPath();
        if (d.y >= water) { ctx.fillStyle = rgba(lerp(fill, pal.page, d.white * 0.6), 0.95); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.strokeStyle = rgba(lerp(pal.ink, pal.page, d.white), 0.7); ctx.lineWidth = 0.9; ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.fillStyle = rgba(pal.page, 0.8); ctx.beginPath(); ctx.ellipse(cx, cy + 4, size * 0.21, size * 0.095, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(over ? pal.danger : pal.ink, 1); ctx.font = `300 ${Math.round(size * 0.11)}px Geist, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(over ? euro(Math.abs(left)) : euro(Math.max(0, left)), cx, cy + size * 0.03);
      ctx.fillStyle = rgba(pal.quiet, 1); ctx.font = `350 ${Math.round(size * 0.045)}px Geist, sans-serif`;
      ctx.fillText(over ? 'over today' : 'left today', cx, cy + size * 0.1);
      if (running && !still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [left, spent, over, size]);

  return (
    <canvas
      ref={ref}
      className="mv-globe"
      role={onTap ? 'button' : 'img'}
      tabIndex={onTap ? 0 : undefined}
      aria-label={label}
      aria-expanded={onTap ? open : undefined}
      style={{ width: size, height: size }}
      onClick={onTap}
      onKeyDown={onTap ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } } : undefined}
    />
  );
}
