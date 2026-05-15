/**
 * Twin Chat API Routes
 * Provides the /api/chat/message endpoint for the Chat with Twin feature
 *
 * - Memory-aware responses via unified memory stream (Generative Agents architecture)
 * - Cluster personality context
 * - Research-backed trait evidence
 * - Conversation storage in episodic memory
 * - UNIFIED with MCP: Both Claude Desktop and web share conversation data
 */

import express from 'express';
import crypto from 'crypto';
import { authenticateUser } from '../middleware/auth.js';
import { buildContextSourcesMeta } from '../services/twinContextBuilder.js';
import { classifyNeuropil } from '../services/neuropilRouter.js';
import { classifyQueryDomain, retrieveExpertMemories } from '../services/platformExperts.js';
import { markInsightsDelivered } from '../services/proactiveInsights.js';
import { trackChatMessage } from '../services/twinSessionTracker.js';
import { classifyMessageTier, CHAT_TIER_LIGHT, CHAT_TIER_DEEP } from '../services/chatRouter.js';
import { condenseIfNeeded } from '../services/contextCondenser.js';
import { injectTaskIntentBlocks } from '../services/taskIntentInjector.js';
import { runWorkspaceActionChain } from '../services/workspaceActionChain.js';
import { validateChatInput, autoCreateConversation } from '../services/twinChatInputValidation.js';
import { runChatPreFlightChecks } from '../services/twinChatPreFlightChecks.js';
import { createStreamController } from '../services/twinChatStreamController.js';
import { fetchChatPreFlight } from '../services/twinChatPreFlight.js';
import { assembleTwinSystemPrompt } from '../services/twinPromptAssembly.js';
import { buildAdditionalContext, appendAdditionalContextToPrompt } from '../services/twinAdditionalContext.js';
import { injectConversationalProbes } from '../services/twinConversationalProbes.js';
import { runFirstLlmCall, classifyGatewayError } from '../services/twinFirstLlmCall.js';
import { persistChatTurn } from '../services/twinChatPersistence.js';
import {
  runPostResponseSideEffects,
  fetchConversationHistory,
  fetchCreativityBoost,
} from '../services/twinChatPipeline.js';
import { loadCoreBlocksForPrompt } from '../services/coreMemoryService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TwinChat');
const router = express.Router();

const MAX_ADDITIONAL_CONTEXT_CHARS = 12000;
// P6: Dead platform fetchers removed — all platform data is now fetched by twinContextBuilder.js
// 2026-05-09 monolith trim: getTimeAgo / getSoulSignature / getPersonalityScores
// were declared here but never called in this file. Removed (~57 LOC).
//   - The canonical getSoulSignature lives in services/soulSignatureService.js
//     (with caching). Future callers should import from there to avoid the
//     "soul signature read in 15 places via raw SQL" architecture finding.
//   - getPersonalityScores duplicated logic available via the personality-
//     profile route / personalityProfileService.

/**
 * POST /api/chat/message - Send a message to your digital twin
 */
