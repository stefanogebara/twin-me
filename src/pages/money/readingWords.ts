/**
 * A reading, said in the reader's own language.
 *
 * The ledger computes its readings on a schedule and keeps the English sentence it wrote,
 * because that sentence is what the twin reads and what its memory is embedded from. The
 * page has the same numbers, so it says the line itself (2026-09-16). This is the pattern
 * the plan's line already follows: the server keeps its prose, the screen composes its own.
 *
 * Every kind falls back to the stored sentence when a number it needs is missing, so a
 * reading written before a field existed still reads, in English, rather than breaking.
 */
import { euro } from '../../services/api/moneyAPI';

type T = (s: string, vars?: Record<string, string | number>) => string;
type Numbers = Record<string, unknown>;
/** What a reading needs to be said again; both the stored readings and the usage findings fit. */
export type Sayable = {
  kind: string;
  numbers?: Numbers | Record<string, unknown> | null;
  month?: string | null;
  evidence_count?: number;
  sentence: string;
  detail?: string | null;
  /* Only the name and the day are read from a receipt here, so a pattern's shorter row fits. */
  receipts?: { id: string; occurred_at: string; merchant_raw?: string | null; merchant_key?: string | null }[];
};

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/* --------------------------------------------------------------------- words for numbers */

/** The day of a month, said as that language says it. */
export function ordinal(t: T, day: number): string {
  if (day % 10 === 1 && day !== 11) return t('{n}st', { n: day });
  if (day % 10 === 2 && day !== 12) return t('{n}nd', { n: day });
  if (day % 10 === 3 && day !== 13) return t('{n}rd', { n: day });
  return t('{n}th', { n: day });
}

/** A weekday by its index, 0 Sunday, in the reader's own calendar. */
export function weekdayName(index: number, locale: string): string {
  /* 2026-09-13 was a Sunday, so the index falls straight onto the date. */
  const d = new Date(Date.UTC(2026, 8, 13 + (((index % 7) + 7) % 7)));
  return d.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
}

