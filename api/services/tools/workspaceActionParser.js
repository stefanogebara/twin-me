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
import { EXTENDED_TOOL_NAMES } from './extendedTools.js';
import { logAgentAction } from '../autonomyService.js';
import { createLogger } from '../logger.js';

const ALL_ACTION_TOOL_NAMES = [...GOOGLE_WORKSPACE_TOOL_NAMES, ...EXTENDED_TOOL_NAMES];

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
  'spotify_queue',
  'spotify_play_track',
]);

/**
 * Regex to match [ACTION: tool_name key="value" key2="value2" ...]
 * Captures:
 *   group 1 = tool name
 *   group 2 = raw param string (everything between tool name and closing ])
 */
const ACTION_REGEX = /\[ACTION:\s*(\w+)([^\]]*)\]/g;

/**
 * Parse key="value" or key=value pairs from the raw param string.
 * Handles both quoted strings and unquoted values (e.g. days=1).
 */
function parseParams(rawParams) {
  if (!rawParams || !rawParams.trim()) return {};
  const params = {};
  const paramRegex = /(\w+)=(?:"([^"]*)"|([\S]+))/g;
  let match;
  while ((match = paramRegex.exec(rawParams)) !== null) {
    const key = match[1];
    let value = match[2] !== undefined ? match[2] : match[3];
    if (/^\d+$/.test(value)) value = parseInt(value, 10);
    else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
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
  const workspaceTools = allTools.filter(t => ALL_ACTION_TOOL_NAMES.includes(t.name));

  if (workspaceTools.length === 0) return null;

  // Fetch user's timezone for the prompt so the LLM uses local times
  let userTimezone = 'UTC';
  let localNow = '';
  let tomorrowDate = '';
  try {
    const { supabaseAdmin } = await import('../database.js');
    const { data } = await supabaseAdmin
      .from('users')
      .select('timezone')
      .eq('id', userId)
      .single();
    if (data?.timezone) {
      userTimezone = data.timezone;
    }
  } catch { /* non-fatal */ }

  try {
    const now = new Date();
    localNow = now.toLocaleString('en-CA', { timeZone: userTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(', ', 'T');
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrowDate = tomorrow.toLocaleDateString('en-CA', { timeZone: userTimezone }); // YYYY-MM-DD
  } catch { /* non-fatal */ }

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

TIMEZONE CONTEXT: The user is in ${userTimezone}. Current local time: ${localNow}. Tomorrow's date: ${tomorrowDate}.

CALENDAR DATETIME RULE: When creating or modifying events, ALWAYS use local time WITHOUT a Z suffix. Example for 3pm tomorrow: "${tomorrowDate}T15:00:00" (NOT "${tomorrowDate}T15:00:00Z"). The timezone (${userTimezone}) is applied automatically — never append Z or a UTC offset.

CALENDAR EVENT IDs: Events in your context appear with [eventId:XXXX] tags (e.g. "Tênis Segovia [eventId:abc123]"). Use the value inside [eventId:...] directly as the eventId param for calendar_modify_event or calendar_delete_event — no lookup needed.

To use an action, include it in your response EXACTLY like this:
[ACTION: tool_name key="value"]

RULES:
- MEETING PREP (HIGHEST PRIORITY): Meeting questions ALWAYS go through a meeting action — NEVER answer them from calendar context alone. The calendar context shows that an event EXISTS; it does NOT tell you whether the twin has already briefed it. Answering "you're not prepped" from calendar context is WRONG and misleads the user. There are TWO meeting actions — pick by intent:
  - get_meeting_prep — for BROAD questions about meetings or readiness: "what meetings do I have?", "what's my prep for tomorrow?", "am I prepped?", "am I ready for this week?", "what's coming up?", "what's on my plate?". It reads the briefings the twin has ALREADY generated (fast — no regeneration). Pass timeframe="upcoming" (default), "recent" (meetings that ended), or "all".
  - meeting_prep — for prepping ONE SPECIFIC meeting: "prep me for [meeting]", "brief me on [meeting]", "what should I know about my call with X". It generates a FRESH deep briefing for that one meeting. Always pass BOTH eventId (from [eventId:...] tags) AND summary so it can fall back gracefully. Even if there are NO calendar events visible (disconnected/expired token), still use meeting_prep with just a summary. If you see "Dimension Prep Notes" in the calendar, IGNORE it and use meeting_prep — it does deeper independent research.
  NEVER search Gmail for meeting prep. When unsure which to use: broad/plural/"am I ready" → get_meeting_prep; one named meeting → meeting_prep.
- Use actions when the user asks about their emails, schedule, files, contacts, GitHub, Spotify, or anything requiring real-time information
- Use web_search for any question that requires current facts, news, or background on a person/company
- You can use ONE action per response. After you get results, you may use another.
- For read actions, include the action tag right away — you'll receive the results to incorporate into your response.
- For write actions (gmail_send, gmail_reply, gmail_draft, calendar_create, calendar_modify_event, calendar_delete_event, docs_create, sheets_create, spotify_queue, spotify_play_track), confirm with the user first. When they confirm (e.g., "yes", "go ahead", "do it"), immediately execute the action with the [ACTION] tag.
- SPOTIFY URI RULE: spotify_queue and spotify_play_track REQUIRE a real Spotify URI (spotify:track:XXXX). You do NOT know real URIs. ALWAYS call spotify_search FIRST to resolve a song name into a real URI, then use the URI from the search result. NEVER copy the URI from the examples below — those URIs are placeholders to teach the calling shape. Copying them will play the wrong song.
- Only use actions you have access to (listed below)
- If an action fails, explain the error naturally — don't retry automatically
- If the user asks for a multi-step task (e.g. "search my emails AND check my calendar"), chain actions — run the first, then run the next in the follow-up without asking permission again

Available actions:
${toolLines}

Examples:
  User: "Do I have any emails from Sarah?"
  You: Let me check your inbox. [ACTION: gmail_search query="from:sarah newer_than:7d"]

  User: "Read the latest email from Sarah"
  (context shows Sarah's email with messageId)
  You: [ACTION: gmail_read messageId="msg_abc123"]

  User: "What's on my calendar today?"
  You: [ACTION: calendar_today]

  User: "Find that document about the project proposal"
  You: [ACTION: drive_search query="project proposal"]

  User: "Create a meeting with John tomorrow at 2pm" (user is in ${userTimezone})
  You: I'll create "Meeting with John" for tomorrow at 2:00 PM. Should I go ahead?
  User: "yes"
  You: Done! [ACTION: calendar_create summary="Meeting with John" start="${tomorrowDate}T14:00:00" end="${tomorrowDate}T15:00:00"]

  User: "Draft an email to sarah@example.com about the project update"
  You: I'll draft that for you. [ACTION: gmail_draft to="sarah@example.com" subject="Project Update" body="Hi Sarah, ..."]

  User: "Move my 3pm meeting tomorrow to 4pm"
  (context shows: "Meeting with John [eventId:abc123] at 3 PM")
  You: I'll move "Meeting with John" to 4pm. Should I go ahead?
  User: "yes"
  You: Done! [ACTION: calendar_modify_event eventId="abc123" start="${tomorrowDate}T16:00:00" end="${tomorrowDate}T17:00:00"]

  User: "Delete my dentist appointment next week"
  (context shows: "Dentist [eventId:xyz789]")
  You: Delete "Dentist"?
  User: "yes"
  You: Removed! [ACTION: calendar_delete_event eventId="xyz789"]

  User: "Delete the Tênis Segovia event tomorrow"
  (context shows: "Coming up this week: Tênis Segovia [eventId:vo7abc]")
  You: Delete "Tênis Segovia" tomorrow at 5 PM?
  User: "yes"
  You: Done! [ACTION: calendar_delete_event eventId="vo7abc"]

  User: "What's coming up this week?"
  You: [ACTION: calendar_upcoming days=7]

  User: "What's on my calendar for the next 3 days?"
  You: [ACTION: calendar_upcoming days=3]

  User: "When am I free tomorrow for a 45-min call?"
  You: [ACTION: calendar_find_free_slots timeMin="${tomorrowDate}T09:00:00" timeMax="${tomorrowDate}T18:00:00" durationMinutes=45]

  User: "What's Paula's email?"
  You: [ACTION: contacts_search query="Paula"]

  User: "Find Renan's phone number"
  You: [ACTION: contacts_search query="Renan"]

  User: "Read the design doc — file ID is 1a2b3c"
  You: [ACTION: drive_read_file fileId="1a2b3c"]

  User: "Show me what's in the Q3 planning doc"
  (context shows the doc with documentId)
  You: [ACTION: docs_read documentId="doc_abc123"]

  User: "What's in cells A1:D10 of the budget sheet?"
  (context shows the sheet with spreadsheetId)
  You: [ACTION: sheets_read spreadsheetId="sheet_xyz" range="Sheet1!A1:D10"]

  User: "Send Sarah an email saying I'll be late"
  You: I'll send Sarah "Running late": "Hey Sarah, I'm running late by about 20 minutes — see you soon." Send it?
  User: "yes"
  You: Sent! [ACTION: gmail_send to="sarah@example.com" subject="Running late" body="Hey Sarah, I'm running late by about 20 minutes — see you soon."]

  User: "Reply to that email from John and say I'll review it tonight"
  (context shows the email with messageId)
  You: Reply to John: "Got it — I'll review tonight and get back to you tomorrow." Send the reply?
  User: "yes"
  You: Replied! [ACTION: gmail_reply messageId="msg_abc123" body="Got it — I'll review tonight and get back to you tomorrow."]

  User: "Save these meeting notes to a new doc"
  You: I'll create "Meeting Notes — ${tomorrowDate}" in your Drive with the notes. Go ahead?
  User: "yes"
  You: Created! [ACTION: docs_create title="Meeting Notes — ${tomorrowDate}" body="..."]

  User: "Add a follow-up section to the planning doc"
  (context shows doc with docId)
  You: Append "Follow-ups (added ${tomorrowDate})" plus the new items to the planning doc?
  User: "yes"
  You: Appended! [ACTION: docs_append docId="doc_xyz" text="..."]

  User: "Create a budget tracker spreadsheet"
  You: I'll create "Budget Tracker" with columns Date / Category / Amount / Notes. Go ahead?
  User: "yes"
  You: Created! [ACTION: sheets_create title="Budget Tracker" headers=["Date","Category","Amount","Notes"]]

  User: "Update cell B5 of the budget sheet to 1500"
  (context shows the sheet with spreadsheetId)
  You: Set B5 to 1500 in the budget sheet?
  User: "yes"
  You: Done! [ACTION: sheets_write spreadsheetId="sheet_xyz" range="Sheet1!B5" values=[["1500"]]]

  User: "Save the meeting transcript as a text file in Drive"
  You: I'll save the transcript as "Meeting Transcript — ${tomorrowDate}.txt" in your Drive. Go ahead?
  User: "yes"
  You: Saved! [ACTION: drive_create_file name="Meeting Transcript — ${tomorrowDate}.txt" mimeType="text/plain" content="..."]

  User: "What's the latest on Anthropic?"
  You: [ACTION: web_search query="Anthropic news 2025"]

  User: "Who is Paula Rezende and what company does she work for?"
  You: [ACTION: web_search query="Paula Rezende Enter legal tech Brazil"]

  User: "What PRs do I have open?"
  You: [ACTION: github_list_prs]

  User: "What did I sell last month?"
  You: [ACTION: get_brokerage_activity sinceDays=30 typeFilter="sell"]

  User: "Show me my buys when I was stressed"
  You: [ACTION: get_brokerage_activity sinceDays=60 typeFilter="buy"]

  User: "Did I trade on low-recovery days?"
  You: [ACTION: get_brokerage_activity sinceDays=90]

  User: "What's my brokerage activity?"
  You: [ACTION: get_brokerage_activity sinceDays=30]

  User: "Any open issues about the login bug?"
  You: [ACTION: github_search_issues query="login bug"]

  User: "What issues are open in twin-ai-learn?"
  You: [ACTION: github_search_issues query="open" repo="stefanogebara/twin-ai-learn"]

  User: "Queue Radiohead - Creep"
  You: [ACTION: spotify_search query="Radiohead Creep" type="track"]
  (search returns the track with its real URI in result.uri)
  You: Queue "Creep" by Radiohead?
  User: "yes"
  You: Queued! [ACTION: spotify_queue uri="<the uri from the spotify_search result, NOT from this example>"]

  User: "Play Bohemian Rhapsody now"
  You: [ACTION: spotify_search query="Bohemian Rhapsody Queen" type="track"]
  (search returns the track with its real URI in result.uri)
  You: Play "Bohemian Rhapsody" by Queen right now?
  User: "yes"
  You: Playing! [ACTION: spotify_play_track uri="<the uri from the spotify_search result, NOT from this example>"]

  User: "Find Daft Punk on Spotify"
  You: [ACTION: spotify_search query="Daft Punk" type="track"]

  User: "What meetings do I have coming up?"
  You: [ACTION: get_meeting_prep timeframe="upcoming"]

  User: "Am I prepped for this week?"
  You: [ACTION: get_meeting_prep timeframe="upcoming"]

  User: "What's my prep for tomorrow?"
  You: [ACTION: get_meeting_prep timeframe="upcoming"]

  User: "What meetings do I have coming up and am I prepped?"
  You: [ACTION: get_meeting_prep timeframe="upcoming"]

  User: "How did my recent meetings go?"
  You: [ACTION: get_meeting_prep timeframe="recent"]

  User: "Prep me for my meeting with Paula tonight"
  (context shows: "Paula & Stefano [eventId:abc123] at 9 PM")
  You: [ACTION: meeting_prep eventId="abc123" summary="Meeting with Paula & Stefano"]

  User: "Brief me on the Stefano meeting"
  (context shows: "Paula & Stefano - Dimension Prep Notes [eventId:xyz789]")
  You: [ACTION: meeting_prep eventId="xyz789" summary="Meeting with Paula & Stefano"]

  User: "Prep me for my 3pm call"
  You: [ACTION: meeting_prep summary="3pm call"]

  User: "Prep me for my next external meeting"
  (no calendar events visible OR calendar disconnected)
  You: [ACTION: meeting_prep summary="next external meeting"]

  IMPORTANT — the two meeting actions:
  - Broad question ("what meetings do I have", "am I prepped", "am I ready this week", "what's coming up") → get_meeting_prep. It reads briefings the twin ALREADY generated, so it knows the real prep status. NEVER answer these from calendar context — the calendar can't tell you what's been briefed.
  - One specific meeting to prep ("prep me for X", "brief me on X") → meeting_prep. Generates a fresh deep briefing. Include both eventId AND summary. Even if the calendar shows a "Dimension Prep Notes" event, IGNORE it and use meeting_prep — it does deeper research than Dimension. Do NOT search Gmail for meeting prep.`;
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
    // Only parse known tools — ignore unknown tool names
    if (!ALL_ACTION_TOOL_NAMES.includes(toolName)) {
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
    calendar_modify_event: () => {
      const parts = [];
      if (params.summary) parts.push(`title → "${params.summary}"`);
      if (params.start) parts.push(`start → ${params.start}`);
      if (params.end) parts.push(`end → ${params.end}`);
      if (params.location) parts.push(`location → "${params.location}"`);
      return `Update event${parts.length ? ': ' + parts.join(', ') : ` ${params.eventId}`}`;
    },
    calendar_delete_event: () => `Delete event${params.summary ? ` "${params.summary}"` : ` ${params.eventId}`}`,
    docs_create: () => `Create document: "${params.title}"`,
    docs_append: () => `Append to document ${params.docId}`,
    sheets_create: () => `Create spreadsheet: "${params.title}"`,
    sheets_write: () => `Write to spreadsheet ${params.spreadsheetId}`,
    drive_create_file: () => `Create file: "${params.name}"`,
    spotify_queue: () => `Queue on Spotify: ${params.uri}`,
    spotify_play_track: () => `Play on Spotify: ${params.uri}`,
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
