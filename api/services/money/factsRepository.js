/**
 * What the person told the ledger, and what kind of place a shop is.
 * ===================================================================
 * Pure reads, pulled out of store.js on 2026-09-19 so that calendar.js and predictions.js can
 * read facts without importing the module that imports them: store.js <-> calendar.js and
 * store.js <-> predictions.js were the two cycles that made the money core impossible to load
 * a module at a time. No orchestration here, ever.
 */
import { supabaseAdmin } from '../database.js';

export const INTERNAL_FACT_KINDS = Object.freeze(['event_spend', 'event_spend_meta', 'calendar_feed', 'home_point', 'inbox_address', 'card_type']);

/** The facts a person is shown: the internal kinds are working memory, not answers. */
export const publicFacts = (rows) => (rows || []).filter((f) => !INTERNAL_FACT_KINDS.includes(f.kind));

export async function listFacts(userId, { includeInternal = false } = {}) {
  const { data, error } = await supabaseAdmin.from('money_facts').select('*').eq('user_id', userId).order('answered_at');
  if (error) throw new Error('Could not read money facts');
  const rows = data || [];
  return includeInternal ? rows : publicFacts(rows);
}

export async function categoriesFor(userId, keys) {
  const wanted = [...new Set((keys || []).filter(Boolean))];
  if (!wanted.length) return new Map();
  const [{ data: places }, { data: mine }] = await Promise.all([
    supabaseAdmin.from('money_places').select('merchant_key, category').in('merchant_key', wanted),
    supabaseAdmin.from('money_place_overrides').select('merchant_key, category').eq('user_id', userId).in('merchant_key', wanted),
  ]);
  const map = new Map((places || []).map((p) => [p.merchant_key, p.category || null]));
  for (const o of mine || []) if (o.category) map.set(o.merchant_key, o.category);
  return map;
}
