/**
 * Backfill merchant_normalized for existing user_transactions rows.
 *
 * Finds every row where merchant_normalized IS NULL and merchant_raw IS NOT NULL,
 * runs normalizeMerchant(merchant_raw), and writes the result back.
 * Also updates category when the current value is null.
 *
 * Safe to re-run: skips rows that already have merchant_normalized set.
 *
 * Usage:
 *   node scripts/backfill-merchant-normalized.js           # dry run (no writes)
 *   node scripts/backfill-merchant-normalized.js --write   # write to DB
 *
 * Requires .env.production (VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { normalizeMerchant } from '../api/services/transactions/merchantNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

const DRY_RUN = !process.argv.includes('--write');
const BATCH_SIZE = 200;

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --write to apply)' : 'WRITE'}`);

  // Count total rows to backfill
  const { count } = await sb
    .from('user_transactions')
    .select('*', { count: 'exact', head: true })
    .is('merchant_normalized', null)
    .not('merchant_raw', 'is', null);

  console.log(`Rows to backfill: ${count}`);
  if (count === 0) { console.log('Nothing to do.'); return; }

  let offset = 0;
  let updated = 0;
  let skipped = 0;

  while (offset < count) {
    const { data, error } = await sb
      .from('user_transactions')
      .select('id, merchant_raw, category')
      .is('merchant_normalized', null)
      .not('merchant_raw', 'is', null)
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) { console.error('Fetch error:', error); break; }
    if (!data.length) break;

    const updates = [];
    for (const row of data) {
      const { brand, category } = normalizeMerchant(row.merchant_raw);
      if (!brand) { skipped++; continue; }
      updates.push({
        id: row.id,
        merchant_normalized: brand,
        // only overwrite category if currently null
        ...(row.category == null ? { category } : {}),
      });
    }

    if (!DRY_RUN && updates.length) {
      // upsert by PK — preserves all other columns
      const { error: upsertErr } = await sb
        .from('user_transactions')
        .upsert(updates, { onConflict: 'id' });
      if (upsertErr) { console.error('Upsert error:', upsertErr); break; }
    }

    updated += updates.length;
    offset += data.length;

    const sample = updates.slice(0, 3).map(u => `"${u.merchant_normalized}"`).join(', ');
    console.log(`  [${offset}/${count}] wrote ${updates.length} rows${DRY_RUN ? ' (dry)' : ''} — e.g. ${sample}`);
  }

  console.log(`\nDone. updated=${updated} skipped_null_brand=${skipped}`);
}

run().catch(console.error);
