/**
 * Forget a place the lookup got wrong, so the ledger reads the merchant fresh.
 *
 *   node --env-file=.env scripts/money/forget-place.mjs "mauad g"
 *
 * 2026-09-23: "Mauad G." (a family member sending 100 EUR by Bizum) was matched to Mauad Hotel
 * Santo Domingo, kind hotel, category lodging, 6,000 km from the person. money_places is
 * shared across ledgers, so the row is deleted, not overridden.
 */
import { supabaseAdmin } from '../../api/_app/services/database.js';
const key = process.argv[2];
if (!key) { console.error('usage: forget-place.mjs <merchant_key>'); process.exit(1); }
const before = await supabaseAdmin.from('money_places').select('merchant_key, name, kind, category, country, lat, lon').eq('merchant_key', key);
console.log('before:', JSON.stringify(before.data));
const { error, count } = await supabaseAdmin.from('money_places').delete({ count: 'exact' }).eq('merchant_key', key);
if (error) throw new Error(error.message);
console.log(`deleted ${count} row(s) for "${key}"`);
process.exit(0);
