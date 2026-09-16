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
import { euro, shortDay, type MoneyDayStrip, type MoneyForecast, type MoneyTransaction } from '../../../services/api/moneyAPI';
import TotalRow from './TotalRow';
import { useLocale, useT } from '@/lib/i18n';
import { paletteOf, rgba } from './orbColors';
import { localDay } from '../readingWords';

type View = 'columns' | 'wave';
const KEY = 'mv-fortnight-view';
const DOT = 5;
const UNIT = 10;

export default function Fortnight({ strip, tomorrow, ledger = [] }: { strip: MoneyDayStrip; tomorrow: MoneyForecast['tomorrow']; ledger?: MoneyTransaction[] }) {
  const t = useT();
  const locale = useLocale();
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem(KEY) as View) || 'columns'; } catch { return 'columns'; } });
  const [picked, setPicked] = useState<string | null>(null);
  /* A tap keeps a day open under the strip; the pointer only previews one. */
  const [opened, setOpened] = useState<string | null>(null);
  const lit = picked || opened;
  /* What the pointer is doing lives in a ref as well as in state: the drawing reads the ref
     and is repainted, never rebuilt. Before this, moving the mouse across the strip re-ran
     the whole effect, which reset the clock and replayed the entrance under the pointer, so
     the columns kept jumping and a click rarely landed (Stefano, 2026-09-16). */
  const litRef = useRef<string | null>(null);
  const repaint = useRef<() => void>(() => undefined);
  litRef.current = lit;
  const days = strip.days;
  const n = days.length + (tomorrow ? 1 : 0);

  function choose(v: View) { setView(v); try { localStorage.setItem(KEY, v); } catch { /* a preference, not a fact */ } }

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.clientWidth || 780, H = 200;
    const dpr = Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
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
          ctx.beginPath(); ctx.arc(x, y, 1.2 + sw * 1.6, 0, Math.PI * 2); if (ahead) { ctx.strokeStyle = rgba(pal.quiet, 1); ctx.lineWidth = 1; ctx.stroke(); } else ctx.fill();
        }
      } else {
        for (let i = 0; i < n; i += 1) {
          const v = value(i); const dots = Math.min(Math.floor((H - 40) / DOT), Math.round(v / UNIT)); const ahead = i >= days.length; const today = !ahead && days[i].today; const miss = !ahead && days[i].hit === false;
          const arrive = still ? 1 : Math.min(1, Math.max(0, (since - i * 0.03) / 0.5)); const x = colX(i);
          for (let k = 0; k < Math.round(dots * arrive); k += 1) {
            const y = H - 26 - k * DOT; ctx.beginPath(); ctx.arc(x, y, DOT / 2 - 0.2, 0, Math.PI * 2);
            if (ahead) { ctx.strokeStyle = rgba(pal.quiet, 1); ctx.lineWidth = 1; ctx.stroke(); }
            else { ctx.fillStyle = today ? rgba(pal.ember, 1) : miss ? rgba(pal.danger, 0.9) : rgba(pal.ink, litRef.current && litRef.current !== days[i].day ? 0.45 : 1); ctx.fill(); }
          }
          /* A day ahead and a day with nothing on it are marks a person reads, so they clear 3:1:
             at 0.45 and 0.6 of ink-3 they measured under 2:1 (2026-09-16). */
          if (dots === 0) { ctx.fillStyle = rgba(pal.mark, 1); ctx.beginPath(); ctx.arc(x, H - 26, 1.2, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      if (running && (!still || view === 'columns') && since < 3) raf = requestAnimationFrame(draw); else if (running && !still && view === 'wave') raf = requestAnimationFrame(draw);
    };
    repaint.current = () => draw(performance.now());
    raf = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [strip, tomorrow, view, n]);

  const biggest = days.reduce((m, d) => (d.total > (m?.total ?? 0) ? d : m), null as MoneyDayStrip['days'][number] | null);
  const day = lit ? days.find((d) => d.day === lit) : null;
  const dayRows = opened ? ledger.filter((r) => localDay(r.occurred_at) === opened && Number(r.amount) < 0) : [];
  const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const line = day
    ? `${t(day.today ? '{day}, so far: {amount}' : '{day}: {amount}', { day: dayName(day.day), amount: euro(day.total) })}${day.count ? `, ${day.count === 1 ? t('{n} payment', { n: 1 }) : t('{n} payments', { n: day.count })}` : ''}${day.said ? `. ${t('It said {low} to {high}, and {verdict}.', { low: euro(day.said.low), high: euro(day.said.high), verdict: day.hit ? t('held') : t('broke') })}` : '.'}`
    : [
      t('{amount} over the last {n} days, on {k} of them.', { amount: euro(strip.total), n: days.length - 1, k: strip.days_with_spend }),
      biggest && biggest.total > 0 ? t('The {day} was the biggest, {amount}.', { day: dayName(biggest.day), amount: euro(biggest.total) }) : '',
      tomorrow ? (tomorrow.value > 0 ? t('Tomorrow: usually {amount}, up to {high}.', { amount: euro(tomorrow.value), high: euro(tomorrow.high) }) : t('Tomorrow is usually quiet, up to {high}.', { high: euro(tomorrow.high) })) : '',
    ].filter(Boolean).join(' ');

  /* The day under the pointer, from its column; the caption says it. */
  function pick(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect(); const u = (e.clientX - r.left - 14) / Math.max(1, r.width - 28);
    const i = Math.round(Math.max(0, Math.min(1, u)) * (n - 1));
    const day = i < days.length ? days[i].day : null;
    if (day !== litRef.current) { litRef.current = day || opened; setPicked(day); repaint.current(); }
  }
  function openAt(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect(); const u = (e.clientX - r.left - 14) / Math.max(1, r.width - 28);
    const i = Math.round(Math.max(0, Math.min(1, u)) * (n - 1));
    const d = i < days.length ? days[i].day : null;
    setOpened((o) => { const next = d && o !== d ? d : null; litRef.current = next; return next; });
    repaint.current();
  }

  /* The same days by keyboard: a day is a thing to open, so the drawing takes focus and the
     arrows walk it. Pointer only, the strip was unusable without a mouse (2026-09-16). */
  function step(by: number) {
    const at = days.findIndex((d) => d.day === (opened || litRef.current));
    const i = Math.max(0, Math.min(days.length - 1, (at === -1 ? days.length - 1 : at) + by));
    const day = days[i].day;
    litRef.current = day; setPicked(day); repaint.current();
  }
  function onKey(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const day = picked || litRef.current;
      if (!day) return;
      setOpened((o) => { const next = o === day ? null : day; litRef.current = next || day; return next; });
      repaint.current();
    }
  }

  return (
    <figure className="mv-fortnight" aria-label={t('The last thirty days')}>
      <canvas ref={ref} className="mv-fortnight-canvas" role="button" tabIndex={0} aria-label={line} onKeyDown={onKey} onMouseMove={pick} onMouseLeave={() => { setPicked(null); litRef.current = opened; repaint.current(); }} onClick={openAt} />
      <div className="mv-band-labels"><span>{shortDay(strip.from, locale)}</span><span>{tomorrow ? t('Tomorrow') : t('Today')}</span></div>
      <div className="mv-fortnight-foot">
        <figcaption className="mv-sub">{line}</figcaption>
        <div className="mv-seg" role="group" aria-label={t('View as')}>
          <button type="button" aria-pressed={view === 'columns'} onClick={() => choose('columns')}>{t('Columns')}</button>
          <button type="button" aria-pressed={view === 'wave'} onClick={() => choose('wave')}>{t('Wave')}</button>
        </div>
      </div>
      {opened && dayRows.length ? (
        <ul className="mv-list mv-fig-rows" aria-label={t("That day's payments")}>
          {dayRows.map((r) => (
            <li key={r.id} className="mv-item mv-item--tight">
              <span className="mv-item-text"><span className="mv-item-title">{r.merchant_name || r.merchant_raw || t('Unknown')}</span></span>
              <span className="mv-item-end mv-figures">{euro(Math.abs(Number(r.amount)))}</span>
            </li>
          ))}
          <TotalRow count={dayRows.length} total={dayRows.reduce((s, r) => s + Math.abs(Number(r.amount)), 0)} />
        </ul>
      ) : null}
    </figure>
  );
}
