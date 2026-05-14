/**
 * Workspace Action Chain
 * ======================
 * Runs the [ACTION: tool_name(...)] chaining loop after the twin has produced
 * its first response. Detects action tags, executes the tool, feeds the
 * result back to the LLM as a follow-up turn, and repeats up to
 * MAX_ACTION_CHAIN_DEPTH times. Buffering each follow-up response keeps raw
 * [ACTION: ...] tags from leaking to the client mid-stream.
 *
 * Pending-confirmation actions (write actions) break the chain after the
 * first execution; the user must approve before the twin can continue.
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { complete, stream as streamLLM, TIER_CHAT } from './llmGateway.js';
import { parseActions, executeAction, formatActionResult, stripActionTags } from './tools/workspaceActionParser.js';
import { createLogger } from './logger.js';

const log = createLogger('WorkspaceActionChain');

const MAX_ACTION_CHAIN_DEPTH = 3;

// audit-2026-05-13 follow-up: 30s budget per tool execution. The
// talk-to-twin live audit found ~26% of tool-routed queries hitting
// the previous 50s stream timeout — many of those were single slow
// tool calls (recovery score, transaction lookup) hanging the whole
// chat turn. Bounding each tool keeps a slow data lookup from killing
// the conversation. On timeout, we feed a synthetic "timed out" result
// back to the LLM so it can degrade gracefully ("couldn't pull X this
// time, but...") rather than the user seeing a hard stream-close error.
const TOOL_EXECUTION_TIMEOUT_MS = 30000;

/**
 * Race a promise against a deadline. Resolves with the promise value or
 * rejects with a tagged TOOL_TIMEOUT error. The cancel timer always
 * clears regardless of which side wins.
 */
function withTimeout(promise, ms, tag) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`tool timeout: ${tag} exceeded ${ms}ms`);
      err.code = 'TOOL_TIMEOUT';
      err.tag = tag;
      err.budgetMs = ms;
      reject(err);
    }, ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    deadline,
  ]);
}

/**
 * Build the synthetic result block that gets fed to the follow-up LLM
 * call when a tool exceeds its budget. The phrasing is deliberately
 * direct so the twin says "I couldn't fetch X this time" rather than
 * trying to make up the missing data.
 */
function buildTimeoutResultBlock(toolName, budgetMs) {
  return [
    `TOOL_RESULT [${toolName}]: TIMED OUT after ${Math.round(budgetMs / 1000)}s.`,
    'The data lookup did not return in time. Do NOT invent or guess the data.',
    'Acknowledge briefly that you could not fetch this and continue with what you already know about the user. Suggest they retry if they specifically need this data point.',
  ].join('\n');
}

const FOLLOW_UP_FORMATTING_INSTRUCTIONS = [
  'Incorporate these results using this EXACT format:',
  '- Use a plain text heading for the topic (no emojis)',
  '- **Bold** all sender names, subjects, event titles, file names',
  '- Use numbered list (1. 2. 3.) for multiple items, ordered by importance',
  '- Keep each item to one line with the key info',
  "- If the user's original request requires another action (e.g. they asked to read an email AND schedule something), emit the next [ACTION: ...] immediately — don't ask for permission again",
  '- Only offer "Want me to [specific action]?" if the user hasn\'t already asked for that next step',
  '- NEVER use emojis anywhere in the response',
  '',
  'Example:',
  "**Today's important emails**",
  '1. **Presidencia (Telefonica)** — "BPS/CGH - Stefano" — flight bookings with **Christian Mauad Gebara**',
  '2. **BTG Pactual** — Bitcoin purchase confirmed, **R$ 4,918.41**',
  '3. **Meta** — WhatsApp template recategorized to MARKETING',
  '',
  'Want me to read any of these in detail?',
].join('\n');

/**
 * Run the workspace action chain. Returns the (possibly transformed)
 * assistant message after all actions have executed and tags have been
 * stripped. If no actions are detected, returns the input unchanged.
 */
