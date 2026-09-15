/**
 * The month as a constellation.
 *
 * The orb engine's connecting state, the web, with the month on it: a hollow hub for each
 * kind of place, in the signature its tile carries in the list below, and a dot around it
 * for every shop or person paid, as big as the money. The biggest kinds sit nearest the
 * middle. It settles once when the page opens and then holds still: nothing on the page
 * moves unless the pointer is on it (Stefano, 2026-09-15, of the turning planet it
 * replaces: "the everlasting shining orb"). Tapping a hub names the kind and lists who
 * took it; tapping a dot names the payee and lists its payments; both lists end in the
 * total. Chosen over orbits, stream, pool and tiles on 2026-09-16.
 *
 * Colours are read from the register by the canvas (orbColors); nothing is written in.
 */
import { useEffect, useRef, useState } from 'react';
import { paletteOf, rgba, signatureFor, type Rgb } from './orbColors';
import TotalRow from './TotalRow';
import { GROUND_BY_KIND } from '../carvedKinds';
import { euro, type MoneyCategoryGroup, type MoneyTransaction } from '../../../services/api/moneyAPI';
import { useLocale, useT } from '@/lib/i18n';

import { layout, payeesOf, type Payee, type StarNode } from './constellationLayout';

type Pick = { g: MoneyCategoryGroup; m: Payee | null } | null;

const DUR = 1800;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Props = { groups: MoneyCategoryGroup[]; rows: MoneyTransaction[]; label: string };

