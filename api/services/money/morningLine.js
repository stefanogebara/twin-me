/**
 * The morning line: today's number and at most one thing that is due.
 * ===================================================================
 * Computed, never phrased by a model. It fills the two variables of the approved WhatsApp
 * template `money_morning`. Meta refuses an empty variable, a newline, a tab or four spaces in a
 * row, so the second variable always says something and names are cleaned.
 */
import { safeToSpend, chargesSoon } from './allowance.js';
import { money } from './currency.js';

export const MORNING_TEMPLATE = 'money_morning';
/** A return window is worth the line only when it is about to shut. */
export const RETURN_WITHIN_DAYS = 2;

/* The ledger's language to the template's language code and the line's few words. */
const WORDS = {
  en: { code: 'en', nothing: 'nothing', today: '{name}, {amount}, leaves today.', tomorrow: '{name}, {amount}, leaves tomorrow.', returns: 'The return window for {name} closes {when}.', none: 'Nothing is due today or tomorrow.', when: ['today', 'tomorrow', 'in two days'] },
  es: { code: 'es', nothing: 'nada', today: '{name}, {amount}, sale hoy.', tomorrow: '{name}, {amount}, sale mañana.', returns: 'El plazo para devolver {name} se cierra {when}.', none: 'Nada vence hoy ni mañana.', when: ['hoy', 'mañana', 'en dos días'] },
  'pt-BR': { code: 'pt_BR', nothing: 'nada', today: '{name}, {amount}, sai hoje.', tomorrow: '{name}, {amount}, sai amanhã.', returns: 'O prazo para devolver {name} fecha {when}.', none: 'Nada vence hoje nem amanhã.', when: ['hoje', 'amanhã', 'em dois dias'] },
};

export function clean(text) {
  return String(text || '').replace(/[\n\r\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 60);
}

const fill = (line, holes) => line.replace(/\{(\w+)\}/g, (m, k) => (k in holes ? String(holes[k]) : m));

export function morningLine(ctx, now = new Date()) {
  const w = WORDS[ctx?.language] || WORDS.en;
  const a = safeToSpend({ cast: ctx?.forecast, segments: ctx?.segments, facts: ctx?.facts, now });
  if (!a || a.amount === null || a.amount === undefined) return null;
  const first = a.over ? w.nothing : money(a.amount);

  const charges = chargesSoon(ctx?.recurring || [], now);
  const charge = charges.find((c) => c.when === 'today') || charges.find((c) => c.when === 'tomorrow');
  if (charge) {
    return { variables: [first, fill(w[charge.when], { name: clean(charge.name || '?'), amount: money(charge.amount) })], language: w.code, due: charge.when === 'today' ? 'charge_today' : 'charge_tomorrow' };
  }
  const closing = (ctx?.returns || []).filter((r) => Number.isFinite(r.days_left) && r.days_left >= 0 && r.days_left <= RETURN_WITHIN_DAYS)
    .sort((x, y) => x.days_left - y.days_left)[0];
  if (closing) {
    return { variables: [first, fill(w.returns, { name: clean(closing.merchant), when: w.when[closing.days_left] })], language: w.code, due: 'return' };
  }
  return { variables: [first, w.none], language: w.code, due: 'none' };
}