export async function runWorkspaceActionChain({
  userId,
  initialMessage,
  llmMessages,
  systemPrompt,
  routedModel,
  isStreaming,
  res,
  chatLog,
  traceId,
  onChainStart,
}) {
  let assistantMessage = initialMessage;
  let chainDepth = 0;
  let degraded = false;
  let detectedActions = parseActions(assistantMessage);

  if (detectedActions.length === 0) {
    return { assistantMessage, chainDepth, degraded };
  }

  if (typeof onChainStart === 'function') onChainStart();

  const actionHistory = [];

  while (detectedActions.length > 0 && chainDepth < MAX_ACTION_CHAIN_DEPTH) {
    const action = detectedActions[0];
    chainDepth++;
    chatLog?.(`Workspace action detected (chain ${chainDepth}/${MAX_ACTION_CHAIN_DEPTH}): ${action.toolName}`);

    try {
      if (isStreaming) {
        try { res.write(`data: ${JSON.stringify({ type: 'action_start', tool: action.toolName, params: action.params })}\n\n`); } catch { /* ignore */ }
      }

      // audit-2026-05-13 follow-up: bound each tool to 30s. A single slow
      // data lookup used to hang the whole chat stream until the 55s
      // controller timeout fired, leaving the user with a "try again"
      // error and no twin response at all. With the budget, we now feed
      // a synthetic "timed out" result back to the LLM so the twin can
      // degrade gracefully and keep the conversation flowing.
      let actionResult;
      try {
        actionResult = await withTimeout(
          executeAction(userId, action),
          TOOL_EXECUTION_TIMEOUT_MS,
          action.toolName,
        );
      } catch (timeoutErr) {
        if (timeoutErr.code !== 'TOOL_TIMEOUT') throw timeoutErr;
        log.warn('Tool execution exceeded budget — degrading', {
          traceId, userId, tool: action.toolName, budgetMs: TOOL_EXECUTION_TIMEOUT_MS,
        });
        degraded = true;
        actionResult = {
          success: false,
          timedOut: true,
          degraded: true,
          elapsedMs: TOOL_EXECUTION_TIMEOUT_MS,
          data: null,
          error: 'tool_execution_timeout',
          // Pre-formatted block so we don't try to render an empty payload
          // through formatActionResult (which expects success data).
          _resultBlockOverride: buildTimeoutResultBlock(action.toolName, TOOL_EXECUTION_TIMEOUT_MS),
        };
      }
      const resultBlock = actionResult._resultBlockOverride || formatActionResult(actionResult);

      if (isStreaming) {
        const actionEvent = actionResult.pendingConfirmation
          ? {
              type: 'action_pending_confirmation',
              tool: action.toolName,
              actionId: actionResult.actionId,
              params: actionResult.params,
              description: actionResult.description || `Action "${action.toolName}" requires your approval`,
              department: actionResult.department || action.toolName.split('_')[0] || 'workspace',
            }
          : {
              type: 'action_result',
              tool: action.toolName,
              success: actionResult.success,
              data: actionResult.data,
              elapsedMs: actionResult.elapsedMs,
              // Surface degradation to the client so the UI can render
              // a "data lookup timed out" badge instead of a generic
              // failure or, worse, hiding the failure entirely.
              ...(actionResult.timedOut && { timedOut: true }),
              ...(actionResult.degraded && { degraded: true }),
            };
        try { res.write(`data: ${JSON.stringify(actionEvent)}\n\n`); } catch { /* ignore */ }
      }

      actionHistory.push({ role: 'assistant', content: assistantMessage });
      actionHistory.push({
        role: 'user',
        content: `${resultBlock}\n\n${FOLLOW_UP_FORMATTING_INSTRUCTIONS}`,
      });

      const followUpMessages = [...llmMessages, ...actionHistory];

      const followUp = isStreaming
        ? await streamLLM({
            tier: TIER_CHAT,
            system: systemPrompt,
            messages: followUpMessages,
            maxTokens: 2048,
            temperature: 0.7,
            userId,
            serviceName: 'twin-chat:workspace-followup',
            modelOverride: routedModel,
            onChunk: () => {},
          })
        : await complete({
            tier: TIER_CHAT,
            system: systemPrompt,
            messages: followUpMessages,
            maxTokens: 2048,
            temperature: 0.7,
            userId,
            serviceName: 'twin-chat:workspace-followup',
            modelOverride: routedModel,
          });
      assistantMessage = followUp.content || assistantMessage;
      chatLog?.(`Workspace follow-up LLM call complete (chain ${chainDepth})`);

      if (actionResult.pendingConfirmation) {
        detectedActions = [];
      } else if (actionResult.timedOut) {
        // Don't chain another tool call after a budget overrun — the
        // follow-up LLM call above already produced the graceful "I
        // couldn't fetch this" response. Chaining further on missing
        // data would burn more time without recovering the lost info.
        detectedActions = [];
      } else {
        detectedActions = parseActions(assistantMessage);
      }
    } catch (actionErr) {
      log.warn('Workspace action execution failed (non-fatal)', {
        traceId,
        error: actionErr.message,
        tool: action.toolName,
        chainDepth,
      });
      detectedActions = [];
    }
  }

  assistantMessage = stripActionTags(assistantMessage);
  if (isStreaming && chainDepth > 0) {
    try { res.write(`data: ${JSON.stringify({ type: 'chunk', content: assistantMessage })}\n\n`); } catch { /* ignore */ }
  }

  return { assistantMessage, chainDepth, degraded };
}
