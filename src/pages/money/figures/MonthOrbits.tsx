/**
 * The month as orbits.
 *
 * The orb engine's working state, laid flat into a month: one tilted ring per kind of place,
 * biggest outermost, and on each ring a mark for every payment, at the hour it left. The
 * month runs clockwise and today is at the front, nearest the viewer, with one ember line
 * marking it; the charges still to come are hollow marks further round. It settles once and
 * then holds still. Tapping a ring names the kind and lists what went to it; tapping a mark
 * names the payment. Chosen on 2026-09-16 over the constellation it replaces.
 *
 * Colours are read from the register by the canvas (orbColors); nothing is written in.
 */
import { useEffect, useRef, useState } from 'react';
import { paletteOf, rgba, lerp, signatureFor, type Rgb } from './orbColors';
import TotalRow from './TotalRow';
import { angleOf, keyFor, kindsByMerchant, kindsOf, markRadius, ringKeyOf, ringsOf, type Kind, type Ring } from './orbitsGeometry';
import { GROUND_BY_KIND } from '../carvedKinds';
import { euro, type MoneyCategoryGroup, type MoneyRecurring, type MoneyTransaction } from '../../../services/api/moneyAPI';
import { useLocale, useT } from '@/lib/i18n';

type Mark = {
  ring: Ring; day: number; amount: number; ahead: boolean;
  row: MoneyTransaction | null; due: { name: string; amount: number; on: string } | null;
};
type Pick = { kind: Kind } | { mark: Mark } | null;

const TILT = 0.42;
const DUR = 1900;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Props = {
  groups: MoneyCategoryGroup[]; rows: MoneyTransaction[]; recurring: MoneyRecurring[];
  today: number; daysInMonth: number; monthKey: string; label: string;
};

