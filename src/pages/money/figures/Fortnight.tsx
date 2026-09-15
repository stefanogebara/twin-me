/**
 * The last thirty days, as columns of dots or as a wave.
 *
 * The same marks two ways. Columns: one dot per ten euros, edge to edge, ink for a day
 * that has passed, ember for today, hollow for tomorrow's expected range; a day with
 * nothing is one faint mark. Wave: rows of marks rolling left to right, the crest at each
 * day as high as that day's cost. The switch is the person's and the page remembers it.
 * The caption is the strip's own sentence: the day under the finger, else the total.
 */
import { useEffect, useRef, useState } from 'react';
import { euro, shortDay, type MoneyDayStrip, type MoneyForecast } from '../../../services/api/moneyAPI';
import { paletteOf, rgba } from './orbColors';

type View = 'columns' | 'wave';
const KEY = 'mv-fortnight-view';
const DOT = 5;
const UNIT = 10;

export default function Fortnight({ strip, tomorrow }: { strip: MoneyDayStrip; tomorrow: MoneyForecast['tomorrow'] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem(KEY) as View) || 'columns'; } catch { return 'columns'; } });
  const [picked, setPicked] = useState<string | null>(null);
  const days = strip.days;
  const n = days.length + (tomorrow ? 1 : 0);

  function choose(v: View) { setView(v); try { localStorage.setItem(KEY, v); } catch { /* a preference, not a fact */ } }

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.clientWidth || 780, H = 200;
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const pal = paletteOf(canvas);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const days = strip.days;
    const value = (i: number) => (i < days.length ? days[i].total : tomorrow ? tomorrow.high : 0);
    const max = Math.max(1, ...Array.from({ length: n }, (_, i) => value(i)));
    const colX = (i: number) => 14 + (i / Math.max(1, n - 1)) * (W - 28);
    const t0 = performance.now(); let raf = 0, running = true;
    const swellAt = (u: number) => { const f = u * (n - 1); const i = Math.floor(f); const g = f - i; const a = value(Math.min(n - 1, i)) / max, b = value(Math.min(n - 1, i + 1)) / max; return a + (b - a) * g; };
    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const since = (now - t0) / 1000; const e = still ? 1 : 1 - Math.pow(1 - Math.min(1, since / 1.6), 3);
      if (view === 'wave') {
        const rows = 7, cols = Math.max(40, Math.round(W / 11));
        for (let r = 0; r < rows; r += 1) for (let k = 0; k < cols; k += 1) {
          const u = k / (cols - 1); const sw = swellAt(u) * e; const dayIdx = Math.round(u * (n - 1));
          const phase = u * Math.PI * 6 - (still ? 0 : now / 900) - r * 0.35;
          const x = 14 + u * (W - 28), y = 36 + r * 18 - sw * 40 * (0.55 + 0.45 * Math.sin(phase));
          const today = days[dayIdx]?.today && Math.abs(u * (n - 1) - dayIdx) < 0.5;
          const ahead = dayIdx >= days.length;
          ctx.fillStyle = today ? rgba(pal.ember, 0.3 + 0.7 * sw) : rgba(pal.ink, 0.18 + 0.72 * sw);
          ctx.beginPath(); ctx.arc(x, y, 1.2 + sw * 1.6, 0, Math.PI * 2); if (ahead) { ctx.strokeStyle = rgba(pal.quiet, 0.6); ctx.lineWidth = 1; ctx.stroke(); } else ctx.fill();
        }
      } else {
        for (let i = 0; i < n; i += 1) {
          const v = value(i); const dots = Math.min(Math.floor((H - 40) / DOT), Math.round(v / UNIT)); const ahead = i >= days.length; const today = !ahead && days[i].today; const miss = !ahead && days[i].hit === false;
          const arrive = still ? 1 : Math.min(1, Math.max(0, (since - i * 0.03) / 0.5)); const x = colX(i);
          for (let k = 0; k < Math.round(dots * arrive); k += 1) {
            const y = H - 26 - k * DOT; ctx.beginPath(); ctx.arc(x, y, DOT / 2 - 0.2, 0, Math.PI * 2);
            if (ahead) { ctx.strokeStyle = rgba(pal.quiet, 0.8); ctx.lineWidth = 1; ctx.stroke(); }
            else { ctx.fillStyle = today ? rgba(pal.ember, 1) : miss ? rgba(pal.danger, 0.9) : rgba(pal.ink, picked && picked !== days[i].day ? 0.45 : 0.95); ctx.fill(); }
          }
          if (dots === 0) { ctx.fillStyle = rgba(pal.quiet, 0.45); ctx.beginPath(); ctx.arc(x, H - 26, 1.2, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      if (running && (!still || view === 'columns') && since < 3) raf = requestAnimationFrame(draw); else if (running && !still && view === 'wave') raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [strip, tomorrow, view, picked, n]);

  const biggest = days.reduce((m, d) => (d.total > (m?.total ?? 0) ? d : m), null as MoneyDayStrip['days'][number] | null);
  const day = picked ? days.find((d) => d.day === picked) : null;
  const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const line = day
    ? `${dayName(day.day)}${day.today ? ', so far' : ''}: ${euro(day.total)}${day.count ? `, ${day.count} ${day.count === 1 ? 'payment' : 'payments'}` : ''}${day.said ? `. It said ${euro(day.said.low)} to ${euro(day.said.high)}, and ${day.hit ? 'held' : 'broke'}.` : '.'}`
    : [
      `${euro(strip.total)} over the last ${days.length - 1} days, on ${strip.days_with_spend} of them.`,
      biggest && biggest.total > 0 ? `The ${dayName(biggest.day)} was the biggest, ${euro(biggest.total)}.` : '',
      tomorrow ? (tomorrow.value > 0 ? `Tomorrow: usually ${euro(tomorrow.value)}, up to ${euro(tomorrow.high)}.` : `Tomorrow is usually quiet, up to ${euro(tomorrow.high)}.`) : '',
    ].filter(Boolean).join(' ');

  /* The day under the pointer, from its column; the caption says it. */
  function pick(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect(); const u = (e.clientX - r.left - 14) / Math.max(1, r.width - 28);
    const i = Math.round(Math.max(0, Math.min(1, u)) * (n - 1));
    setPicked(i < days.length ? days[i].day : null);
  }

  return (
    <figure className="mv-fortnight" aria-label="The last thirty days">
      <canvas ref={ref} className="mv-fortnight-canvas" role="img" aria-label={line} onMouseMove={pick} onMouseLeave={() => setPicked(null)} onClick={pick} />
      <div className="mv-band-labels"><span>{shortDay(strip.from)}</span><span>{tomorrow ? 'Tomorrow' : 'Today'}</span></div>
      <div className="mv-fortnight-foot">
        <figcaption className="mv-sub">{line}</figcaption>
        <div className="mv-seg" role="group" aria-label="View as">
          <button type="button" aria-pressed={view === 'columns'} onClick={() => choose('columns')}>Columns</button>
          <button type="button" aria-pressed={view === 'wave'} onClick={() => choose('wave')}>Wave</button>
        </div>
      </div>
    </figure>
  );
}
