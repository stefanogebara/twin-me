/**
 * Workspace Action Parser — Detect and Execute Tool Calls in Twin Responses
 * ==========================================================================
 * Parses LLM responses for [ACTION: tool_name key="value" ...] triggers,
 * executes the tool via the tool registry, and returns structured results.
 *
 * This avoids needing native tool calling support in the LLM gateway — works
 * with any model by using prompt engineering + response parsing.
 *
 * Pattern: [ACTION: gmail_search query="from:john newer_than:2d"]
 *          [ACTION: calendar_today]
 *          [ACTION: gmail_read messageId="abc123"]
 */

import { executeTool, getAvailableTools } from '../toolRegistry.js';
import { GOOGLE_WORKSPACE_TOOL_NAMES } from './googleWorkspaceTools.js';
import { createLogger } from '../logger.js';

const log = createLogger('WorkspaceActionParser');

/**
 * Regex to match [ACTION: tool_name key="value" key2="value2" ...]
 * Captures:
 *   group 1 = tool name
 *   group 2 = raw param string (key="value" pairs)
 */
const ACTION_REGEX = /\[ACTION:\s*(\w+)(?:\s+((?:\w+="[^"]*"\s*)*))?\]/g;

/**
 * Parse key="value" pairs from the raw param string.
 */
function parseParams(rawParams) {
  if (!rawParams || !rawParams.trim()) return {};
  const params = {};
  const paramRegex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = paramRegex.exec(rawParams)) !== null) {
    const key = match[1];
    let value = match[2];
    // Auto-coerce numbers
    if (/^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    params[key] = value;
  }
  return params;
}

/**
 * Check if any Google Workspace platforms are connected for a user.
 * Returns the set of connected workspace platform names.
 */
export async function getConnectedWorkspacePlatforms(userId) {
  const allTools = await getAvailableTools(userId);
  const workspaceConnected = new Set();
  for (const tool of allTools) {
    if (GOOGLE_WORKSPACE_TOOL_NAMES.includes(tool.name)) {
      workspaceConnected.add(tool.platform);
    }
  }
  return workspaceConnected;
}

/**
 * Build the [AVAILABLE ACTIONS] prompt block listing what the twin can do.
 * Only includes tools for platforms the user has actually connected.
 */
export async function buildWorkspaceActionsPrompt(userId) {
  const allTools = await getAvailableTools(userId);
  const workspaceTools = allTools.filter(t => GOOGLE_WORKSPACE_TOOL_NAMES.includes(t.name));

  if (workspaceTools.length === 0) return null;

  const toolLines = workspaceTools.map(t => {
    const paramDesc = t.parameters?.properties
      ? Object.entries(t.parameters.properties)
          .map(([k, v]) => {
            const required = t.parameters.required?.includes(k);
            return `${k}${required ? '' : '?'}="${v.description}"`;
          })
          .join(' ')
      : '';
    return `  - ${t.name}: ${t.description}${paramDesc ? `\n    Params: ${paramDesc}` : ''}`;
  }).join('\n');

  return `[AVAILABLE ACTIONS — Google Workspace]
You have access to the user's Google Workspace. When answering questions about their emails, calendar, files, or contacts, you can look up real data.

To use an action, include it in your response EXACTLY like this:
[ACTION: tool_name key="value"]

RULES:
- Use actions when the user asks about their emails, schedule, files, or contacts
- You can use ONE action per response. After you get results, you may use another.
- For read actions, include the action tag right away — you'll receive the results to incorporate into your response.
- For write actions (gmail_send, gmail_reply, gmail_draft, calendar_create, docs_create, sheets_create), confirm with the user first. When they confirm (e.g., "yes", "go ahead", "do it"), immediately execute the action with the [ACTION] tag.
- Only use actions you have access to (listed below)
- If an action fails, explain the error naturally — don't retry automatically

Available actions:
${toolLines}

Examples:
  User: "Do I have any emails from Sarah?"
  You: Let me check your inbox. [ACTION: gmail_search query="from:sarah newer_than:7d"]

  User: "What's on my calendar today?"
  You: [ACTION: calendar_today]

  User: "Find that document about the project proposal"
  You: [ACTION: drive_search query="project proposal"]

  User: "Create a meeting with John tomorrow at 2pm"
  You: I'll create "Meeting with John" for tomorrow at 2:00 PM. Should I go ahead?
  User: "yes"
  You: Done! [ACTION: calendar_create summary="Meeting with John" start="2026-03-27T14:00:00" end="2026-03-27T15:00:00"]

  User: "Draft an email to sarah@example.com about the project update"
  You: I'll draft that for you. [ACTION: gmail_draft to="sarah@example.com" subject="Project Update" body="Hi Sarah, ..."]`;
}

/**
 * Parse a twin response for action triggers. Returns array of parsed actions.
 * Each action: { toolName, params, fullMatch, startIndex, endIndex }
 */
export function parseActions(responseText) {
  if (!responseText) return [];

  const actions = [];
  let match;
  // Reset regex state
  ACTION_REGEX.lastIndex = 0;
  while ((match = ACTION_REGEX.exec(responseText)) !== null) {
    const toolName = match[1];
    const rawParams = match[2] || '';
    // Only parse workspace tools — ignore unknown tool names
    if (!GOOGLE_WORKSPACE_TOOL_NAMES.includes(toolName)) {
      log.debug('Ignoring unknown tool in action tag', { toolName });
      continue;
    }
    actions.push({
      toolName,
      params: parseParams(rawParams),
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  return actions;
}

/**
 * Execute a parsed action for a user.
 * Returns { success, toolName, data, error, elapsedMs }
 */
export async function executeAction(userId, action) {
  const startTime = Date.now();
  log.info('Executing workspace action', { userId, tool: action.toolName, params: action.params });

  try {
    const result = await executeTool(userId, action.toolName, action.params);
    const elapsedMs = Date.now() - startTime;
    log.info('Workspace action complete', { userId, tool: action.toolName, success: result.success, elapsedMs });

    return {
      success: result.success !== false,
      toolName: action.toolName,
      data: result.success !== false ? (result.data || result) : null,
      error: result.success === false ? (result.error || result.message) : null,
      elapsedMs,
    };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    log.error('Workspace action failed', { userId, tool: action.toolName, error: err.message, elapsedMs });
    return {
      success: false,
      toolName: action.toolName,
      data: null,
      error: err.message,
      elapsedMs,
    };
  }
}

/**
 * Format action results as a context block for the LLM follow-up call.
 * Truncates large results to prevent token bloat.
 */
export function formatActionResult(result) {
  const MAX_RESULT_CHARS = 4000;

  if (!result.success) {
    return `[ACTION RESULT: ${result.toolName} — FAILED]\nError: ${result.error || 'Unknown error'}`;
  }

  let dataStr;
  try {
    dataStr = JSON.stringify(result.data, null, 2);
  } catch {
    dataStr = String(result.data);
  }

  if (dataStr.length > MAX_RESULT_CHARS) {
    dataStr = dataStr.substring(0, MAX_RESULT_CHARS) + '\n... (truncated)';
  }

  return `[ACTION RESULT: ${result.toolName} — SUCCESS (${result.elapsedMs}ms)]\n${dataStr}`;
}

/**
 * Strip action tags from the response text (for the final user-facing message).
 * Replaces [ACTION: ...] with empty string so user sees clean text.
 */
export function stripActionTags(responseText) {
  if (!responseText) return responseText;
  ACTION_REGEX.lastIndex = 0;
  return responseText.replace(ACTION_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
}