export default function MonthOrbits({ groups, rows, recurring, today, daysInMonth, monthKey, label }: Props) {
  const t = useT();
  const locale = useLocale();
  const wrap = useRef<HTMLElement | null>(null);
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [pick, setPick] = useState<Pick>(null);
  const marksRef = useRef<{ x: number; y: number; r: number; z: number; mark: Mark }[]>([]);
  const ringsRef = useRef<Ring[]>([]);
  const drawRef = useRef<(tt: number) => void>(() => undefined);
  const live = useRef<{ t: number; hover: Mark | null; pick: Pick }>({ t: DUR, hover: null, pick: null });
  const H = width ? Math.round((width / 2 - 14) * 2 * TILT + 76) : 320;

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
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const kinds = kindsOf(groups);
    const byMerchant = kindsByMerchant(groups);
    const rMax = W / 2 - 14;
    const rings = ringsOf(kinds, rMax, rMax * 0.32);
    ringsRef.current = rings;
    const ringOf = new Map(rings.map((r) => [r.kind.key, r]));
    const cx = W / 2, cy = H / 2 + 2;

    const out = rows.filter((r) => Number(r.amount) < 0);
    const maxAmount = Math.max(1, ...out.map((r) => Math.abs(Number(r.amount))));
    const marks: Mark[] = [];
    for (const r of out) {
      const ring = ringOf.get(ringKeyOf(r, kinds, byMerchant));
      if (!ring) continue;
      const when = new Date(r.occurred_at);
      marks.push({ ring, day: when.getUTCDate() + when.getUTCHours() / 24 - 0.5, amount: Math.abs(Number(r.amount)), ahead: false, row: r, due: null });
    }
    /* What has not been charged yet, hollow, where it will land. */
    const monthEnd = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`;
    for (const c of recurring) {
      const on = c.next_expected;
      if (!on || on <= `${monthKey}-${String(today).padStart(2, '0')}` || on > monthEnd) continue;
      const ring = ringOf.get(keyFor(null, kinds));
      if (!ring) continue;
      marks.push({ ring, day: Number(on.slice(8)), amount: Number(c.typical_amount) || 0, ahead: true, row: null, due: { name: c.merchant_name || c.merchant_key, amount: Number(c.typical_amount) || 0, on } });
    }

    const colourOf = (kind: Kind): Rgb => {
      if (kind.key === 'rest') return pal.ink2;
      if (kind.key === 'not read yet') return pal.mark;
      const sig = signatureFor(kind.key, GROUND_BY_KIND);
      return (sig && pal[sig]) || pal.ink2;
    };
    const at = (R: number, a: number): [number, number, number] => [cx + R * Math.cos(a), cy + R * Math.sin(a) * TILT, Math.sin(a)];

    const centre = (fade: number) => {
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(pal.ink, fade);
      ctx.font = `300 ${Math.round(Math.min(44, rMax * 0.32 * 0.34))}px Geist, sans-serif`;
      ctx.fillText(String(today), cx, cy + 4);
      ctx.fillStyle = rgba(pal.quiet, fade);
      ctx.font = '350 13px Geist, sans-serif';
      ctx.fillText(t('{n} days to go', { n: Math.max(0, daysInMonth - today) }), cx, cy + 24);
      /* Today, at the front: the one line that says where in the month you are standing. */
      ctx.strokeStyle = rgba(pal.ember, 0.9 * fade); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy + 34); ctx.lineTo(cx, cy + rMax * TILT + 14); ctx.stroke();
    };

    const draw = (tt: number) => {
      live.current.t = tt;
      const chosen = live.current.pick, hover = live.current.hover;
      const focus = chosen && 'kind' in chosen ? chosen.kind.key : null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const fade = ease(tt / 600);
      const items: { z: number; paint: () => void }[] = [];
      marksRef.current = [];
      for (const ring of rings) {
        const dim = focus && focus !== ring.kind.key ? 0.3 : 1;
        const n = Math.max(8, Math.round((2 * Math.PI * ring.R) / 6));
        for (let i = 0; i < n; i += 1) {
          const [x, y, z] = at(ring.R, (i / n) * Math.PI * 2);
          items.push({ z, paint: () => {
            ctx.fillStyle = rgba(lerp(pal.ink, pal.page, 0.82 + 0.1 * ((1 - z) / 2)), fade * dim);
            ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill();
          } });
        }
      }
      for (const m of marks) {
        const p = ease((tt - 200 - rings.indexOf(m.ring) * 70) / 1300);
        const a = angleOf(1, today, daysInMonth) + (angleOf(m.day, today, daysInMonth) - angleOf(1, today, daysInMonth)) * p;
        const [x, y, z] = at(m.ring.R, a);
        const depth = (1 - z) / 2;
        const r = markRadius(m.amount, maxAmount, depth) * (0.4 + 0.6 * p);
        const col = colourOf(m.ring.kind);
        const dim = focus && focus !== m.ring.kind.key ? 0.2 : 1;
        items.push({ z: z + 0.001, paint: () => {
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          if (m.ahead) { ctx.strokeStyle = rgba(lerp(col, pal.page, depth * 0.4), dim); ctx.lineWidth = 1.2; ctx.stroke(); }
          else {
            ctx.fillStyle = rgba(lerp(col, pal.page, depth * 0.3), dim); ctx.fill();
            /* A hairline of the page around each mark: two payments an hour apart used to
               melt into one blob (2026-09-16). */
            ctx.strokeStyle = rgba(pal.page, dim); ctx.lineWidth = 1; ctx.stroke();
          }
          const on = hover === m || (chosen && 'mark' in chosen && chosen.mark === m);
          if (on) { ctx.strokeStyle = rgba(pal.ink, 1); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.stroke(); }
        } });
        if (p >= 1) marksRef.current.push({ x, y, r: Math.max(6, r + 3), z, mark: m });
      }
      items.sort((a, b) => a.z - b.z);
      let centred = false;
      for (const it of items) {
        if (!centred && it.z > 0) { centre(fade); centred = true; }
        it.paint();
      }
      if (!centred) centre(fade);
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
  }, [groups, rows, recurring, width, H, today, daysInMonth, monthKey, t]);

  function hitAt(e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>): Pick {
    const b = e.currentTarget.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    let best: { z: number; mark: Mark } | null = null;
    for (const h of marksRef.current) {
      if (Math.hypot(h.x - x, h.y - y) <= h.r && (!best || h.z > best.z)) best = { z: h.z, mark: h.mark };
    }
    if (best) return { mark: best.mark };
    const W = width, cx = W / 2, cy = H / 2 + 2;
    let ring: Ring | null = null, near = Infinity;
    for (const r of ringsRef.current) {
      const d = Math.abs(Math.hypot((x - cx) / r.R, (y - cy) / (r.R * TILT)) - 1) * r.R * TILT;
      if (d < 7 && d < near) { ring = r; near = d; }
    }
    return ring ? { kind: ring.kind } : null;
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const h = hitAt(e);
    e.currentTarget.style.cursor = h ? 'pointer' : 'default';
    const mark = h && 'mark' in h ? h.mark : null;
    if (mark !== live.current.hover) { live.current.hover = mark; drawRef.current(live.current.t); }
  }
  function onLeave() { if (live.current.hover) { live.current.hover = null; drawRef.current(live.current.t); } }
  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const h = hitAt(e);
    const same = h && pick && (('mark' in h && 'mark' in pick && h.mark === pick.mark) || ('kind' in h && 'kind' in pick && h.kind.key === pick.kind.key));
    const next: Pick = !h || same ? null : h;
    live.current.pick = next; setPick(next); drawRef.current(live.current.t);
  }

  const kinds = kindsOf(groups);
  const byMerchant = kindsByMerchant(groups);
  const total = kinds.reduce((s, k) => s + k.spent, 0);
  const dayName = (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' });
  const kindName = (k: Kind) => (k.key === 'rest' ? t('The rest') : cap(t(k.key)));

  /* No caption until a ring or a mark is tapped: the instruction read as gibberish in text (2026-09-21). */
  let caption = '';
  let list: { key: string; title: string; sub?: string; amount: number }[] = [];
  let listTotal = 0;
  if (pick && 'kind' in pick) {
    const k = pick.kind;
    caption = t(k.lines === 1 ? '{name}: {amount}, one payment, {share}% of the month.' : '{name}: {amount}, {n} payments, {share}% of the month.',
      { name: kindName(k), amount: euro(k.spent), n: k.lines, share: total > 0 ? Math.round((k.spent / total) * 100) : 0 });
    list = rows
      .filter((r) => Number(r.amount) < 0 && ringKeyOf(r, kinds, byMerchant) === k.key)
      .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
      .slice(0, 12)
      .map((r) => ({ key: r.id, title: r.merchant_name || r.merchant_raw || t('Unknown'), sub: dayName(r.occurred_at), amount: Math.abs(Number(r.amount)) }));
    listTotal = k.spent;
  } else if (pick && 'mark' in pick) {
    const m = pick.mark;
    if (m.due) caption = t('{name}, {amount}, due around {day}.', { name: m.due.name, amount: euro(m.due.amount), day: dayName(`${m.due.on}T12:00:00Z`) });
    else if (m.row) {
      caption = t('{name}, {amount}, {day}, {kind}.', {
        name: m.row.merchant_name || m.row.merchant_raw || t('Unknown'),
        amount: euro(Math.abs(Number(m.row.amount))), day: dayName(m.row.occurred_at),
        kind: m.row.category ? t(m.row.category) : t('not read yet'),
      });
    }
  }

  return (
    <figure className="mv-orbits" ref={(el) => { wrap.current = el; }}>
      <canvas ref={ref} role="img" aria-label={label} style={{ width: '100%', height: H }} onPointerMove={onMove} onPointerLeave={onLeave} onClick={onClick} />
      {caption ? <figcaption className="mv-sub" aria-live="polite">{caption}</figcaption> : null}
      {list.length ? (
        <ul className="mv-list mv-fig-rows">
          {list.map((r) => (
            <li key={r.key} className="mv-item mv-item--tight">
              <span className="mv-item-text">
                <span className="mv-item-title">{r.title}</span>
                {r.sub ? <span className="mv-item-sub">{r.sub}</span> : null}
              </span>
              <span className="mv-item-end mv-figures">{euro(r.amount)}</span>
            </li>
          ))}
          <TotalRow count={list.length} total={listTotal} />
        </ul>
      ) : null}
    </figure>
  );
}
