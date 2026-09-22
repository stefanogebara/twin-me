/**
 * The term, as weeks (2026-09-21).
 *
 * A term is not flat: a week with fifteen classes and a week with one are different weeks,
 * and until now nothing in the product said so. One bar a week, four back and four ahead,
 * from the day counts the diary keeps. A week nothing was read for is a gap, never a zero.
 *
 * Tapping a week says what it holds. Nothing here is phrased that the server did not count.
 */
import { useState } from 'react';
import type { MoneyTerm, MoneyTermWeek } from '../../../../services/api/moneyAPI';

type T = (s: string, holes?: Record<string, string | number>) => string;

const dayMonth = (iso: string, locale: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
/* Nine labels with a month in them collide at 402px, so the phone gets the day alone and
   the line under the strip names the month when a week is tapped (2026-09-22). */
const dayOnly = (iso: string) => String(Number(iso.slice(8, 10)));

/** How many events, in words that read right at one. */
const events = (n: number, t: T) => (n === 1 ? t('{n} class or event', { n: 1 }) : t('{n} classes and events', { n }));

/** The one grey line: the week ahead against this one, or the stretch that has been read. */
export function termLine(term: MoneyTerm, t: T): string {
  const here = term.this_week; const next = term.next_week;
  if (here && next && here.events !== null && next.events !== null && here.events !== next.events) {
    return t('Next week the diary holds {n}, against {m} this week.', { n: events(next.events, t), m: here.events });
  }
  const seen = term.weeks.filter((w) => w.known);
  return t('{n} weeks of your calendar, read and counted.', { n: seen.length });
}

/* The tallest bar, in pixels. A percentage would not resolve: the bar sits in a grid row
   the content sizes, so `height: 60%` fell back to the 3px minimum and every week drew
   flat (2026-09-22). */
const BAR_MAX = 104;

export default function TermStrip({ term, t, locale }: { term: MoneyTerm; t: T; locale: string }) {
  const [picked, setPicked] = useState<MoneyTermWeek | null>(null);
  const top = Math.max(1, ...term.weeks.map((w) => w.events || 0));
  return (
    <section className="mv-section" id="term">
      <h2>{t('The term.')}</h2>
      <p className="mv-sub">{termLine(term, t)}</p>
      <div className="mv-term" role="group" aria-label={t('The term.')}>
        {term.weeks.map((w) => (
          <button
            key={w.start}
            type="button"
            className={`mv-term-week${w.current ? ' is-now' : ''}${w.known ? '' : ' is-unread'}${picked?.start === w.start ? ' is-picked' : ''}`}
            onClick={() => setPicked(picked?.start === w.start ? null : w)}
            aria-pressed={picked?.start === w.start}
            aria-label={w.known ? t('Week of {day}, {n}', { day: dayMonth(w.start, locale), n: events(w.events ?? 0, t) }) : t('Week of {day}, not read', { day: dayMonth(w.start, locale) })}
          >
            <b>{w.known ? w.events : ''}</b>
            <i style={{ height: w.known ? Math.max(3, Math.round(((w.events || 0) / top) * BAR_MAX)) : 3 }} />
            <em><span className="mv-term-wide">{dayMonth(w.start, locale)}</span><span className="mv-term-narrow">{dayOnly(w.start)}</span></em>
          </button>
        ))}
      </div>
      <p className="mv-term-foot">
        {picked
          ? (picked.known
            ? t('{a} to {b}: {n} in the diary.', { a: dayMonth(picked.start, locale), b: dayMonth(picked.end, locale), n: events(picked.events ?? 0, t) })
            : t('{a} to {b}: outside what the diary has been read for.', { a: dayMonth(picked.start, locale), b: dayMonth(picked.end, locale) }))
          : t('Events a week, from your calendar. Tap a week.')}
      </p>
    </section>
  );
}
