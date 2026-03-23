/**
 * Backfill Missing Embeddings
 * ============================
 * Generates embeddings for user_memories rows that have NULL embedding.
 * Processes in batches to avoid rate limits and memory issues.
 *
 * Usage:
 *   cd twin-ai-learn && node api/scripts/backfill-embeddings.js
 *
 * Environment: Requires OPENROUTER_API_KEY or OPENAI_API_KEY in .env
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const BATCH_SIZE = 25;
const DELAY_BETWEEN_BATCHES_MS = 1000;
const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Use OpenRouter (same key as the rest of the platform)
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:8086',
    'X-Title': 'TwinMe-Backfill',
  },
});

function vectorToString(embedding) {
  return `[${embedding.join(',')}]`;
}

async function generateEmbeddings(texts) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data.map(d => d.embedding);
}

async function main() {
  console.log('=== Embedding Backfill ===\n');

  // Count total missing
  const { count: totalMissing } = await supabase
    .from('user_memories')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  console.log(`Found ${totalMissing} memories missing embeddings\n`);

  if (totalMissing === 0) {
    console.log('Nothing to backfill. All memories have embeddings.');
    return;
  }

  let processed = 0;
  let failed = 0;
  let batchNum = 0;

  while (processed + failed < totalMissing) {
    batchNum++;

    // Fetch next batch of memories without embeddings
    const { data: batch, error: fetchError } = await supabase
      .from('user_memories')
      .select('id, content')
      .is('embedding', null)
      .order('created_at', { ascending: false })
      .limit(BATCH_SIZE);

    if (fetchError || !batch || batch.length === 0) {
      if (fetchError) console.error('Fetch error:', fetchError.message);
      break;
    }

    const texts = batch.map(m => (m.content || '').substring(0, 8000).trim()).filter(Boolean);

    if (texts.length === 0) {
      // Skip empty content rows
      for (const m of batch) {
        await supabase
          .from('user_memories')
          .update({ embedding: null })
          .eq('id', m.id);
      }
      failed += batch.length;
      continue;
    }

    try {
      const embeddings = await generateEmbeddings(texts);

      // Update each memory with its embedding
      for (let i = 0; i < batch.length; i++) {
        const embedding = embeddings[i];
        if (embedding && embedding.length === EMBEDDING_DIMENSIONS) {
          const { error: updateError } = await supabase
            .from('user_memories')
            .update({ embedding: vectorToString(embedding) })
            .eq('id', batch[i].id);

          if (updateError) {
            console.error(`  Failed to update ${batch[i].id}:`, updateError.message);
            failed++;
          } else {
            processed++;
          }
        } else {
          failed++;
        }
      }

      const pct = Math.round(((processed + failed) / totalMissing) * 100);
      console.log(`Batch ${batchNum}: ${processed} processed, ${failed} failed (${pct}% complete)`);

    } catch (apiError) {
      console.error(`Batch ${batchNum} API error:`, apiError.message);
      failed += batch.length;

      // If rate limited, wait longer
      if (apiError.status === 429) {
        console.log('Rate limited. Waiting 10 seconds...');
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    // Delay between batches to respect rate limits
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
  }

  console.log(`\n=== Backfill Complete ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${processed + failed} / ${totalMissing}`);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
