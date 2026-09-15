/**
 * The month as a planet.
 *
 * The orb engine's dotted globe with the month on it: the nearest marks are the biggest
 * payments, sized by amount and coloured by their kind of place (the signature its tile
 * carries), the rest of the surface the small stuff in ink. It turns at the searching
 * state's slowest pace and holds under reduced motion. Tapping a large mark names its
 * payment in the caption. Every mark is a row of the ledger; nothing is decoration.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MODE_FRAMES, resolvePreset } from '../../../lib/orb/engine.js';
import { paletteOf, rgba, lerp, signatureFor } from './orbColors';
import { GROUND_BY_KIND } from '../carvedKinds';
import { euro, type MoneyTransaction } from '../../../services/api/moneyAPI';

const NAMED = 20;

export default function MonthPlanet({ rows, size = 260, label }: { rows: MoneyTransaction[]; size?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [named, setNamed] = useState<string | null>(null);
  const hits = useRef<{ x: number; y: number; r: number; t: MoneyTransaction }[]>([]);
  const top = useMemo(() => [...rows].filter((t) => Number(t.amount) < 0).sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount))).slice(0, NAMED), [rows]);
  const maxAmt = Math.max(1, ...top.map((t) => Math.abs(Number(t.amount))));

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
    let t = 0, last = performance.now(), raf = 0, running = true;
    const draw = (now: number) => {
      t += ((now - last) / 1000) * preset.speed * 0.12; last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
      const f = frames(size, still ? 0.6 : t, preset.opts);
      const dots = [...f.dots].sort((a, b) => a.z - b.z);
      const near = [...dots].sort((a, b) => b.z - a.z).slice(0, top.length);
      const tag = new Map(near.map((d, i) => [d, top[i]]));
      hits.current = [];
      for (const d of dots) {
        const tx = tag.get(d);
        if (tx) {
          const amt = Math.abs(Number(tx.amount)); const r = 2.5 + (amt / maxAmt) * 7;
          const sig = signatureFor(tx.category, GROUND_BY_KIND);
          const col = sig ? pal[sig] || pal.ink : pal.ink;
          ctx.fillStyle = rgba(lerp(col, pal.page, d.white * 0.35), 0.95); ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2); ctx.fill();
          if (named && named === tx.id) { ctx.strokeStyle = rgba(pal.ink, 1); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(d.x, d.y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
          hits.current.push({ x: d.x, y: d.y, r: r + 4, t: tx });
        } else {
          ctx.fillStyle = rgba(lerp(pal.ink, pal.page, d.white), 0.9); ctx.beginPath(); ctx.arc(d.x, d.y, Math.max(0.6, d.r * 0.9), 0, Math.PI * 2); ctx.fill();
        }
      }
      if (running && !still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [rows, size, named, top, maxAmt]);

  function tap(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = hits.current.find((h) => (h.x - x) ** 2 + (h.y - y) ** 2 <= h.r ** 2);
    setNamed(hit ? (named === hit.t.id ? null : hit.t.id) : null);
  }
  const shown = named ? top.find((t) => t.id === named) : null;
  const caption = shown
    ? `${shown.merchant_name || shown.merchant_raw || 'Unknown'}, ${euro(Math.abs(Number(shown.amount)))}, ${new Date(shown.occurred_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`
    : `${rows.length} payments. The ${Math.min(top.length, 5)} nearest are the biggest.`;
  return (
    <figure className="mv-planet">
      <canvas ref={ref} role="img" aria-label={label} style={{ width: size, height: size }} onClick={tap} />
      <figcaption className="mv-sub">{caption}</figcaption>
    </figure>
  );
}
