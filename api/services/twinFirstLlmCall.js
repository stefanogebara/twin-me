/**
 * Twin First LLM Call
 * ===================
 * Owns the first round-trip to the chat tier of the LLM gateway, plus the
 * sampling parameter assembly (personality-derived params + tier temperature
 * delta).
 *
 * Two branches:
 *   - Streaming  → uses streamLLM(); buffers chunks when workspace actions
 *                  are enabled (so [ACTION: ...] tags don't leak mid-stream).
 *   - Buffered   → uses complete().
 *
 * Phase 1 (product-truth-review 2026-08-09): the neurotransmitter-mode
 * sampling deltas (±0.05-0.10 temperature — user-imperceptible) and the
 * best-of-N personality reranker (only ever wired on the buffered path while
 * every chat surface streams — dead code in production) were deleted.
 *
 * On gateway failure the helper THROWS — the route catches and maps the
 * error to the right HTTP/SSE response since only the route knows the
 * timeout state and headersSent semantics.
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { complete, stream as streamLLM, TIER_CHAT } from './llmGateway.js';
import { parseActions, stripActionTags } from './tools/workspaceActionParser.js';

const FALLBACK_MESSAGE = 'I apologize, I could not generate a response.';

function buildSamplingParams({ personalityProfile, tempDeltaByTier }) {
  return {
    temperature: (personalityProfile?.temperature ?? 0.7) + tempDeltaByTier,
    top_p: personalityProfile?.top_p ?? 0.9,
    frequency_penalty: personalityProfile?.frequency_penalty ?? 0.0,
    presence_penalty: personalityProfile?.presence_penalty ?? 0.0,
  };
}

export async function runFirstLlmCall({
  isStreaming,
  systemPrompt,
  llmMessages,
  userId,
  routingTier,
  routedModel,
  personalityProfile,
  tempDeltaByTier,
  workspaceActionsEnabled,
  res,
  chatLog,
}) {
  const sampling = buildSamplingParams({ personalityProfile, tempDeltaByTier });
  const serviceName = routingTier ? `twin-chat:${routingTier}` : 'twin-chat';

  if (isStreaming) {
    chatLog?.('Starting streaming LLM call');
    const bufferForActions = workspaceActionsEnabled;
    const bufferedChunks = [];

    // audit-2026-05-13 bottleneck follow-up: capture TTFT (time to first
    // chunk) separately from total LLM time. The hop_timings ladder showed
    // llm_first_call taking 43s for a 47-char response — we need to know
    // whether that's prefill latency (huge gap to first token) or slow
    // generation. Returning both lets the route emit them as hop extras.
    const llmCallStart = Date.now();
    let firstChunkMs = null;

    const result = await streamLLM({
      tier: TIER_CHAT,
      system: systemPrompt,
      messages: llmMessages,
      maxTokens: 2048,
      temperature: sampling.temperature,
      top_p: sampling.top_p,
      frequency_penalty: sampling.frequency_penalty,
      presence_penalty: sampling.presence_penalty,
      userId,
      serviceName,
      modelOverride: routedModel,
      onChunk: (chunk) => {
        if (firstChunkMs === null) firstChunkMs = Date.now() - llmCallStart;
        if (bufferForActions) {
          bufferedChunks.push(chunk);
        } else {
          try { res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`); } catch { /* client gone */ }
        }
      },
    });
    const llmTotalMs = Date.now() - llmCallStart;
    chatLog?.('Streaming LLM call complete');

    const assistantMessage = result.content || FALLBACK_MESSAGE;

    if (bufferForActions && parseActions(assistantMessage).length === 0) {
      const cleanText = stripActionTags(assistantMessage);
      try { res.write(`data: ${JSON.stringify({ type: 'chunk', content: cleanText })}\n\n`); } catch { /* gone */ }
    }

    return { assistantMessage, ttftMs: firstChunkMs, totalLlmMs: llmTotalMs };
  }

  chatLog?.('Starting LLM call');
  const llmCallStart = Date.now();

  const result = await complete({
    tier: TIER_CHAT,
    system: systemPrompt,
    messages: llmMessages,
    maxTokens: 2048,
    temperature: sampling.temperature,
    top_p: sampling.top_p,
    frequency_penalty: sampling.frequency_penalty,
    presence_penalty: sampling.presence_penalty,
    userId,
    serviceName,
    modelOverride: routedModel,
  });
  const llmTotalMs = Date.now() - llmCallStart;
  chatLog?.('LLM call complete');

  // Buffered path has no streaming chunks, so TTFT == totalMs (the gateway
  // returned the full response in one shot). Surfacing both lets the route
  // distinguish stream vs buffered in the same hop schema.
  return { assistantMessage: result.content || FALLBACK_MESSAGE, ttftMs: llmTotalMs, totalLlmMs: llmTotalMs };
}

export function classifyGatewayError(err) {
  const msg = err?.message || '';
  const isBilling =
    msg.includes('credit balance') ||
    msg.includes('billing') ||
    msg.includes('more credits') ||
    msg.includes('402');
  return { isBilling, message: msg };
}
