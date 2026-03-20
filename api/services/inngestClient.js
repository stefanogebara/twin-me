/**
 * Inngest Client — Durable Execution for Agent Workflows
 * ========================================================
 * Single Inngest client instance shared across all agent functions.
 * Handles step-based workflows that survive Vercel cold starts,
 * retries, and infrastructure failures.
 *
 * Research:
 *   - Inngest Durable Execution (inngest.com/blog/durable-execution)
 *   - Manus Context Engineering (todo.md attention pattern)
 */

import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'twinme',
  name: 'TwinMe Agentic Platform',
});

// Event type definitions for type safety and documentation
export const EVENTS = {
  // Session lifecycle
  SESSION_ENDED: 'twin/session.ended',

  // Agent actions
  SKILL_TRIGGERED: 'twin/skill.triggered',
  ACTION_REQUESTED: 'twin/action.requested',

  // Platform events (webhook-driven)
  PLATFORM_DATA_RECEIVED: 'twin/platform.data_received',

  // Prospective memory
  PROSPECTIVE_CHECK: 'twin/prospective.check',

  // Background maintenance
  CORE_MEMORY_REFRESH: 'twin/core_memory.refresh',
  GENERATE_BRIEFING: 'twin/briefing.generate',
};
