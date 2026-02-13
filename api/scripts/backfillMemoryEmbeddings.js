/**
 * Backfill Memory Embeddings & Importance Scores
 * ================================================
 * One-time script to generate embeddings and importance scores
 * for existing user_memories records that don't have them yet.
 *
 * Processes in batches of 50 to respect API rate limits.
 *
 * Usage:
 *   node api/scripts/backfillMemoryEmbeddings.js
 *   node api/scripts/backfillMemoryEmbeddings.js --seed-reflections
 */

import dotenv from 'dotenv';
import path from 'path';

// Load env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { supabaseAdmin } from '../services/database.js';
import { generateEmbeddings, vectorToString } from '../services/embeddingService.js';
import { rateImportance } from '../services/memoryStreamService.js';
import { seedReflections } from '../services/reflectionEngine.js';

const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES_MS = 1000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfillEmbeddings() {
  console.log('=== Memory Embeddings Backfill ===\n');

  // Count total memories without embeddings
  const { count, error: countError } = await supabaseAdmin
    .from('user_memories')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  if (countError) {
    console.error('Failed to count memories:', countError.message);
    process.exit(1);
  }

  console.log(`Found ${count} memories without embeddings\n`);

  if (count === 0) {
    console.log('Nothing to backfill!');
    return;
  }

  let processed = 0;
  let failed = 0;
  let batch = 0;

  while (processed + failed < count) {
    batch++;
    console.log(`--- Batch ${batch} (processed: ${processed}, failed: ${failed}) ---`);

    // Fetch next batch of memories without embeddings
    const { data: memories, error } = await supabaseAdmin
      .from('user_memories')
      .select('id, content, importance_score')
      .is('embedding', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('Failed to fetch batch:', error.message);
      break;
    }

    if (!memories || memories.length === 0) {
      console.log('No more memories to process');
      break;
    }

    // Generate embeddings for the batch
    const texts = memories.map(m => m.content || '');
    const embeddings = await generateEmbeddings(texts);

    // Generate importance scores for memories that don't have one
    const importancePromises = memories.map(async (mem, i) => {
      if (mem.importance_score && mem.importance_score !== 5) {
        return mem.importance_score; // Already has a meaningful score
      }
      try {
        return await rateImportance(mem.content || '');
      } catch {
        return 5;
      }
    });

    const importanceScores = await Promise.all(importancePromises);

    // Update each memory with its embedding and importance score
    for (let i = 0; i < memories.length; i++) {
      const embedding = embeddings[i];
      const importance = importanceScores[i];

      if (!embedding) {
        failed++;
        continue;
      }

      const updateData = {
        embedding: vectorToString(embedding),
        importance_score: importance,
      };

      const { error: updateError } = await supabaseAdmin
        .from('user_memories')
        .update(updateData)
        .eq('id', memories[i].id);

      if (updateError) {
        console.error(`Failed to update memory ${memories[i].id}:`, updateError.message);
        failed++;
      } else {
        processed++;
      }
    }

    console.log(`  Batch ${batch}: ${memories.length} processed, ${processed} total success, ${failed} total failed`);

    // Rate limit delay
    if (processed + failed < count) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`\n=== Backfill Complete ===`);
  console.log(`  Total processed: ${processed}`);
  console.log(`  Total failed: ${failed}`);
}

async function seedUserReflections() {
  console.log('\n=== Seeding Initial Reflections ===\n');

  // Get distinct users with memories
  const { data: users, error } = await supabaseAdmin
    .from('user_memories')
    .select('user_id')
    .not('embedding', 'is', null)
    .limit(1000);

  if (error) {
    console.error('Failed to fetch users:', error.message);
    return;
  }

  const uniqueUserIds = [...new Set(users.map(u => u.user_id))];
  console.log(`Found ${uniqueUserIds.length} users with embedded memories\n`);

  for (const userId of uniqueUserIds) {
    try {
      const count = await seedReflections(userId);
      console.log(`  User ${userId}: ${count} reflections generated`);
    } catch (err) {
      console.error(`  User ${userId}: reflection failed - ${err.message}`);
    }
    await sleep(2000); // Be gentle with API limits between users
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);

  await backfillEmbeddings();

  if (args.includes('--seed-reflections')) {
    await seedUserReflections();
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