router.post('/message', authenticateUser, async (req, res) => {
  const chatStartTime = Date.now();
  // audit-2026-05-13 follow-up: per-request trace ID. 8-char hex is wide
  // enough to be unique in a few-million-row window and short enough to
  // grep cleanly. Set as a response header so the client can attach it
  // to crash reports / user complaints and we can pivot from a single
  // log line back to the full request.
  const traceId = crypto.randomBytes(4).toString('hex');
  res.setHeader('X-Twin-Trace-Id', traceId);
  const chatLog = (label) => log.debug(label, { traceId, elapsedMs: Date.now() - chatStartTime });
  // Structured per-hop timing emission. Use info level (above debug) so
  // hops appear in prod logs by default. Tagged with the same traceId
  // so a single request can be reconstructed end-to-end.
  // audit-2026-05-13 trace-id follow-up: also accumulate hops into an
  // array so persistChatTurn can write the timing ladder to
  // mcp_conversation_logs.hop_timings — gives us a queryable record of
  // every chat turn's per-hop budget, which the Vercel MCP can't surface
  // because it truncates structured payloads.
  const hopTimings = [];
  const hopLog = (hop, extra = {}) => {
    const elapsedMs = Date.now() - chatStartTime;
    hopTimings.push({ hop, elapsedMs, ...extra });
    log.info('chat.hop', { traceId, hop, elapsedMs, ...extra });
  };
  let stream = null;
  try {
    const userId = req.user.id;
    const { context } = req.body || {};
    hopLog('start', { userId, messageLen: req.body?.message?.length || 0 });

    // Input validation extracted to ../services/twinChatInputValidation.js.
    // NB: this NO LONGER creates a conversation row — see audit bug H4
    // (2026-05-12). A failed pre-flight (429 / 403) used to leave an empty
    // twin_conversations row behind. Conversation creation now happens
    // after pre-flight passes.
    const validated = await validateChatInput({ userId, body: req.body });
    if (!validated.ok) {
      return res.status(validated.status).json(validated.body);
    }
    const { message } = validated;
    let conversationId = validated.conversationId;
    chatLog(`Message received from ${userId}: "${message.substring(0, 50)}..."`);

    // Pre-flight gates (feature flags + subscription + usage quota +
    // rate limit) extracted to ../services/twinChatPreFlightChecks.js.
    const preFlight = await runChatPreFlightChecks({ userId });
    if (!preFlight.ok) {
      hopLog('preflight_blocked', { status: preFlight.status });
      return res.status(preFlight.status).json(preFlight.body);
    }
    hopLog('preflight_passed');

    // Audit bug H4: create the conversation row only AFTER pre-flight
    // gates pass. Avoids orphan conversations on rate-limit / quota / paywall
    // rejections.
    if (!conversationId) {
      conversationId = await autoCreateConversation(userId, message);
    }
    const { featureFlags } = preFlight;
    const {
      useExpertRouting, useEmotionalState, useNeurotransmitterModes,
      useConnectomeNeuropils, useEmbodiedFeedback, usePersonalityOracle, useSmartRouting,
    } = preFlight.flags;

    // SSE bootstrap + heartbeat + 50s response timeout extracted to
    // ../services/twinChatStreamController.js.
    const isStreaming = req.query.stream === '1';
    stream = createStreamController({ res, isStreaming, userId, chatStartTime });
    hopLog('sse_bootstrapped', { isStreaming });

    // Classify neuropil domain BEFORE context fetch so we can route retrieval
    const neuropilResult = useConnectomeNeuropils ? classifyNeuropil(message) : { neuropilId: null, weights: null, budgets: null, confidence: 0 };
    if (neuropilResult.neuropilId) {
      chatLog(`Neuropil: ${neuropilResult.neuropilId} (confidence=${neuropilResult.confidence})`);
    }
    hopLog('neuropil_classified', { neuropilId: neuropilResult.neuropilId, confidence: neuropilResult.confidence });

    // Routing vars (populated by smart-routing after context fetch)
    let routedModel = null;
    let routingTier = null;

    chatLog('Starting fetchTwinContext');
    hopLog('context_fetch_start');
    // Audit bug H10 (2026-05-12): measure cold-start latency here. The
    // pre-flight context fan-out is the dominant cost of a chat turn and
    // is what the recent per-leg-timeout + HyDE-skip work was tuning. The
    // value is persisted into mcp_conversation_logs.cold_start_ms below.
    const coldStartBegin = Date.now();
    let twinContext, userLocation, personalityProfile, soulLayers, oracleDraft, workspaceBlock;
    let preflightLegTimings = null;
    try {
      ({ twinContext, userLocation, personalityProfile, soulLayers, oracleDraft, workspaceBlock, _legTimings: preflightLegTimings } =
        await fetchChatPreFlight({ userId, message, context, neuropilResult, usePersonalityOracle }));
    } finally {
      stream.clearHeartbeat();
    }
    const coldStartMs = Date.now() - coldStartBegin;
    chatLog('fetchTwinContext complete');
    hopLog('context_fetch_done', {
      coldStartMs,
      ...(preflightLegTimings || {}),
      ...(twinContext.timings || {}),
    });
    if (twinContext.timings) {
      log.info('Chat context timings', {
        traceId,
        totalContextMs: Date.now() - chatStartTime,
        ...twinContext.timings
      });
    }
    const contextBuildMs = Date.now() - chatStartTime;
    const { soulSignature, platformData, writingProfile, memories, twinSummary, proactiveInsights, enrichmentContext, voiceExamples, activeGoals, patterns, identityContext, calibrationContext, nudgeHistory, departmentProposals } = twinContext;

    // Inject platform activity priorities into platformData for system prompt
    try {
      const { data: actData } = await supabaseAdmin
        .from('platform_connections')
        .select('platform, activity_score, activity_level, content_volume')
        .eq('user_id', userId)
        .order('activity_score', { ascending: false });
      if (actData?.length > 0 && platformData) {
        platformData.activityPriorities = actData.map(a => ({
          platform: a.platform,
          score: a.activity_score || 0,
          level: a.activity_level || 'none',
          volume: a.content_volume || 0,
        }));
      }
    } catch (e) { /* non-fatal */ }

    // Core memory blocks anchor identity to prevent personality drift.
    const coreBlockText = await loadCoreBlocksForPrompt(userId);

    // System prompt assembly + neurotransmitter mode + emotional state
    // extracted to ../services/twinPromptAssembly.js.
    const promptAssembly = await assembleTwinSystemPrompt({
      twinContext,
      featureFlags,
      userLocation,
      coreBlockText,
      personalityProfile,
      soulLayers,
      oracleDraft,
      routingTier,
      message,
      userId,
      useNeurotransmitterModes,
      useEmotionalState,
      useEmbodiedFeedback,
    });
    let systemPrompt = promptAssembly.systemPrompt;
    const neurotransmitterMode = promptAssembly.neurotransmitterMode;
    const emotionalState = promptAssembly.emotionalState;

    // P1: Start async operations EARLY so they run in parallel with sync work below.
    // audit-2026-05-13 bottleneck follow-up: inspect-chat-traces CLI surfaced
    // parallel_meta_done = 7.1s on trace 174d0d8c. Adding per-leg timing
    // here splits it into expertRoutingMs / historyMs / creativityMs so the
    // next slow-tail row shows which sub-promise was the dragger.
    const parallelMetaStart = Date.now();
    const legTimings = { expertRoutingMs: null, historyMs: null, creativityMs: null };
    const timeLeg = (key, p) => {
      const t0 = Date.now();
      return p.finally(() => { legTimings[key] = Date.now() - t0; });
    };

    const expertRoutingPromise = useExpertRouting
      ? timeLeg('expertRoutingMs', classifyQueryDomain(message)
          .then(async (routingResult) => {
            if (routingResult.expertId && routingResult.domain !== 'general') {
              const expertMems = await retrieveExpertMemories(userId, routingResult.expertId, message, 6);
              return { routingResult, expertMemories: expertMems };
            }
            return { routingResult, expertMemories: [] };
          })
          .catch(err => { log.warn('Expert routing failed (non-fatal)', { error: err }); return null; }))
      : Promise.resolve(null);

    const conversationHistoryPromise = timeLeg('historyMs', fetchConversationHistory(userId, conversationId));
    const creativityBoostPromise = timeLeg('creativityMs', fetchCreativityBoost(userId, conversationId));

    const [expertResult, conversationHistory, creativityResult] = await Promise.all([
      expertRoutingPromise,
      conversationHistoryPromise,
      creativityBoostPromise,
    ]);
    hopLog('parallel_meta_done', {
      parallelMetaMs: Date.now() - parallelMetaStart,
      historyMsgs: conversationHistory?.length || 0,
      expertDomain: expertResult?.routingResult?.domain || null,
      ...legTimings,
    });

    const expertRoutingResult = expertResult?.routingResult || null;
    const expertMemories = expertResult?.expertMemories || [];
    if (expertRoutingResult?.expertId && expertRoutingResult.domain !== 'general') {
      chatLog(`Expert routing: ${expertRoutingResult.domain} (${expertRoutingResult.confidence}) → ${expertMemories.length} expert memories`);
    }

    // Additional-context assembly extracted to ../services/twinAdditionalContext.js.
    const additional = buildAdditionalContext({
      emotionalState,
      identityContext,
      calibrationContext,
      writingProfile,
      expertRoutingResult,
      expertMemories,
      memories,
      enrichmentContext,
      activeGoals,
      patterns,
      creativityResult,
      maxChars: MAX_ADDITIONAL_CONTEXT_CHARS,
    });
    const memoriesInContext = additional.memoriesInContext;
    if (additional.creativityLog) chatLog(additional.creativityLog);
    appendAdditionalContextToPrompt(systemPrompt, additional.additionalContext);

    // Google Workspace actions — inject available tools (already fetched in parallel above)
    let workspaceActionsEnabled = false;
    if (workspaceBlock) {
      systemPrompt.push({ type: 'text', text: `\n${workspaceBlock}` });
      workspaceActionsEnabled = true;
      chatLog('Workspace actions injected into system prompt');
    }

    // Conversational probes (proactive deep question + ambient interview hint)
    // extracted to ../services/twinConversationalProbes.js.
    await injectConversationalProbes({ userId, systemPrompt, conversationHistory, chatLog });

    // Log total system prompt size for monitoring
    const totalSystemChars = systemPrompt.reduce((sum, block) => sum + (block.text?.length || 0), 0);
    const estimatedTokens = Math.ceil(totalSystemChars / 4);
    log.info('System prompt built', { traceId, chars: totalSystemChars, estimatedTokens, historyMsgs: conversationHistory.length });
    hopLog('prompt_assembled', { chars: totalSystemChars, estTokens: estimatedTokens });

    // Task intent classification + system-prompt injection extracted to
    // ../services/taskIntentInjector.js.
    const taskIntent = injectTaskIntentBlocks({ userId, message, systemPrompt, personalityProfile });
    if (taskIntent.isTask && !taskIntent.routed) {
      log.debug('Task intent below routing threshold', {
        userId, taskType: taskIntent.taskType, confidence: taskIntent.confidence,
      });
    }

    // Smart routing: classify message complexity to select cheapest adequate model
    if (useSmartRouting) {
      const routing = classifyMessageTier(message, conversationHistory);
      routedModel = routing.model;
      routingTier = routing.tier;
      log.info('Smart routing', { tier: routing.tier, model: routing.model, reason: routing.reason, msgWords: message.trim().split(/\s+/).length });
    }

    // Send message via LLM Gateway
    let assistantMessage;
    const chatSource = 'direct';
    let llmMessages = [...conversationHistory, { role: 'user', content: message }];

    // Context condensation — replace truncation with intelligent summarization
    // Fires once when messages exceed threshold, preserving critical context
    try {
      llmMessages = await condenseIfNeeded(llmMessages, {
        thresholdTokens: 12000,
        recentTurnsToKeep: 8,
        userId
      });
    } catch (condenseErr) {
      log.warn('Context condensation failed (non-fatal)', { error: condenseErr.message });
    }

    // Message-type adaptive temperature: personality queries get cold (consistency),
    // creative/exploration gets warm (surprise), task queries stay neutral
    const tempDeltaByTier = routingTier === CHAT_TIER_LIGHT ? -0.05 : routingTier === CHAT_TIER_DEEP ? 0.05 : 0;

    // First LLM call extracted to ../services/twinFirstLlmCall.js. Helper
    // throws on gateway failure; route maps to the right HTTP/SSE response.
    const llmStart = Date.now();
    hopLog('llm_first_call_start', { tier: routingTier, model: routedModel });
    try {
      const firstCall = await runFirstLlmCall({
        isStreaming, systemPrompt, llmMessages, userId, routingTier, routedModel,
        personalityProfile, tempDeltaByTier, useNeurotransmitterModes,
        neurotransmitterMode, workspaceActionsEnabled, res, chatLog,
      });
      assistantMessage = firstCall.assistantMessage;
      // audit-2026-05-13 bottleneck follow-up: surface TTFT (time-to-first-
      // chunk) separately from totalMs so we can tell prefill-latency
      // bottlenecks (slow first token) from slow-generation bottlenecks
      // (fast first token, long stream). For a 47-char response taking
      // 43s, a 40s TTFT means prefill is the lever; a 2s TTFT means the
      // model is throttling generation somewhere downstream.
      hopLog('llm_first_call_done', {
        llmMs: Date.now() - llmStart,
        replyChars: assistantMessage?.length || 0,
        ttftMs: firstCall.ttftMs ?? null,
        totalLlmMs: firstCall.totalLlmMs ?? null,
      });
    } catch (llmError) {
      hopLog('llm_first_call_failed', { llmMs: Date.now() - llmStart, error: llmError?.message?.slice(0, 200) });
      stream.clearTimeoutTimer();
      if (stream.timedOut()) return;
      log.error('LLM Gateway failed', { error: llmError, streaming: isStreaming });
      const { isBilling } = classifyGatewayError(llmError);
      if (isStreaming) {
        try {
          res.write(`data: ${JSON.stringify({ type: 'error', error: isBilling ? 'Chat is temporarily unavailable due to API billing.' : 'Chat is temporarily unavailable.' })}\n\n`);
          res.end();
        } catch { /* client already gone */ }
        return;
      }
      return res.status(503).json({
        success: false,
        error: isBilling
          ? 'Chat is temporarily unavailable due to API billing. Please contact the administrator.'
          : 'Chat is temporarily unavailable. The AI provider is unreachable.',
        details: process.env.NODE_ENV === 'development' ? llmError.message : undefined,
      });
    }

    // Workspace action chain extracted to ../services/workspaceActionChain.js.
    if (workspaceActionsEnabled && assistantMessage) {
      const chainStart = Date.now();
      const chainResult = await runWorkspaceActionChain({
        userId,
        initialMessage: assistantMessage,
        llmMessages,
        systemPrompt,
        routedModel,
        isStreaming,
        res,
        chatLog,
        traceId,
        onChainStart: () => stream.extendTimeout(115000, 'Action took too long. Please try again.'),
      });
      assistantMessage = chainResult.assistantMessage;
      hopLog('action_chain_done', {
        chainMs: Date.now() - chainStart,
        depth: chainResult.chainDepth,
        degraded: chainResult.degraded || false,
      });
    }

    const llmMs = Date.now() - chatStartTime - contextBuildMs;
    log.info('Chat complete', {
      traceId,
      totalMs: Date.now() - chatStartTime,
      contextMs: contextBuildMs,
      llmMs,
    });
    hopLog('done', { totalMs: Date.now() - chatStartTime, contextMs: contextBuildMs, llmMs });

    // audit-2026-05-15 walkthrough finding: previously persistChatTurn was
    // awaited BEFORE writing the SSE done event. When a chat hit the 55s
    // controller timeout (long tool path), Vercel would kill the function
    // at 60s mid-persistence — the client saw streamed content but neither
    // the done event nor the DB rows landed (trace 91e82232 reproduced
    // this in the post-fix walkthrough — 746 chars streamed to client but
    // zero rows in mcp_conversation_logs or twin_messages).
    //
    // Reorder: send the SSE done event FIRST, then await persistence.
    // The client always gets their response, and persistence runs in the
    // remaining function budget. If Vercel kills the function mid-persist,
    // at least the client got their response. The function's HTTP response
    // can end while async work continues — Node keeps the function alive
    // until either: (a) async work completes, (b) Vercel SIGKILL at 60s.
    const responsePayload = {
      success: true,
      message: assistantMessage,
      conversationId: conversationId || null,
      chatSource,
      contextSources: {
        ...buildContextSourcesMeta(twinContext),
        neurotransmitterMode: neurotransmitterMode.mode !== 'default' ? neurotransmitterMode.mode : null,
        neuropil: neuropilResult.neuropilId || null,
      }
    };

    stream.clearTimeoutTimer();
    if (stream.timedOut()) return;

    if (res.destroyed || res.writableEnded) {
      log.warn('Response already closed (client timeout?) - skipping send');
    } else if (isStreaming) {
      res.write(`data: ${JSON.stringify({ type: 'done', ...responsePayload })}\n\n`);
      res.end();
    } else {
      // Non-streaming response handled below in the existing branch — keep
      // its res.json() call after persistence completes since the JSON
      // response IS the only thing the client gets in that mode.
    }

    // Persistence (LZ score, twin_messages rows, unified conversation log,
    // memory stream write) extracted to ../services/twinChatPersistence.js.
    // For streaming: client already has its response — this runs in the
    // function's remaining budget. For non-streaming: still awaited before
    // res.json() below since the client hasn't seen anything yet.
    const evalMode = req.headers['x-eval-mode'] === 'true';
    const persistPromise = persistChatTurn({
      userId, message, assistantMessage, conversationId, evalMode,
      routedModel, routingTier, systemPrompt, soulSignature, platformData,
      memories, writingProfile, chatSource,
      coldStartMs,
      memoryCount: memoriesInContext?.length ?? memories?.length ?? 0,
      // audit-2026-05-13 trace-id follow-up: persist hop timings so we can
      // diagnose the slow-tail bottleneck via Supabase queries instead of
      // truncated Vercel runtime logs.
      traceId,
      hopTimings,
    }).catch(err => {
      log.error('persistChatTurn failed', { traceId, error: err?.message });
      return { lzScore: null };
    });

    // Post-response side effects: run in parallel with persistence.
    // These don't block the client response in either mode.
    runPostResponseSideEffects({
      userId, message, assistantMessage, conversationId, memoriesInContext, evalMode,
    });

    if (proactiveInsights && proactiveInsights.length > 0) {
      markInsightsDelivered(proactiveInsights.map(i => i.id)).catch(err =>
        log.warn('Failed to mark insights delivered', { error: err })
      );
    }

    if (!evalMode) trackChatMessage(userId);

    // For non-streaming: await persistence before res.json() so any errors
    // surface in the response. Streaming already returned the SSE done
    // above; just await persistence here so the function keeps running
    // until persistence completes (or Vercel kills at 60s).
    await persistPromise;

    if (!isStreaming && !res.destroyed && !res.writableEnded) {
      res.json(responsePayload);
    }

  } catch (error) {
    stream?.clearTimeoutTimer();
    if (stream?.timedOut()) return;

    // Silently ignore write-after-close from client disconnects
    if (error.code === 'ERR_HTTP_HEADERS_SENT' || res.destroyed || res.writableEnded) {
      log.warn('Client disconnected before response could be sent');
      return;
    }

    log.error('Chat message error', { error });

    // If SSE headers already sent, write error event instead of JSON
    if (res.headersSent) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to process your message' })}\n\n`);
        res.end();
      } catch (_) { /* client gone */ }
      return;
    }

    // Handle specific error types
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please try again in a moment.',
        retryAfter: 60
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process your message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


export default router;
