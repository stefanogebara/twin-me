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
import { logAgentAction } from '../autonomyService.js';
import { createLogger } from '../logger.js';

const log = createLogger('WorkspaceActionParser');

/**
 * Tools that modify external state. These MUST go through user confirmation
 * before execution, regardless of autonomy level. This prevents prompt
 * injection from triggering write actions without user consent.
 */
const WRITE_TOOLS = Object.freeze([
  'gmail_send',
  'gmail_reply',
  'gmail_draft',
  'calendar_create',
  'calendar_modify_event',
  'calendar_delete_event',
  'docs_create',
  'docs_append',
  'sheets_create',
  'sheets_write',
  'drive_create_file',
]);

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
 * Check if a tool name is a write tool (modifies external state).
 */
export function isWriteTool(toolName) {
  return WRITE_TOOLS.includes(toolName);
}

/**
 * Execute a parsed action for a user.
 *
 * Write tools (gmail_send, calendar_create, etc.) are NEVER executed directly.
 * Instead, they are queued in agent_actions for user confirmation. This prevents
 * prompt injection attacks from triggering write actions without consent.
 *
 * Read tools execute immediately and return results inline.
 *
 * Returns { success, toolName, data, error, elapsedMs, pendingConfirmation?, actionId? }
 */
export async function executeAction(userId, action) {
  const startTime = Date.now();
  const { toolName, params } = action;

  // SECURITY GATE: Write tools require explicit user confirmation
  if (isWriteTool(toolName)) {
    log.info('Write tool intercepted — queuing for confirmation', { userId, tool: toolName });
    return queueWriteAction(userId, toolName, params);
  }

  // Read tools execute immediately
  return executeReadAction(userId, toolName, params, startTime);
}

/**
 * Queue a write action for user confirmation instead of executing it.
 * Stores the pending action in agent_actions and returns a confirmation-required result.
 */
async function queueWriteAction(userId, toolName, params) {
  try {
    const description = buildActionDescription(toolName, params);
    const actionRecord = await logAgentAction(userId, {
      skillName: toolName,
      actionType: 'draft',
      content: description,
      autonomyLevel: 2, // DRAFT_CONFIRM — always requires approval
      personalityContext: null,
      platformSources: [],
    });

    const actionId = actionRecord?.id || null;

    // Store tool params in proposed_action so executeApprovedAction can find them
    if (actionId) {
      const { supabaseAdmin } = await import('../database.js');
      await supabaseAdmin
        .from('agent_actions')
        .update({ proposed_action: JSON.stringify({ toolName, params }) })
        .eq('id', actionId);
    }

    // Derive department from tool prefix (e.g. gmail_send -> gmail)
    const department = toolName.split('_')[0] || 'workspace';

    log.info('Write action queued for confirmation', { userId, tool: toolName, actionId });

    return {
      success: true,
      pendingConfirmation: true,
      actionId,
      toolName,
      params,
      description,
      department,
      data: { message: `Action "${toolName}" requires your confirmation before executing.` },
      error: null,
      elapsedMs: 0,
    };
  } catch (err) {
    log.error('Failed to queue write action', { userId, tool: toolName, error: err.message });
    return {
      success: false,
      toolName,
      data: null,
      error: `Failed to queue action for confirmation: ${err.message}`,
      elapsedMs: 0,
    };
  }
}

/**
 * Execute a read-only tool immediately and return the result.
 */
async function executeReadAction(userId, toolName, params, startTime) {
  log.info('Executing read action', { userId, tool: toolName, params });

  try {
    const result = await executeTool(userId, toolName, params);
    const elapsedMs = Date.now() - startTime;
    log.info('Read action complete', { userId, tool: toolName, success: result.success, elapsedMs });

    return {
      success: result.success !== false,
      toolName,
      data: result.success !== false ? (result.data || result) : null,
      error: result.success === false ? (result.error || result.message) : null,
      elapsedMs,
    };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    log.error('Read action failed', { userId, tool: toolName, error: err.message, elapsedMs });
    return {
      success: false,
      toolName,
      data: null,
      error: err.message,
      elapsedMs,
    };
  }
}

/**
 * Build a human-readable description of the action for the confirmation UI.
 */
function buildActionDescription(toolName, params) {
  const descriptions = {
    gmail_send: () => `Send email to ${params.to}: "${params.subject}"`,
    gmail_reply: () => `Reply to email ${params.messageId}`,
    gmail_draft: () => `Create draft to ${params.to}: "${params.subject}"`,
    calendar_create: () => `Create event: "${params.summary}" at ${params.start}`,
    calendar_modify_event: () => `Modify event ${params.eventId}`,
    calendar_delete_event: () => `Delete event ${params.eventId}`,
    docs_create: () => `Create document: "${params.title}"`,
    docs_append: () => `Append to document ${params.docId}`,
    sheets_create: () => `Create spreadsheet: "${params.title}"`,
    sheets_write: () => `Write to spreadsheet ${params.spreadsheetId}`,
    drive_create_file: () => `Create file: "${params.name}"`,
  };

  const builder = descriptions[toolName];
  return builder ? builder() : `Execute ${toolName}`;
}

/**
 * Format action results as a context block for the LLM follow-up call.
 * Truncates large results to prevent token bloat.
 */
export function formatActionResult(result) {
  const MAX_RESULT_CHARS = 4000;

  // Write actions queued for confirmation — tell the LLM to inform the user
  if (result.pendingConfirmation) {
    return `[ACTION RESULT: ${result.toolName} — PENDING CONFIRMATION]\nThis action requires user confirmation before it can be executed. The action has been queued (ID: ${result.actionId}). Tell the user what you intend to do and that they need to confirm it. Do NOT pretend the action was completed.`;
  }

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
