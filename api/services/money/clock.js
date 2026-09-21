/**
 * Which payments carry a real time of day (2026-09-21).
 *
 * A bank feed and a statement give a date, not a moment: both stamp noon UTC when that is
 * all they have (enableBanking.js, importer.js). Eighty-five of Stefano's 111 September
 * payments are stamped that way, so "how much did I spend last night" was answered from the
 * other twenty-six and never said so. A payment whose time is exactly midday UTC is a date;
 * anything else was seen by the phone, a receipt or a bank that sent a timestamp. Pure.
 */
const BOOKED_AT = 'T12:00:00.000Z';

/** Whether this payment knows the hour it happened, rather than the day it was booked. */
export function hasRealTime(t) {
  const iso = t && t.occurred_at ? new Date(t.occurred_at).toISOString() : null;
  return Boolean(iso) && !iso.endsWith(BOOKED_AT);
}

/** Of these payments, how many know their hour: { timed, total }. */
export function timedShare(transactions = []) {
  const rows = (transactions || []).filter((t) => t && t.occurred_at);
  return { timed: rows.filter(hasRealTime).length, total: rows.length };
}

/**
 * The line the model needs before it answers about a night, a morning or an afternoon: the
 * hours it is reading are only as complete as the payments that carry one.
 */
export function clockLine(transactions = [], from, to) {
  const inWindow = (transactions || []).filter((t) => {
    const at = new Date(t.occurred_at).getTime();
    return Number.isFinite(at) && at >= from && at < to;
  });
  const day = (transactions || []).filter((t) => {
    const at = new Date(t.occurred_at).getTime();
    return Number.isFinite(at) && at >= from - 12 * 3600000 && at < to + 12 * 3600000;
  });
  const { timed, total } = timedShare(day);
  if (!total || timed === total) return null;
  return `Hours are not complete: of the ${total} payment${total === 1 ? '' : 's'} around that stretch, ${timed} carry the hour they happened and ${total - timed} carry only the day the bank booked them, so a part of a day can name only what ${inWindow.length === 1 ? 'the one payment it holds shows' : 'the payments it holds show'}. Say so in a short clause when asked about a night, a morning or an afternoon.`;
}
