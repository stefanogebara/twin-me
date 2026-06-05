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
import { supabaseAdmin } from '../services/database.js';
import { buildContextSourcesMeta } from '../services/twinContextBuilder.js';
import { classifyNeuropil } from '../services/neuropilRouter.js';
import { classifyQueryDomain, retrieveExpertMemories } from '../services/platformExperts.js';
import { markInsightsDelivered } from '../services/proactiveInsights.js';
import { trackChatMessage } from '../services/twinSessionTracker.js';
import { classifyMessageTier, CHAT_TIER_LIGHT, CHAT_TIER_DEEP } from '../services/chatRouter.js';
import { detectWhoopIntent } from '../services/whoop/detectIntent.js';
import { detectSpotifyIntent } from '../services/spotify/detectIntent.js';
import { detectCalendarIntent } from '../services/calendar/detectIntent.js';
import { detectGithubIntent } from '../services/github/detectIntent.js';
import { detectYoutubeIntent } from '../services/youtube/detectIntent.js';
import { detectGmailIntent } from '../services/gmail/detectIntent.js';
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

    // audit-2026-05-26 C1: enforce conversationId ownership before any
    // read or write touches the conversation. Previously fetchConversationHistory
    // checked ownership for READS (silently returning [] when not owned) but
    // persistChatTurn would still INSERT into that conversation_id, letting
    // an authenticated user plant messages into another user's chat history
    // given a leaked conversation_id. Soft fallback: drop the unowned id so
    // autoCreateConversation creates a fresh row owned by the caller.
    const CONVERSATION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (conversationId) {
      if (!CONVERSATION_UUID_RE.test(conversationId)) {
        log.warn('Invalid conversationId format, dropping', { traceId, userId });
        conversationId = null;
      } else {
        const { data: owned } = await supabaseAdmin
          .from('twin_conversations')
          .select('id')
          .eq('id', conversationId)
          .eq('user_id', userId)
          .maybeSingle();
        if (!owned) {
          log.warn('conversationId not owned by caller, dropping', { traceId, userId });
          conversationId = null;
        }
      }
    }

    // Audit bug H4: create the conversation row only AFTER pre-flight
    // gates pass. Avoids orphan conversations on rate-limit / quota / paywall
    // rejections.
    //
    // Audit 2026-05-22: still seeing 80.5% of conversations EMPTY for the
    // test user (342 of 425 rows). H4 stopped pre-flight rejections from
    // creating ghosts, but anything that throws AFTER autoCreateConversation
    // and BEFORE persistChatTurn (LLM timeout, tool-use error, SSE write
    // failure, context-builder crash) still leaves an empty conversation.
    // Track createdHere so the catch block can clean it up.
    let conversationCreatedHere = false;
    if (!conversationId) {
      conversationId = await autoCreateConversation(userId, message);
      conversationCreatedHere = !!conversationId;
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
    // The Whoop analytics merge (when intent fires) happens INSIDE
    // fetchTwinContext on a shallow-copied platformData. By the time
    // we destructure here, platformData.whoop already carries analytics
    // for the current turn — twinPromptAssembly → buildTwinSystemPrompt
    // see it via w.analytics.summary. No additional merge needed.
    const { soulSignature, platformData, writingProfile, memories, twinSummary, proactiveInsights, enrichmentContext, voiceExamples, activeGoals, patterns, identityContext, calibrationContext, nudgeHistory, departmentProposals, directives } = twinContext;

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
    // extracted to ../services/twinPromptAssembly.js. Directives (pi-reflect)
    // are pulled out of twinContext inside the assembler and forwarded into
    // buildTwinSystemPrompt — no extra arg needed here.
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

    // audit-2026-05-23 #1 (CRITICAL): expert routing was sitting on the critical
    // path. classifyQueryDomain falls back to a Mistral LLM call for ambiguous
    // queries (platformExperts.js:380), which observed in Stefano's traces
    // as 15.2s of wall time on a single turn. Race against a 1500ms budget —
    // if classification hasn't returned by then, skip expert routing entirely.
    // The chat still works (just without per-platform expert memories), and
    // we reclaim ~13s on every slow-classification turn.
    const EXPERT_ROUTING_BUDGET_MS = 1500;
    const expertRoutingPromise = useExpertRouting
      ? timeLeg('expertRoutingMs', Promise.race([
          classifyQueryDomain(message)
            .then(async (routingResult) => {
              if (routingResult.expertId && routingResult.domain !== 'general') {
                const expertMems = await retrieveExpertMemories(userId, routingResult.expertId, message, 6);
                return { routingResult, expertMemories: expertMems };
              }
              return { routingResult, expertMemories: [] };
            }),
          new Promise(resolve => setTimeout(() => resolve(null), EXPERT_ROUTING_BUDGET_MS)),
        ])
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
    // Gate workspace actions OFF the prompt for analytical Whoop
    // questions. Caught 2026-06-03 via Playwright verify + Supabase
    // twin_response inspection: haiku saw "show me my last workouts"
    // and reached for the workspace `github_list_prs` tool ("You've
    // got 10 open PRs..."), and saw "how is my recovery trending..."
    // and pivoted to MEETING_PREP, both times ignoring the Whoop
    // analytics that was sitting right in the prompt. Removing the
    // workspace tool catalog from the prompt eliminates the
    // competing affordance — the only data path available to the
    // model is the Whoop analytics line.
    //
    // Snapshot intent stays workspace-enabled because a question like
    // "what's on my plate today" wants both calendar AND today's
    // recovery; we only suppress for trend / weekly / compare /
    // workouts intents where the user is explicitly asking for the
    // Whoop numbers we just computed.
    const gateIntents = {
      whoop: detectWhoopIntent(message),
      spotify: detectSpotifyIntent(message),
      calendar: detectCalendarIntent(message),
      github: detectGithubIntent(message),
      youtube: detectYoutubeIntent(message),
      gmail: detectGmailIntent(message),
    };
    const suppressingPlatform = Object.entries(gateIntents).find(
      ([, v]) => v.kind && v.kind !== 'snapshot',
    );
    const suppressWorkspaceForAnalytics = !!suppressingPlatform;
    if (workspaceBlock && !suppressWorkspaceForAnalytics) {
      systemPrompt.push({ type: 'text', text: `\n${workspaceBlock}` });
      workspaceActionsEnabled = true;
      chatLog('Workspace actions injected into system prompt');
    } else if (workspaceBlock && suppressWorkspaceForAnalytics) {
      const [name, val] = suppressingPlatform;
      chatLog(`Workspace actions suppressed — ${name} ${val.kind} intent`);
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

      // Bump tier for analytical Whoop questions.
      //
      // First try (2026-06-03): chat_light → CHAT_TIER_DEEP
      // (deepseek-v3.2). Caught a regression in the Playwright verify
      // the same day — DeepSeek hallucinated tool-call syntax instead
      // of using the data in its prompt, emitting strings like
      // `[ACTION: whoop_data query="HRV trend" days=30]` for the
      // recovery 14d and HRV 30d questions. Workouts/weekly/strain
      // worked fine; trend specifically regressed.
      //
      // Switched to claude-haiku-4.5 — still ~4x cheaper than the
      // earlier sonnet-4.6 override ($0.80/$4 vs $3/$15 per M), and
      // it's a modern Claude that follows the "use these exact numbers"
      // directive without hallucinating tool calls. Already lives in
      // the codebase as CLAUDE_MODEL_BACKGROUND.
      //
      // Snapshot questions still get chat_light's gemini-flash since
      // they don't depend on directive following.
      const platformIntents = {
        whoop: detectWhoopIntent(message),
        spotify: detectSpotifyIntent(message),
        calendar: detectCalendarIntent(message),
        github: detectGithubIntent(message),
        youtube: detectYoutubeIntent(message),
        gmail: detectGmailIntent(message),
      };
      const isAnalyticalPlatformQuestion = Object.values(platformIntents).some(
        (i) => i.kind && i.kind !== 'snapshot',
      );
      if (isAnalyticalPlatformQuestion) {
        const overrideModel = 'anthropic/claude-haiku-4.5';
        const overrideTier = CHAT_TIER_DEEP;
        log.info('Platform analytics override — bumping chat tier', {
          fromTier: routingTier,
          fromModel: routedModel,
          toTier: overrideTier,
          toModel: overrideModel,
          intents: Object.fromEntries(
            Object.entries(platformIntents)
              .filter(([, v]) => v.kind && v.kind !== 'snapshot')
              .map(([k, v]) => [k, v.kind]),
          ),
        });
        routedModel = overrideModel;
        routingTier = overrideTier;
      }
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
        // audit-2026-05-29: the turn's start timestamp lets the chain bound each
        // tool to the time REMAINING in the 58s SSE budget (see onChainStart
        // below) instead of a fixed per-tool cap, so a chained 2nd/3rd action
        // can't push the turn past the controller deadline.
        chatStartTime,
        // audit-2026-05-26 H1: was extendTimeout(115000) -- dead code since
        // vercel.json maxDuration is 60s and api/server.js caps /chat/message
        // at 60000ms. The lambda was hard-killed at 60s long before the 115s
        // timer fired, so users running a workspace action chain saw a generic
        // connection-reset instead of the friendly copy below. Bump from the
        // 55s default to 58s so the chain has 3s extra room while still
        // leaving 2s for a clean SSE error event before the platform pulls
        // the plug.
        onChainStart: () => stream.extendTimeout(58000, 'Action took too long. Please try again.'),
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

    // Persistence (LZ score, twin_messages rows, unified conversation log,
    // memory stream write) extracted to ../services/twinChatPersistence.js.
    const evalMode = req.headers['x-eval-mode'] === 'true';
    const { lzScore: responseLzScore, messagesInserted } = await persistChatTurn({
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
    });
    // audit-2026-05-26 H2: messages were either persisted or silently failed.
    // On silent failure, persistChatTurn swallowed the error so the route
    // does NOT throw -- the user got a valid LLM response and the chat UX
    // should still complete. But the twin_conversations row created earlier
    // in this turn now has zero messages attached: same orphan pattern the
    // 2026-05-22 audit caught (80.5% empty rows). Clean it up inline, then
    // null the id so the response doesn't reference a deleted conversation.
    if (messagesInserted) {
      conversationCreatedHere = false;
    } else if (conversationCreatedHere && conversationId) {
      log.warn('twin_messages insert failed; deleting empty conversation', {
        traceId, conversationId,
      });
      supabaseAdmin
        .from('twin_conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId)
        .then(({ error: delErr }) => {
          if (delErr) log.warn('Inline orphan cleanup failed', { conversationId, error: delErr.message });
        });
      conversationId = null;
      conversationCreatedHere = false;
    }

    // Post-response side effects extracted to twinChatPipeline.js.
    runPostResponseSideEffects({
      userId, message, assistantMessage, conversationId, memoriesInContext, evalMode,
    });

    // Mark proactive insights as delivered (non-blocking)
    if (proactiveInsights && proactiveInsights.length > 0) {
      markInsightsDelivered(proactiveInsights.map(i => i.id)).catch(err =>
        log.warn('Failed to mark insights delivered', { error: err })
      );
    }

    if (!evalMode) trackChatMessage(userId);

    // Return response
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
      res.json(responsePayload);
    }

  } catch (error) {
    stream?.clearTimeoutTimer();
    // Audit 2026-05-22: delete the orphan conversation row we created
    // earlier in this request if persistence never ran. Without this,
    // every LLM timeout / tool-error / SSE-write failure leaves an
    // empty twin_conversations row behind. Best-effort — never re-throw
    // from cleanup since we're already in the error path.
    if (conversationCreatedHere && conversationId) {
      supabaseAdmin
        .from('twin_conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId)
        .then(({ error: delErr }) => {
          if (delErr) log.warn('Orphan conversation cleanup failed', { conversationId, error: delErr.message });
        });
    }
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
