/**
 * Inngest Function: Session Reflection
 * ======================================
 * Triggered when a conversation session ends (15-min silence).
 * Runs multi-granularity reflection: extracts facts, updates HUMAN block,
 * creates prospective memories, and scores twin quality.
 *
 * Durable: if any step fails, it retries from the last checkpoint.
 * Cost: ~$0.01 per reflection (DeepSeek tier).
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import {
  getRecentConversationMessages,
  generateSessionReflection,
  applyReflectionResults
} from '../../services/sessionReflectionService.js';
import { generateRecentContext, generateGoalsBlock } from '../../services/coreMemoryService.js';

export const sessionReflectionFunction = inngest.createFunction(
  {
    id: 'session-reflection',
    name: 'Post-Session Twin Reflection',
    retries: 2,
  },
  { event: EVENTS.SESSION_ENDED },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: Fetch recent conversation messages
    const messages = await step.run('fetch-messages', async () => {
      return getRecentConversationMessages(userId, 20);
    });

    if (!messages || messages.length < 4) {
      return { skipped: true, reason: 'too_few_messages', count: messages?.length };
    }

    // Step 2: Generate reflection via LLM
    const reflection = await step.run('generate-reflection', async () => {
      return generateSessionReflection(userId, messages);
    });

    if (!reflection) {
      return { skipped: true, reason: 'reflection_generation_failed' };
    }

    // Step 3: Apply reflection results (store facts, update blocks, create prospectives)
    const applied = await step.run('apply-results', async () => {
      return applyReflectionResults(userId, reflection);
    });

    // Step 4: Refresh core memory blocks in background
    await step.run('refresh-core-memory', async () => {
      await Promise.all([
        generateRecentContext(userId),
        generateGoalsBlock(userId),
      ]);
    });

    return {
      success: true,
      userId,
      reflection: {
        theme: reflection.session_theme,
        twinQuality: reflection.twin_quality?.score,
        factsStored: applied.facts,
        followUpsCreated: applied.followUps,
        humanBlockUpdated: applied.humanUpdated,
      }
    };
  }
);
