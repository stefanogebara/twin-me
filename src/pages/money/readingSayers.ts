/**
 * One sayer per kind of reading. Each takes the reading and the reader's language and says
 * the same numbers as a sentence and a detail, or hands back the stored line when a number it
 * needs is missing. Was one 375-line switch inside readingWords (split 2026-09-19, M2-2b).
 */
import { euro } from '../../services/api/moneyAPI';
import { n, s, ordinal, weekdayName, monthName, dayAhead, dayBehind, dayAndMonth, listOf, categoryWord, categoryInline, CADENCE_AMOUNT, platformLabel, weekPhrase } from './readingHelpers';
import type { T, Numbers, Sayable, Said } from './readingHelpers';

export type SayContext = {
  r: Sayable; t: T; locale: string; now: Date; num: Numbers; keep: Said;
  receipts: NonNullable<Sayable['receipts']>; nameFromReceipt: () => string | null;
};
export type Sayer = (c: SayContext) => Said;

export const SAYERS: Record<string, Sayer> = {
  month_pace: ({ r, t, locale, num, keep }) => {
    const spent = n(num.spent); const previous = n(num.previous_spent); const gap = n(num.gap); const day = n(num.day);
    if (spent === null || previous === null || gap === null || day === null || !r.month) return keep;
    const sentence = t('By the {day} you had spent {amount}. By the {day} of {month} it was {other}.', {
      day: ordinal(t, day), amount: euro(spent), month: monthName(r.month, locale, -1), other: euro(previous),
    });
    const detail = Math.abs(gap) < 1
      ? t('The two months are level.')
      : gap > 0 ? t('That is {amount} more.', { amount: euro(gap) }) : t('That is {amount} less.', { amount: euro(gap) });
    return { sentence, detail };
  },

  subscriptions: ({ r, t, num, keep }) => {
    const count = n(num.count); const total = n(num.monthly_total);
    const names = Array.isArray(num.names) ? (num.names as string[]).filter(Boolean) : [];
    if (count === null || total === null) return keep;
    const sentence = t('{n} charges come back every month, {total} together.', { n: count, total: euro(total) });
    if (!names.length) return { sentence, detail: r.detail ?? null };
    const shown = names.slice(0, 3).join(', ');
    const rest = count - 3;
    return { sentence, detail: rest > 0 ? t('{names} and {n} more.', { names: shown, n: rest }) : `${shown}.` };
  },

  small_payments: ({ t, num, keep }) => {
    const count = n(num.count); const total = n(num.total); const pct = n(num.share_percent); const threshold = n(num.threshold);
    if (count === null || total === null || pct === null || threshold === null) return keep;
    return {
      sentence: t('{n} payments under {threshold} this month, {total} together.', { n: count, threshold: euro(threshold), total: euro(total) }),
      detail: t('That is {pct}% of the month, in lines you would not remember.', { pct }),
    };
  },

  biggest_line: ({ t, num, keep, nameFromReceipt }) => {
    const amount = n(num.amount); const median = n(num.median); const days = n(num.days);
    const name = s(num.name) || nameFromReceipt();
    if (amount === null || median === null || days === null || !name) return keep;
    return {
      sentence: t('{name} at {amount} is the largest single payment in {days} days.', { name, amount: euro(amount), days }),
      detail: t('The middle payment in that window is {amount}.', { amount: euro(median) }),
    };
  },

  weekday_shape: ({ r, t, locale, num, keep }) => {
    const wd = n(num.weekday); const per = n(num.per_day); const other = n(num.other_per_day); const weeks = n(num.weeks);
    const payments = n(num.payments) ?? n(r.evidence_count); const times = n(num.n);
    if (wd === null || per === null || other === null) return keep;
    const sentence = t('{weekday} costs you {amount} against {other} on other days.', { weekday: weekdayName(wd, locale), amount: euro(per), other: euro(other) });
    if (weeks === null || payments === null || times === null) return { sentence, detail: r.detail ?? null };
    return { sentence, detail: t('Read from {weeks} weeks, {payments} payments and {n} such days.', { weeks, payments, n: times }) };
  },

  new_merchant: ({ t, num, keep, nameFromReceipt }) => {
    const places = n(num.new_merchants); const total = n(num.top_total); const count = n(num.top_count);
    const name = s(num.top_name) || nameFromReceipt();
    if (places === null || total === null || count === null || !name) return keep;
    const sentence = places === 1 ? t('{name} is new this month.', { name }) : t('{n} places are new this month.', { n: places });
    const detail = count === 1
      ? t('{name} has taken {amount} across {n} payment.', { name, amount: euro(total), n: count })
      : t('{name} has taken {amount} across {n} payments.', { name, amount: euro(total), n: count });
    return { sentence, detail };
  },

  dormant_charge: ({ t, num, keep, nameFromReceipt }) => {
    const days = n(num.days_since); const amount = n(num.typical_amount); const times = n(num.occurrences);
    const name = s(num.name) || nameFromReceipt();
    if (days === null || amount === null || times === null || !name) return keep;
    return {
      sentence: t('{name} came back every month and has not for {days} days.', { name, days }),
      detail: t('It was {amount} a time, {n} times.', { amount: euro(amount), n: times }),
    };
  },

  category_shape: ({ t, num, keep }) => {
    const pct = n(num.share_percent); const spent = n(num.spent); const days = n(num.days);
    const placed = n(num.placed); const total = n(num.total);
    if (pct === null || spent === null || days === null || placed === null || total === null) return keep;
    return {
      sentence: t('{pct}% of what you have spent in {days} days went to {category}: {amount}.', {
        pct, days, category: categoryInline(t, s(num.category)), amount: euro(spent),
      }),
      detail: t('Read from {placed} of {total}, which is what has a kind of place behind it so far.', { placed: euro(placed), total: euro(total) }),
    };
  },

  delta_category: ({ t, num, keep }) => {
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
  },

  delta_silence: ({ r, t, locale, num, keep }) => {
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
  },

  delta_weekday: ({ r, t, locale, num, keep, receipts }) => {
    const wd = n(num.weekday); const current = n(num.current); const usual = n(num.usual);
    if (wd === null || current === null || usual === null) return keep;
    const sentence = t('{weekday} cost {amount}; the six before, {usual} in the middle.', { weekday: weekdayName(wd, locale), amount: euro(current), usual: euro(usual) });
    const count = n(num.count) ?? receipts.length;
    if (!count) return { sentence, detail: t('Nothing paid that day.') };
    const names = receipts.map((x) => x.merchant_raw || x.merchant_key).filter(Boolean).slice(0, 3).join(', ');
    if (!names) return { sentence, detail: r.detail ?? null };
    return { sentence, detail: count === 1 ? t('{n} payment: {names}.', { n: count, names }) : t('{n} payments: {names}.', { n: count, names }) };
  },

  delta_pace: ({ r, t, num, keep }) => {
    const current = n(num.current); const usual = n(num.usual);
    const count = n(num.count) ?? n(r.evidence_count);
    if (current === null || usual === null || count === null) return keep;
    const sentence = t('{amount} in the last seven days; a usual week of yours is {usual}.', { amount: euro(current), usual: euro(usual) });
    const base = count === 1 ? t('{n} payment, recurring charges left out.', { n: count }) : t('{n} payments, recurring charges left out.', { n: count });
    const week = weekPhrase(t, num.week);
    return { sentence, detail: week ? `${base} ${t('It was {week}.', { week })}` : base };
  },

  cap_month: ({ t, num, keep }) => {
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
  },

  keep_month: ({ t, num, keep }) => {
    const keepAmount = n(num.keep); const income = n(num.income); const projected = n(num.projected);
    const ending = n(num.ending); const gap = n(num.gap);
    if (keepAmount === null || income === null || projected === null || ending === null || gap === null) return keep;
    const sentence = gap >= 0
      ? t('You wanted {keep} left; at this pace the month ends with {ending}.', { keep: euro(keepAmount), ending: euro(ending) })
      : t('You wanted {keep} left; at this pace the month ends with {ending}, {short} short.', { keep: euro(keepAmount), ending: euro(Math.max(0, ending)), short: euro(-gap) });
    return { sentence, detail: t('From {income} coming in and about {out} going out.', { income: euro(income), out: euro(projected) }) };
  },

  charge_ahead: ({ r, t, locale, now, num, keep }) => {
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
  },

  named_expense: ({ t, locale, now, num, keep }) => {
    const amount = n(num.amount); const on = s(num.on); const name = s(num.name);
    if (amount === null || !on || !name) return keep;
    return { sentence: t('{name}, {amount}, leaves {day}.', { name, amount: euro(amount), day: dayAhead(on, t, locale, now) }), detail: null };
  },

  split_open: ({ r, t, locale, now, num, keep, nameFromReceipt }) => {
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
  },

  income_late: ({ r, t, num, keep, receipts }) => {
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
  },

  own_score: ({ t, locale, num, keep }) => {
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
  },

  subscription_unused: ({ r, t, num, keep }) => {
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
  },

  subscription_cost_per_use: ({ r, t, num, keep }) => {
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
  },

  price_point: ({ t, locale, num, keep }) => {
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
  },

  weekday_habit: ({ r, t, locale, num, keep }) => {
    const wd = n(num.weekday); const onDay = n(num.on_day); const times = n(num.times);
    const amount = n(num.typical_amount); const name = s(num.name); const first = s(num.first_seen);
    if (wd === null || onDay === null || times === null || !name) return keep;
    const sentence = t('You pay {name} on {weekday}, {n} of {m} times.', { name, weekday: weekdayName(wd, locale), n: onDay, m: times });
    if (amount === null || !first) return { sentence, detail: r.detail ?? null };
    return { sentence, detail: t('Since {day}, at {amount} a time.', { day: dayAndMonth(first, locale), amount: euro(amount) }) };
  },

  month_shape: ({ r, t, num, keep }) => {
    const third = n(num.third); const pct = n(num.share_percent);
    const part = n(num.third_total); const total = n(num.total); const months = n(num.months);
    if (third === null || pct === null) return keep;
    const where = third === 0 ? t('the first third of the month') : third === 1 ? t('the middle of the month') : t('the last third of the month');
    const sentence = t('{pct}% of what you spend lands in {third}.', { pct, third: where });
    if (part === null || total === null || months === null) return { sentence, detail: r.detail ?? null };
    return { sentence, detail: t('{part} of {total}, read from {n} whole months and {m} payments.', { part: euro(part), total: euro(total), n: months, m: r.evidence_count ?? 0 }) };
  },

  place_habit: ({ r, t, num, keep }) => {
    const pct = n(num.share_percent); const count = n(num.count); const placed = n(num.placed);
    const spent = n(num.spent); const total = n(num.total); const cities = n(num.cities);
    const city = s(num.city);
    if (pct === null || count === null || placed === null || !city) return keep;
    const sentence = t('{pct}% of your card payments happen in {city}: {n} of {m}.', { pct, city, n: count, m: placed });
    if (spent === null || total === null || cities === null) return { sentence, detail: r.detail ?? null };
    const where = cities === 1 ? t('{n} city', { n: cities }) : t('{n} cities', { n: cities });
    return { sentence, detail: t('{part} of {total}, across {cities}.', { part: euro(spent), total: euro(total), cities: where }) };
  },

  pairing: ({ r, t, num, keep }) => {
    const times = n(num.times); const gap = n(num.median_gap_minutes);
    const first = s(num.first_name) || s(num.first); const second = s(num.second_name) || s(num.second);
    if (times === null || !first || !second) return keep;
    const sentence = t('{first} and {second} go together, {n} times.', { first, second, n: times });
    if (gap === null) return { sentence, detail: r.detail ?? null };
    const minutes = gap === 1 ? t('{n} minute', { n: gap }) : t('{n} minutes', { n: gap });
    return { sentence, detail: t('{second} follows {first} by about {gap}.', { second, first, gap: minutes }) };
  },

  amount_outlier: ({ r, t, locale, num, keep }) => {
    const typical = n(num.typical_amount); const amount = n(num.amount);
    const multiple = n(num.multiple); const times = n(num.times);
    const name = s(num.name); const on = s(num.on);
    if (typical === null || amount === null || !name || !on) return keep;
    const sentence = t('{name} usually takes {typical}; on {day} it took {amount}.', { name, typical: euro(typical), day: dayAndMonth(on, locale), amount: euro(amount) });
    if (multiple === null || times === null) return { sentence, detail: r.detail ?? null };
    return { sentence, detail: t('That is {x} times its usual, across {n} payments there.', { x: multiple, n: times }) };
  },

  category_rhythm: ({ r, t, num, keep }) => {
    const weekend = n(num.weekend_per_day); const weekday = n(num.weekday_per_day); const days = n(num.days);
    const category = s(num.category);
    if (weekend === null || weekday === null || !category) return keep;
    const kind = categoryInline(t, category);
    const sentence = weekend > weekday
      ? t('Your {kind} spending lands at weekends: {a} a weekend day against {b} a weekday.', { kind, a: euro(weekend), b: euro(weekday) })
      : t('Your {kind} spending lands on weekdays: {a} a weekday against {b} a weekend day.', { kind, a: euro(weekday), b: euro(weekend) });
    if (days === null) return { sentence, detail: r.detail ?? null };
    return { sentence, detail: t('Read from {n} payments in {days} days.', { n: r.evidence_count ?? 0, days }) };
  },
};