/** A month from a YYYY-MM or a full date. */
export function monthName(ym: string | null | undefined, locale: string, shift = 0): string {
  if (!ym) return '';
  const d = new Date(`${String(ym).slice(0, 7)}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCMonth(d.getUTCMonth() + shift);
  return d.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });
}

/**
 * Today, where the person is reading. `toISOString` is UTC, so in Spain everything between
 * midnight and two in the morning called today yesterday (2026-09-16); the browser's own
 * zone is the right answer here, and en-CA is the shape every key in the ledger has.
 */
export const todayHere = (now = new Date()) => now.toLocaleDateString('en-CA');

/** The day a payment falls on where the person is, from its instant. */
export const localDay = (at: string | Date) => {
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
};

/** A day coming: today, tomorrow, the weekday it falls on, or its date. */
export function dayAhead(iso: string, t: T, locale: string, now = new Date()): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(iso);
  const days = Math.round((d.getTime() - new Date(`${todayHere(now)}T12:00:00Z`).getTime()) / 86400000);
  if (days <= 0) return t('today');
  if (days === 1) return t('tomorrow');
  if (days < 7) return weekdayName(d.getUTCDay(), locale);
  return t('the {day}', { day: ordinal(t, d.getUTCDate()) });
}

/** A day gone: today, yesterday, the weekday it was, or its date. */
export function dayBehind(iso: string, t: T, locale: string, now = new Date()): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(iso);
  const days = Math.round((new Date(`${todayHere(now)}T12:00:00Z`).getTime() - d.getTime()) / 86400000);
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 7) return weekdayName(d.getUTCDay(), locale);
  return t('the {day}', { day: ordinal(t, d.getUTCDate()) });
}

/** A day and its month, for a first sighting. */
const dayAndMonth = (iso: string, locale: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });
};

/** Names read as a person reads them: two with an and, more with commas and an and. */
export function listOf(t: T, names: string[]): string {
  const xs = names.filter(Boolean);
  if (xs.length <= 1) return xs[0] || '';
  if (xs.length === 2) return t('{a} and {b}', { a: xs[0], b: xs[1] });
  return t('{a} and {b}', { a: xs.slice(0, -1).join(', '), b: xs[xs.length - 1] });
}

/* The product's word for a kind of place. A place the person named keeps their own word. */
const CATEGORY_WORD: Record<string, string> = {
  'eating out': 'Eating out', coffee: 'Coffee', groceries: 'Groceries', transport: 'Transport', taxi: 'Taxis',
  entertainment: 'Going out', clothing: 'Clothes', health: 'Health', pharmacy: 'Pharmacy', sport: 'Sport',
  software: 'Software', travel: 'Travel', education: 'Education', home: 'Home', electronics: 'Electronics',
  fuel: 'Fuel', lodging: 'Lodging', cash: 'Cash', fees: 'Fees', rent: 'Rent', bills: 'Bills', other: 'Other',
  advertising: 'Advertising',
};
/** The word for a kind of place, capitalised as a line's first word. */
export function categoryWord(t: T, category: string | null): string {
  if (!category) return t('Other');
  const word = CATEGORY_WORD[category];
  return word ? t(word) : category.charAt(0).toUpperCase() + category.slice(1);
}
/** The same word inside a sentence, where the language decides the case. */
export const categoryInline = (t: T, category: string | null) => categoryWord(t, category).toLocaleLowerCase();

const CADENCE_AMOUNT: Record<string, string> = {
  weekly: '{amount} a week', biweekly: '{amount} every two weeks', monthly: '{amount} a month',
  quarterly: '{amount} every three months', yearly: '{amount} a year',
};
const PLATFORM_LABEL: Record<string, string> = {
  spotify: 'Spotify', google_calendar: 'Calendar', youtube: 'YouTube', google_gmail: 'Gmail',
  discord: 'Discord', github: 'GitHub', whoop: 'Whoop', instagram: 'Instagram', outlook: 'Outlook',
};
/* Brand names stay as they are; the calendar is the one word of ours in the list. */
const platformLabel = (t: T, platform: string | null) => (platform === 'google_calendar' ? t('Calendar') : (platform ? PLATFORM_LABEL[platform] || platform : ''));

/* The three weeks the covariates know. They arrive as English phrases. */
const weekPhrase = (t: T, week: unknown) => (typeof week === 'string' && week ? t(week) : '');

/* ------------------------------------------------------------------ the day's own line */

/** What the allowance sends, beyond its number. */
export type Allowance = {
  amount: number | null; basis: 'balance' | 'income' | 'typical' | 'student_prior' | null; basis_label?: string | null;
  horizon?: { day: string | null; days: number; source: string | null } | null; balance?: { amount: number; banks: string[] } | null;
  base?: number | null; keep?: number | null; free: number | null; over: boolean; days_left: number | null;
  spent?: number | null; committed?: number | null; calendar_ahead?: number | null;
  shape?: { weekday: number; ratio: number } | null;
  sentence: string | null;
};

/**
 * The line under today's number, in the reader's own language: what the day's share rests
 * on, what has already gone, and why today is worth more or less than an even split. The
 * ledger keeps composing its English one for the twin; this says the same thing from the
 * same numbers.
 */
/* A bank is a name, not a phrase; the fallback stays outside the translator's reach. */
const FIRST_BANK = 'Santander';
const bankNames = (a: Allowance, t: T) => (a.balance?.banks || []).join(t(' and ')) || FIRST_BANK;

export function allowanceWords(a: Allowance, t: T, locale: string): string | null {
  if (!a || a.amount === null || a.days_left === null) return a?.sentence ?? null;
  const days = Math.max(1, a.horizon?.days ?? ((a.days_left || 0) + 1));
  const keep = a.keep ? t(', keeping {amount}', { amount: euro(a.keep) }) : '';
  const base = a.base ?? null;
  const basis = a.basis === 'balance' && base !== null
    ? t('the {amount} in {bank}', { amount: euro(base), bank: bankNames(a, t) }) + keep
    : a.basis === 'income' && base !== null
    ? t('the {amount} you said comes in', { amount: euro(base) }) + keep
    : a.basis === 'typical' && base !== null
      ? t('your usual month of {amount}', { amount: euro(base) }) + keep
      : a.basis === 'student_prior' && base !== null
        ? `${t(a.basis_label || 'a typical student month in Madrid on top of your rent')}, ${euro(base)}${keep}`
        : null;
  if (!basis) return a.sentence ?? null;

  const daysWord = days === 1 ? t('{n} day', { n: 1 }) : t('{n} days', { n: days });
  if (a.over) {
    return t('That is {amount} past {basis}, with {days} to go.', { amount: euro(Math.abs(a.free || 0)), basis, days: daysWord });
  }
  const spoken: string[] = [];
  /* With the balance, what has been spent is already gone from it and is not said again. */
  if (a.basis !== 'balance') spoken.push(t('{amount} spent', { amount: euro(a.spent || 0) }));
  if ((a.committed || 0) > 0) spoken.push(t('{amount} still to be charged', { amount: euro(a.committed || 0) }));
  if ((a.calendar_ahead || 0) > 0) spoken.push(t('{amount} the diary expects', { amount: euro(a.calendar_ahead || 0) }));
  const until = a.horizon?.day && a.horizon.source ? t('until {source} arrives', { source: a.horizon.source }) : daysWord;
  const line = spoken.length
    ? t('From {basis}, after {after}, over {days}.', { basis, after: spoken.join(t(' and ')), days: until })
    : t('From {basis}, over {days}.', { basis, days: until });
  /* Why today is not simply the month divided by its days. */
  if (!a.shape) return line;
  const weekday = weekdayName(a.shape.weekday, locale);
  return a.shape.ratio > 1
    ? `${line} ${t('{weekday} usually costs you more, so today has a bigger share.', { weekday })}`
    : `${line} ${t('{weekday} is usually quieter, so today has a smaller share.', { weekday })}`;
}

/* ------------------------------------------------------------------------------ the kinds */

type Said = { sentence: string; detail: string | null };

/**
 * One reading in the reader's language, or the stored English when this kind is not known
 * here or a number it needs is missing.
 */
export function readingWords(r: Sayable, t: T, locale: string, now = new Date()): Said {
  const keep: Said = { sentence: r.sentence, detail: r.detail ?? null };
  const num = (r.numbers || {}) as Numbers;
  const receipts = r.receipts || [];
  const nameFromReceipt = () => s(receipts[0]?.merchant_raw) || s(receipts[0]?.merchant_key);

  try {
    switch (r.kind) {
      case 'month_pace': {
        const spent = n(num.spent); const previous = n(num.previous_spent); const gap = n(num.gap); const day = n(num.day);
        if (spent === null || previous === null || gap === null || day === null || !r.month) return keep;
        const sentence = t('By the {day} you had spent {amount}. By the {day} of {month} it was {other}.', {
          day: ordinal(t, day), amount: euro(spent), month: monthName(r.month, locale, -1), other: euro(previous),
        });
        const detail = Math.abs(gap) < 1
          ? t('The two months are level.')
          : gap > 0 ? t('That is {amount} more.', { amount: euro(gap) }) : t('That is {amount} less.', { amount: euro(gap) });
        return { sentence, detail };
      }

      case 'subscriptions': {
        const count = n(num.count); const total = n(num.monthly_total);
        const names = Array.isArray(num.names) ? (num.names as string[]).filter(Boolean) : [];
        if (count === null || total === null) return keep;
        const sentence = t('{n} charges come back every month, {total} together.', { n: count, total: euro(total) });
        if (!names.length) return { sentence, detail: r.detail ?? null };
        const shown = names.slice(0, 3).join(', ');
        const rest = count - 3;
        return { sentence, detail: rest > 0 ? t('{names} and {n} more.', { names: shown, n: rest }) : `${shown}.` };
      }

      case 'small_payments': {
        const count = n(num.count); const total = n(num.total); const pct = n(num.share_percent); const threshold = n(num.threshold);
        if (count === null || total === null || pct === null || threshold === null) return keep;
        return {
          sentence: t('{n} payments under {threshold} this month, {total} together.', { n: count, threshold: euro(threshold), total: euro(total) }),
          detail: t('That is {pct}% of the month, in lines you would not remember.', { pct }),
        };
      }

      case 'biggest_line': {
        const amount = n(num.amount); const median = n(num.median); const days = n(num.days);
        const name = s(num.name) || nameFromReceipt();
        if (amount === null || median === null || days === null || !name) return keep;
        return {
          sentence: t('{name} at {amount} is the largest single payment in {days} days.', { name, amount: euro(amount), days }),
          detail: t('The middle payment in that window is {amount}.', { amount: euro(median) }),
        };
      }

      case 'weekday_shape': {
        const wd = n(num.weekday); const per = n(num.per_day); const other = n(num.other_per_day); const weeks = n(num.weeks);
        const payments = n(num.payments) ?? n(r.evidence_count); const times = n(num.n);
        if (wd === null || per === null || other === null) return keep;
        const sentence = t('{weekday} costs you {amount} against {other} on other days.', { weekday: weekdayName(wd, locale), amount: euro(per), other: euro(other) });
        if (weeks === null || payments === null || times === null) return { sentence, detail: r.detail ?? null };
        return { sentence, detail: t('Read from {weeks} weeks, {payments} payments and {n} such days.', { weeks, payments, n: times }) };
      }

      case 'new_merchant': {
        const places = n(num.new_merchants); const total = n(num.top_total); const count = n(num.top_count);
        const name = s(num.top_name) || nameFromReceipt();
        if (places === null || total === null || count === null || !name) return keep;
        const sentence = places === 1 ? t('{name} is new this month.', { name }) : t('{n} places are new this month.', { n: places });
        const detail = count === 1
          ? t('{name} has taken {amount} across {n} payment.', { name, amount: euro(total), n: count })
          : t('{name} has taken {amount} across {n} payments.', { name, amount: euro(total), n: count });
        return { sentence, detail };
      }

      case 'dormant_charge': {
        const days = n(num.days_since); const amount = n(num.typical_amount); const times = n(num.occurrences);
        const name = s(num.name) || nameFromReceipt();
        if (days === null || amount === null || times === null || !name) return keep;
        return {
          sentence: t('{name} came back every month and has not for {days} days.', { name, days }),
          detail: t('It was {amount} a time, {n} times.', { amount: euro(amount), n: times }),
        };
      }

      case 'category_shape': {
        const pct = n(num.share_percent); const spent = n(num.spent); const days = n(num.days);
        const placed = n(num.placed); const total = n(num.total);
        if (pct === null || spent === null || days === null || placed === null || total === null) return keep;
        return {
          sentence: t('{pct}% of what you have spent in {days} days went to {category}: {amount}.', {
            pct, days, category: categoryInline(t, s(num.category)), amount: euro(spent),
          }),
          detail: t('Read from {placed} of {total}, which is what has a kind of place behind it so far.', { placed: euro(placed), total: euro(total) }),
        };
      }

      case 'delta_category': {
        const current = n(num.current); const usual = n(num.usual); const count = n(num.count); const usualCount = n(num.usual_count);
        if (current === null || usual === null || count === null || usualCount === null) return keep;
        const sentence = t('{category}: {amount} this week, usually {usual}.', {
          category: categoryWord(t, s(num.category)), amount: euro(current), usual: euro(usual),
        });
        const base = count === 1
          ? t('{count} payment in seven days; usually {n}.', { count, n: Math.round(usualCount) })
          : t('{count} payments in seven days; usually {n}.', { count, n: Math.round(usualCount) });
        const week = weekPhrase(t, num.week);
        return { sentence, detail: week ? `${base} ${t('It was {week}.', { week })}` : base };
      }

      case 'delta_silence': {
        const days = n(num.days_since); const away = n(num.away_days); const gap = n(num.usual_gap_days);
        const times = n(num.times); const amount = n(num.typical_amount);
        const name = s(num.name);
        if (days === null || gap === null || !name) return keep;
        const rounded = Math.round(gap);
        const every = rounded === 1 ? t('every day') : t('every {n} days', { n: rounded });
        const sentence = away !== null && away >= 1
          ? t('No {name} in {days} days, {away} away not counted; usually {every}.', { name, days, away: Math.round(away), every })
          : t('No {name} in {days} days; usually {every}.', { name, days, every });
        const first = s(num.first_seen);
        if (times === null || amount === null || !first) return { sentence, detail: r.detail ?? null };
        return { sentence, detail: t('{n} times since {day}, about {amount} each.', { n: times, day: dayAndMonth(first, locale), amount: euro(amount) }) };
      }

      case 'delta_weekday': {
        const wd = n(num.weekday); const current = n(num.current); const usual = n(num.usual);
        if (wd === null || current === null || usual === null) return keep;
        const sentence = t('{weekday} cost {amount}; the six before, {usual} in the middle.', { weekday: weekdayName(wd, locale), amount: euro(current), usual: euro(usual) });
        const count = n(num.count) ?? receipts.length;
        if (!count) return { sentence, detail: t('Nothing paid that day.') };
        const names = receipts.map((x) => x.merchant_raw || x.merchant_key).filter(Boolean).slice(0, 3).join(', ');
        if (!names) return { sentence, detail: r.detail ?? null };
        return { sentence, detail: count === 1 ? t('{n} payment: {names}.', { n: count, names }) : t('{n} payments: {names}.', { n: count, names }) };
      }

      case 'delta_pace': {
        const current = n(num.current); const usual = n(num.usual);
        const count = n(num.count) ?? n(r.evidence_count);
        if (current === null || usual === null || count === null) return keep;
        const sentence = t('{amount} in the last seven days; a usual week of yours is {usual}.', { amount: euro(current), usual: euro(usual) });
        const base = count === 1 ? t('{n} payment, recurring charges left out.', { n: count }) : t('{n} payments, recurring charges left out.', { n: count });
        const week = weekPhrase(t, num.week);
        return { sentence, detail: week ? `${base} ${t('It was {week}.', { week })}` : base };
      }

      case 'cap_month': {
        const cap = n(num.cap); const spent = n(num.spent); const left = n(num.left); const count = n(num.count); const daysLeft = n(num.days_left);
        const raw = s(num.label);
        if (cap === null || spent === null || left === null || count === null || daysLeft === null || !raw) return keep;
        /* Their own word for it stands; only the product's word for a kind of place is ours to say. */
        const label = num.label_is_category === true ? categoryWord(t, s(num.subject)) : raw;
        const over = num.over === true || left < 0;
        const sentence = over
          ? t('{label}: {amount}, past the {cap} you said by {over}.', { label, amount: euro(spent), cap: euro(cap), over: euro(-left) })
          : daysLeft === 1
            ? t('{label}: {amount} of the {cap} you said, {n} day left.', { label, amount: euro(spent), cap: euro(cap), n: daysLeft })
            : t('{label}: {amount} of the {cap} you said, {n} days left.', { label, amount: euro(spent), cap: euro(cap), n: daysLeft });
        const detail = over
          ? (count === 1 ? t('{n} payment this month.', { n: count }) : t('{n} payments this month.', { n: count }))
          : daysLeft > 0
            ? t('That leaves {amount}, {perDay} a day.', { amount: euro(left), perDay: euro(Math.round((left / (daysLeft + 1)) * 100) / 100) })
            : t('That leaves {amount}.', { amount: euro(left) });
        return { sentence, detail };
      }

      case 'keep_month': {
        const keepAmount = n(num.keep); const income = n(num.income); const projected = n(num.projected);
        const ending = n(num.ending); const gap = n(num.gap);
        if (keepAmount === null || income === null || projected === null || ending === null || gap === null) return keep;
        const sentence = gap >= 0
          ? t('You wanted {keep} left; at this pace the month ends with {ending}.', { keep: euro(keepAmount), ending: euro(ending) })
          : t('You wanted {keep} left; at this pace the month ends with {ending}, {short} short.', { keep: euro(keepAmount), ending: euro(Math.max(0, ending)), short: euro(-gap) });
        return { sentence, detail: t('From {income} coming in and about {out} going out.', { income: euro(income), out: euro(projected) }) };
      }

      case 'charge_ahead': {
        const total = n(num.total); const left = n(num.left_before); const by = s(num.by);
        const items = Array.isArray(num.items) ? (num.items as { name?: string; amount?: number }[]) : [];
        if (total === null || left === null || !by) return keep;
        const sentence = t('{total} of charges land by {day}. That is more than the {left} left of your month.', {
          total: euro(total), day: dayAhead(by, t, locale, now), left: euro(Math.max(0, left)),
        });
        if (!items.length) return { sentence, detail: r.detail ?? null };
        const named = items.slice(0, 3).map((i) => `${i.name || t('A standing charge')} ${euro(i.amount || 0)}`).join(', ');
        const rest = items.length - 3;
        return { sentence, detail: rest > 0 ? t('{names} and {n} more.', { names: named, n: rest }) : `${named}.` };
      }

      case 'named_expense': {
        const amount = n(num.amount); const on = s(num.on); const name = s(num.name);
        if (amount === null || !on || !name) return keep;
        return { sentence: t('{name}, {amount}, leaves {day}.', { name, amount: euro(amount), day: dayAhead(on, t, locale, now) }), detail: null };
      }

      case 'split_open': {
        const total = n(num.total); const ways = n(num.ways); const share = n(num.share);
        const paid = n(num.paid); const expected = n(num.expected); const open = n(num.open);
        const name = s(num.name) || nameFromReceipt();
        const on = s(num.on) || r.month || null;
        const who = Array.isArray(num.who) ? (num.who as string[]).filter(Boolean) : [];
        if (total === null || ways === null || share === null || paid === null || expected === null || open === null || !name || !on) return keep;
        const day = dayBehind(on, t, locale, now);
        const sentence = paid === 0
          ? t('{name} {day}, {total} split {ways} ways: nobody has paid yet, {open} still open.', { name, day, total: euro(total), ways, open: euro(open) })
          : paid === 1
            ? t('{name} {day}, {total} split {ways} ways: {who} has paid, {open} still open.', { name, day, total: euro(total), ways, who: listOf(t, who), open: euro(open) })
            : t('{name} {day}, {total} split {ways} ways: {who} have paid, {open} still open.', { name, day, total: euro(total), ways, who: listOf(t, who), open: euro(open) });
        return { sentence, detail: t('Your share is {amount}. {n} of {of} shares still to come.', { amount: euro(share), n: expected - paid, of: expected }) };
      }

      case 'income_late': {
        const amount = n(num.typical_amount); const day = n(num.typical_day);
        if (amount === null || day === null) return keep;
        const source = num.source_is_default === true ? t('Comes in') : s(num.source);
        if (!source) return keep;
        const sentence = t('{source}, usually about {amount} on the {day}, has not come this month.', { source, amount: euro(amount), day: ordinal(t, day) });
        const days = receipts.map((x) => new Date(x.occurred_at).getUTCDate()).filter((d) => Number.isFinite(d));
        if (!days.length) return { sentence, detail: r.detail ?? null };
        const detail = days.length === 1
          ? t('The last one came on the {day}.', { day: ordinal(t, days[0]) })
          : t('The last {n} came on the {days}.', { n: days.length, days: days.map((d) => ordinal(t, d)).join(', ') });
        return { sentence, detail };
      }

      case 'own_score': {
        const last = num.last_month as { month?: string; said?: number; actual?: number; within_band?: boolean } | null | undefined;
        const charges = num.charges as { expected?: number; arrived?: number; on_day?: number } | null | undefined;
        const band = num.band as { days?: number; coverage?: number | null } | null | undefined;
        const chargeClause = charges && n(charges.expected) ? (
          n(charges.on_day)
            ? t('Of {expected} charges it expected, {arrived} came, {n} on the day.', { expected: charges.expected as number, arrived: charges.arrived as number, n: charges.on_day as number })
            : t('Of {expected} charges it expected, {arrived} came.', { expected: charges.expected as number, arrived: charges.arrived as number })
        ) : null;
        if (last && n(last.said) !== null && n(last.actual) !== null) {
          const said = Number(last.said); const actual = Number(last.actual); const diff = euro(Math.abs(actual - said));
          const month = monthName(last.month ? `${last.month}-01` : null, locale);
          const inside = last.within_band === true;
          const sentence = actual >= said
            ? (inside
              ? t('In {month} it said {said}; it was {actual}, {diff} over, inside the range it gave.', { month, said: euro(said), actual: euro(actual), diff })
              : t('In {month} it said {said}; it was {actual}, {diff} over, outside the range it gave.', { month, said: euro(said), actual: euro(actual), diff }))
            : (inside
              ? t('In {month} it said {said}; it was {actual}, {diff} under, inside the range it gave.', { month, said: euro(said), actual: euro(actual), diff })
              : t('In {month} it said {said}; it was {actual}, {diff} under, outside the range it gave.', { month, said: euro(said), actual: euro(actual), diff }));
          const days = band && n(band.days) ? Number(band.days) : 0;
          const bandClause = days >= 14 && band && band.coverage !== null && band.coverage !== undefined
            ? t('The day range held on {held} of {days} days.', { held: Math.round(Number(band.coverage) * days), days })
            : null;
          const detail = [chargeClause, bandClause].filter(Boolean).join(' ');
          return { sentence, detail: detail || null };
        }
        return chargeClause ? { sentence: chargeClause, detail: null } : keep;
      }

      case 'subscription_unused': {
        const amount = n(num.typical_amount); const days = n(num.days_silent); const charges = n(num.charges);
        const total = n(num.total); const uses = n(num.uses); const period = n(num.period_days);
        const name = s(num.name);
        if (amount === null || days === null || !name) return keep;
        const cadence = s(num.cadence);
        const took = cadence && CADENCE_AMOUNT[cadence] ? t(CADENCE_AMOUNT[cadence], { amount: euro(amount) }) : euro(amount);
        const sentence = t('{name} took {took} and has not been used in {days} days.', { name, took, days });
        if (charges === null || total === null || uses === null || period === null) return { sentence, detail: r.detail ?? null };
        const chargeWord = charges === 1 ? t('{n} charge', { n: charges }) : t('{n} charges', { n: charges });
        const eventWord = uses === 1 ? t('{n} event', { n: uses }) : t('{n} events', { n: uses });
        return {
          sentence,
          detail: t('{charges}, {total} together, and the {platform} connection recorded {events} in {days} days.', {
            charges: chargeWord, total: euro(total), platform: platformLabel(t, s(num.platform)), events: eventWord, days: period,
          }),
        };
      }

      case 'subscription_cost_per_use': {
        const total = n(num.total); const uses = n(num.uses); const each = n(num.cost_per_use);
        const charges = n(num.charges); const period = n(num.period_days); const peer = n(num.peer_cost_per_use);
        const name = s(num.name);
        if (total === null || uses === null || each === null || !name) return keep;
        const sentence = uses === 1
          ? t('{name} has taken {total} for {n} use, {each} each.', { name, total: euro(total), n: uses, each: euro(each) })
          : t('{name} has taken {total} for {n} uses, {each} each.', { name, total: euro(total), n: uses, each: euro(each) });
        if (charges === null || period === null) return { sentence, detail: r.detail ?? null };
        const chargeWord = charges === 1 ? t('{n} charge', { n: charges }) : t('{n} charges', { n: charges });
        if (peer !== null) {
          return { sentence, detail: t('{charges} over {days} days. The other measurable subscriptions cost {amount} a use.', { charges: chargeWord, days: period, amount: euro(peer) }) };
        }
        const since = n(num.days_since_last_use);
        if (since === null) return { sentence, detail: r.detail ?? null };
        const dayWord = since === 1 ? t('{n} day', { n: since }) : t('{n} days', { n: since });
        return { sentence, detail: t('{charges} over {days} days, and the {platform} connection last recorded something {ago} ago.', { charges: chargeWord, days: period, platform: platformLabel(t, s(num.platform)), ago: dayWord }) };
      }

      /* What the ledger worked out on its own (brain.js). These reach a page for the first
         time here, so they are said in the reader's language from the start. */
      case 'price_point': {
        const amount = n(num.typical_amount); const times = n(num.times);
        const low = n(num.amount_low); const high = n(num.amount_high);
        const name = s(num.name); const first = s(num.first_seen);
        if (amount === null || times === null || !name || !first) return keep;
        const month = monthName(first, locale);
        const sentence = low !== null && high !== null && low === high
          ? t('{name} is always {amount}, {n} times since {month}.', { name, amount: euro(amount), n: times, month })
          : t('{name} is about {amount}, {n} times since {month}.', { name, amount: euro(amount), n: times, month });
        const detail = low !== null && high !== null && low === high
          ? t('Every one of them the same to the cent.')
          : t('The lowest was {low} and the highest {high}.', { low: euro(low || 0), high: euro(high || 0) });
        return { sentence, detail };
      }

      case 'weekday_habit': {
        const wd = n(num.weekday); const onDay = n(num.on_day); const times = n(num.times);
        const amount = n(num.typical_amount); const name = s(num.name); const first = s(num.first_seen);
        if (wd === null || onDay === null || times === null || !name) return keep;
        const sentence = t('You pay {name} on {weekday}, {n} of {m} times.', { name, weekday: weekdayName(wd, locale), n: onDay, m: times });
        if (amount === null || !first) return { sentence, detail: r.detail ?? null };
        return { sentence, detail: t('Since {day}, at {amount} a time.', { day: dayAndMonth(first, locale), amount: euro(amount) }) };
      }

      case 'month_shape': {
        const third = n(num.third); const pct = n(num.share_percent);
        const part = n(num.third_total); const total = n(num.total); const months = n(num.months);
        if (third === null || pct === null) return keep;
        const where = third === 0 ? t('the first third of the month') : third === 1 ? t('the middle of the month') : t('the last third of the month');
        const sentence = t('{pct}% of what you spend lands in {third}.', { pct, third: where });
        if (part === null || total === null || months === null) return { sentence, detail: r.detail ?? null };
        return { sentence, detail: t('{part} of {total}, read from {n} whole months and {m} payments.', { part: euro(part), total: euro(total), n: months, m: r.evidence_count ?? 0 }) };
      }

      case 'place_habit': {
        const pct = n(num.share_percent); const count = n(num.count); const placed = n(num.placed);
        const spent = n(num.spent); const total = n(num.total); const cities = n(num.cities);
        const city = s(num.city);
        if (pct === null || count === null || placed === null || !city) return keep;
        const sentence = t('{pct}% of your card payments happen in {city}: {n} of {m}.', { pct, city, n: count, m: placed });
        if (spent === null || total === null || cities === null) return { sentence, detail: r.detail ?? null };
        const where = cities === 1 ? t('{n} city', { n: cities }) : t('{n} cities', { n: cities });
        return { sentence, detail: t('{part} of {total}, across {cities}.', { part: euro(spent), total: euro(total), cities: where }) };
      }

      case 'pairing': {
        const times = n(num.times); const gap = n(num.median_gap_minutes);
        const first = s(num.first_name) || s(num.first); const second = s(num.second_name) || s(num.second);
        if (times === null || !first || !second) return keep;
        const sentence = t('{first} and {second} go together, {n} times.', { first, second, n: times });
        if (gap === null) return { sentence, detail: r.detail ?? null };
        const minutes = gap === 1 ? t('{n} minute', { n: gap }) : t('{n} minutes', { n: gap });
        return { sentence, detail: t('{second} follows {first} by about {gap}.', { second, first, gap: minutes }) };
      }

      case 'amount_outlier': {
        const typical = n(num.typical_amount); const amount = n(num.amount);
        const multiple = n(num.multiple); const times = n(num.times);
        const name = s(num.name); const on = s(num.on);
        if (typical === null || amount === null || !name || !on) return keep;
        const sentence = t('{name} usually takes {typical}; on {day} it took {amount}.', { name, typical: euro(typical), day: dayAndMonth(on, locale), amount: euro(amount) });
        if (multiple === null || times === null) return { sentence, detail: r.detail ?? null };
        return { sentence, detail: t('That is {x} times its usual, across {n} payments there.', { x: multiple, n: times }) };
      }

      case 'category_rhythm': {
        const weekend = n(num.weekend_per_day); const weekday = n(num.weekday_per_day); const days = n(num.days);
        const category = s(num.category);
        if (weekend === null || weekday === null || !category) return keep;
        const kind = categoryInline(t, category);
        const sentence = weekend > weekday
          ? t('Your {kind} spending lands at weekends: {a} a weekend day against {b} a weekday.', { kind, a: euro(weekend), b: euro(weekday) })
          : t('Your {kind} spending lands on weekdays: {a} a weekday against {b} a weekend day.', { kind, a: euro(weekday), b: euro(weekend) });
        if (days === null) return { sentence, detail: r.detail ?? null };
        return { sentence, detail: t('Read from {n} payments in {days} days.', { n: r.evidence_count ?? 0, days }) };
      }

      default:
        return keep;
    }
  } catch {
    /* A reading that cannot be said again is still a reading: the stored line stands. */
    return keep;
  }
}
