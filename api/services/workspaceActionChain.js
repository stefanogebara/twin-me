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
  onChainStart,
}) {
  let assistantMessage = initialMessage;
  let chainDepth = 0;
  let detectedActions = parseActions(assistantMessage);

  if (detectedActions.length === 0) {
    return { assistantMessage, chainDepth };
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

      const actionResult = await executeAction(userId, action);
      const resultBlock = formatActionResult(actionResult);

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
          : { type: 'action_result', tool: action.toolName, success: actionResult.success, data: actionResult.data, elapsedMs: actionResult.elapsedMs };
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
      } else {
        detectedActions = parseActions(assistantMessage);
      }
    } catch (actionErr) {
      log.warn('Workspace action execution failed (non-fatal)', {
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

  return { assistantMessage, chainDepth };
}