export default function MonthConstellation({ groups, rows, label }: Props) {
  const t = useT();
  const locale = useLocale();
  const wrap = useRef<HTMLElement | null>(null);
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [pick, setPick] = useState<Pick>(null);
  const nodesRef = useRef<StarNode[]>([]);
  const drawRef = useRef<(tt: number) => void>(() => undefined);
  const live = useRef<{ t: number; hover: StarNode | null; pick: Pick }>({ t: DUR, hover: null, pick: null });
  const H = width && width < 600 ? 380 : 440;

  /* The figure is as wide as the column; it lays itself out again only when that changes
     by more than a little, so a scrollbar appearing does not replay the entrance. */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const measure = (w: number) => setWidth((old) => (Math.abs(w - old) > 40 ? Math.round(w) : old));
    measure(el.clientWidth || 820);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => { const e = entries[0]; if (e) measure(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const W = width, dpr = Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const pal = paletteOf(canvas);
    const nodes = layout(groups, W, H);
    nodesRef.current = nodes;
    const cx = W / 2, cy = H / 2 - 6;
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colourOf = (g: MoneyCategoryGroup): Rgb => {
      if (!g.known) return pal.mark;
      const sig = signatureFor(g.category, GROUND_BY_KIND);
      return (sig && pal[sig]) || pal.ink2;
    };
    const pos = (n: StarNode, tt: number): [number, number, number] => { const p = ease((tt - n.rank * 70) / 1100); return [cx + (n.x - cx) * p, cy + (n.y - cy) * p, p]; };
    const draw = (tt: number) => {
      live.current.t = tt;
      const focus = live.current.pick ? live.current.pick.g : null, chosen = live.current.pick ? live.current.pick.m : null, hover = live.current.hover;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      for (const n of nodes) {
        if (!n.parent) continue;
        const [x, y, p] = pos(n, tt), [hx, hy] = pos(n.parent, tt), on = !focus || focus === n.g;
        ctx.strokeStyle = rgba(pal.ink, (on ? (focus ? 0.45 : 0.16) : 0.05) * p); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(x, y); ctx.stroke();
      }
      for (const n of nodes) {
        const [x, y, p] = pos(n, tt), col = colourOf(n.g), on = !focus || focus === n.g, al = (on ? 1 : 0.2) * Math.min(1, p * 1.5);
        ctx.beginPath(); ctx.arc(x, y, n.r * (0.5 + 0.5 * p), 0, Math.PI * 2);
        if (n.hub) { ctx.fillStyle = rgba(pal.page, 1); ctx.fill(); ctx.strokeStyle = rgba(col, al); ctx.lineWidth = 1.5; ctx.stroke(); }
        else { ctx.fillStyle = rgba(col, al); ctx.fill(); }
        if (hover === n || (chosen && chosen === n.m)) { ctx.strokeStyle = rgba(pal.ink, 1); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, n.r + 4, 0, Math.PI * 2); ctx.stroke(); }
      }
      /* The names of the big kinds, and of the one asked about, on a halo of the page so a
         dot never cuts through a word. */
      ctx.textAlign = 'center'; ctx.font = '350 13px Geist, sans-serif'; ctx.lineJoin = 'round';
      for (const n of nodes) {
        if (!n.hub || !(n.g.share >= 5 || focus === n.g)) continue;
        const [x, y, p] = pos(n, tt), word = cap(t(n.g.category)), ly = y + n.r + 17;
        ctx.lineWidth = 4; ctx.strokeStyle = rgba(pal.page, p); ctx.strokeText(word, x, ly);
        ctx.fillStyle = rgba(pal.quiet, (focus && focus !== n.g ? 0.3 : 1) * p); ctx.fillText(word, x, ly);
      }
    };
    drawRef.current = draw;
    let raf = 0, running = true;
    const start = () => {
      const t0 = performance.now();
      const tick = (now: number) => { if (!running) return; const tt = still ? DUR : Math.min(DUR, now - t0); draw(tt); if (tt < DUR) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    };
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) void document.fonts.ready.then(start); else start();
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [groups, width, H, t]);

  function hitAt(e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>): StarNode | null {
    const b = e.currentTarget.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    let best: StarNode | null = null, bd = Infinity;
    for (const n of nodesRef.current) { const d = Math.hypot(n.x - x, n.y - y) - n.r; if (d < 5 && d < bd) { best = n; bd = d; } }
    return best;
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const h = hitAt(e);
    e.currentTarget.style.cursor = h ? 'pointer' : 'default';
    if (h !== live.current.hover) { live.current.hover = h; drawRef.current(live.current.t); }
  }
  function onLeave() { if (live.current.hover) { live.current.hover = null; drawRef.current(live.current.t); } }
  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const h = hitAt(e);
    let next: Pick = null;
    if (h && h.hub) next = pick && pick.g === h.g && !pick.m ? null : { g: h.g, m: null };
    else if (h) next = pick && pick.m === h.m ? null : { g: h.g, m: h.m };
    live.current.pick = next; setPick(next); drawRef.current(live.current.t);
  }

  const kindName = (g: MoneyCategoryGroup) => cap(t(g.category));
  const payeeName = (m: Payee) => (m.rest ? t('Everyone else') : m.name);
  const paidTo = (m: Payee) => rows.filter((r) => Number(r.amount) < 0 && ((m.merchant_key && r.merchant_key === m.merchant_key) || (r.merchant_name || r.merchant_raw || '').toLowerCase() === m.name.toLowerCase()));

  let caption = t('Everyone you paid this month, around the kind of place. Tap one.');
  let list: { key: string; title: string; amount: number }[] = [];
  let total = 0;
  let noun: 'payments' | 'places' = 'payments';
  if (pick && !pick.m) {
    const g = pick.g;
    caption = t(g.lines === 1 ? '{name}: {amount}, one payment, {share}% of the month.' : '{name}: {amount}, {n} payments, {share}% of the month.', { name: kindName(g), amount: euro(g.spent), n: g.lines, share: g.share });
    list = payeesOf(g).map((m) => ({ key: m.merchant_key || m.name, title: payeeName(m), amount: m.spent }));
    total = g.spent; noun = 'places';
  } else if (pick && pick.m) {
    const m = pick.m, paid = m.rest ? [] : paidTo(m);
    caption = paid.length > 1
      ? t('{name}, {amount}, {n} payments, {kind}.', { name: payeeName(m), amount: euro(m.spent), n: paid.length, kind: t(pick.g.category) })
      : t('{name}, {amount}, {kind}.', { name: payeeName(m), amount: euro(m.spent), kind: t(pick.g.category) });
    if (paid.length > 1) {
      list = paid.map((r) => ({ key: r.id, title: new Date(r.occurred_at).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' }), amount: Math.abs(Number(r.amount)) }));
      total = m.spent;
    }
  }

  return (
    <figure className="mv-constellation" ref={(el) => { wrap.current = el; }}>
      <canvas ref={ref} role="img" aria-label={label} style={{ width: '100%', height: H }} onPointerMove={onMove} onPointerLeave={onLeave} onClick={onClick} />
      <figcaption className="mv-sub" aria-live="polite">{caption}</figcaption>
      {list.length ? (
        <ul className="mv-list mv-fig-rows">
          {list.map((r) => (
            <li key={r.key} className="mv-item mv-item--tight">
              <span className="mv-item-text"><span className="mv-item-title">{r.title}</span></span>
              <span className="mv-item-end mv-figures">{euro(r.amount)}</span>
            </li>
          ))}
          <TotalRow count={list.length} total={total} noun={noun} />
        </ul>
      ) : null}
    </figure>
  );
}
