/**
 * Inngest Function: Personality Anchor Validation
 * ================================================
 * Weekly check that the twin's HUMAN block hasn't drifted too far
 * from the immutable SOUL_SIGNATURE anchor. Computes cosine similarity
 * between the two embeddings. If drift > 0.4, alerts the user.
 *
 * Steps:
 *   1. get-blocks        — Fetch SOUL_SIGNATURE and HUMAN content
 *   2. compute-embeddings — Embed both blocks (existing embeddingService)
 *   3. compute-drift     — Cosine similarity. If < 0.6, flag as drifting
 *   4. log-result        — Store in agent_events with event_type 'personality_validation'
 *   5. alert-if-drifting — If drifting, create a proactive_insight
 *
 * Cost: ~$0.001/user (2 embedding calls)
 * Schedule: Weekly (triggered by cron, Sundays 3am UTC)
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { getBlocks } from '../../services/coreMemoryService.js';
import { generateEmbedding } from '../../services/embeddingService.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('PersonalityValidation');

const DRIFT_THRESHOLD = 0.6; // cosine similarity below this = drifting

/**
 * Cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

export const personalityValidationFunction = inngest.createFunction(
  {
    id: 'personality-validation',
    name: 'Personality Anchor Validation',
    retries: 1,
    concurrency: { limit: 1, key: 'event.data.userId' },
  },
  { event: EVENTS.PERSONALITY_VALIDATION },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: Fetch SOUL_SIGNATURE and HUMAN blocks
    const blocks = await step.run('get-blocks', async () => {
      const allBlocks = await getBlocks(userId);

      const soulContent = allBlocks.soul_signature?.content || '';
      const humanContent = allBlocks.human?.content || '';

      return { soulContent, humanContent };
    });

    if (!blocks.soulContent || !blocks.humanContent) {
      log.info('Skipping validation — missing blocks', {
        userId,
        hasSoul: !!blocks.soulContent,
        hasHuman: !!blocks.humanContent,
      });
      return {
        skipped: true,
        reason: 'missing_blocks',
        hasSoul: !!blocks.soulContent,
        hasHuman: !!blocks.humanContent,
      };
    }

    // Step 2: Embed both blocks
    const embeddings = await step.run('compute-embeddings', async () => {
      const [soulEmbedding, humanEmbedding] = await Promise.all([
        generateEmbedding(blocks.soulContent),
        generateEmbedding(blocks.humanContent),
      ]);

      return { soulEmbedding, humanEmbedding };
    });

    if (!embeddings.soulEmbedding || !embeddings.humanEmbedding) {
      log.error('Embedding generation failed', { userId });
      return { skipped: true, reason: 'embedding_failed' };
    }

    // Step 3: Compute drift (cosine similarity)
    const driftResult = await step.run('compute-drift', () => {
      const similarity = cosineSimilarity(
        embeddings.soulEmbedding,
        embeddings.humanEmbedding
      );

      const isDrifting = similarity < DRIFT_THRESHOLD;

      return {
        similarity: Math.round(similarity * 1000) / 1000,
        isDrifting,
        threshold: DRIFT_THRESHOLD,
      };
    });

    // Step 4: Log result in agent_events
    await step.run('log-result', async () => {
      const { error } = await supabaseAdmin
        .from('agent_events')
        .insert({
          user_id: userId,
          event_type: 'personality_validation',
          event_data: {
            similarity: driftResult.similarity,
            isDrifting: driftResult.isDrifting,
            threshold: DRIFT_THRESHOLD,
          },
        });

      if (error) {
        log.warn('Failed to log validation event', { userId, error: error.message });
      }
    });

    // Step 5: Alert if drifting
    if (driftResult.isDrifting) {
      await step.run('alert-if-drifting', async () => {
        const { error } = await supabaseAdmin
          .from('proactive_insights')
          .insert({
            user_id: userId,
            category: 'proactive_insight',
            insight: "Your twin's understanding of you may have shifted. Review your profile in Settings.",
            urgency: 'medium',
            source_data: {
              type: 'personality_drift',
              similarity: driftResult.similarity,
              threshold: DRIFT_THRESHOLD,
            },
            delivered: false,
          });

        if (error) {
          log.warn('Failed to create drift alert', { userId, error: error.message });
        } else {
          log.info('Personality drift alert created', {
            userId,
            similarity: driftResult.similarity,
          });
        }
      });
    }

    log.info('Personality validation complete', {
      userId,
      similarity: driftResult.similarity,
      isDrifting: driftResult.isDrifting,
    });

    return {
      success: true,
      similarity: driftResult.similarity,
      isDrifting: driftResult.isDrifting,
      threshold: DRIFT_THRESHOLD,
    };
  }
);
