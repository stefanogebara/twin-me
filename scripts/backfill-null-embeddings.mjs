/**
 * Backfill NULL embeddings
 * ========================
 * One-off script. Re-embeds every user_memories row where embedding IS NULL.
 *
 * Usage:
 *   node scripts/backfill-null-embeddings.mjs [--dry-run]
 *
 * Requires env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 * and OPENROUTER_API_KEY (or OPENAI_API_KEY).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding, vectorToString } from '../api/services/embeddingService.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`[backfill] Starting${dryRun ? ' (DRY RUN)' : ''}`);

  const { data: rows, error } = await supabase
    .from('user_memories')
    .select('id, user_id, memory_type, content')
    .is('embedding', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[backfill] Query failed:', error);
    process.exit(1);
  }

  console.log(`[backfill] Found ${rows.length} rows with NULL embedding`);
  if (rows.length === 0) {
    console.log('[backfill] Nothing to do.');
    return;
  }

  let ok = 0;
  let fail = 0;
  const failures = [];

  for (const row of rows) {
    if (!row.content || typeof row.content !== 'string') {
      console.warn(`[backfill] Skip ${row.id}: empty content`);
      fail++;
      failures.push({ id: row.id, reason: 'empty content' });
      continue;
    }

    // Retry up to 3x for transient failures
    let vec = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        vec = await generateEmbedding(row.content);
        if (vec) break;
        lastErr = 'returned null';
      } catch (e) {
        lastErr = e?.message || String(e);
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 250 * attempt));
    }

    if (!vec) {
      console.error(`[backfill] Embed FAIL ${row.id} (${row.memory_type}): ${lastErr}`);
      fail++;
      failures.push({ id: row.id, reason: lastErr });
      continue;
    }

    if (dryRun) {
      console.log(`[backfill] DRY ${row.id} (${row.memory_type}): would update`);
      ok++;
      continue;
    }

    const { error: upErr } = await supabase
      .from('user_memories')
      .update({ embedding: vectorToString(vec) })
      .eq('id', row.id);

    if (upErr) {
      console.error(`[backfill] Update FAIL ${row.id}: ${upErr.message}`);
      fail++;
      failures.push({ id: row.id, reason: upErr.message });
    } else {
      ok++;
      if (ok % 10 === 0) console.log(`[backfill] Progress: ${ok}/${rows.length}`);
    }
  }

  console.log(`\n[backfill] Done. Success: ${ok}, Failed: ${fail}`);
  if (failures.length > 0) {
    console.log('[backfill] Failures:', JSON.stringify(failures, null, 2));
  }
}

main().catch(err => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
