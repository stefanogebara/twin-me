/**
 * Tests for buildWorkspaceActionsPrompt — the system-prompt block that
 * teaches the twin which [ACTION: tool_name] tags to emit.
 *
 * Focus: the audit-2026-05-14 fix. get_meeting_prep was registered in
 * extendedTools.js and auto-listed in the prompt's "Available actions"
 * block, but the RULES and EXAMPLES sections only ever covered
 * meeting_prep. A weak model (Gemini Flash on the LIGHT tier) with
 * calendar context inline never fired get_meeting_prep — it answered
 * meeting-readiness questions from calendar context and misinformed the
 * user about prep status. This module is prompt-engineered tool calling,
 * so the prompt IS the tool-selection logic: a tool with no rule + no
 * example is effectively invisible to weak models.
 *
 * Strategy: mock getAvailableTools to return the meeting tools (plus one
 * Google Workspace tool for variety), then assert the generated prompt
 * teaches BOTH meeting tools with rules + examples + disambiguation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAvailableTools = vi.fn();

vi.mock('../../../api/services/toolRegistry.js', () => ({
  getAvailableTools: (...args) => mockGetAvailableTools(...args),
  executeTool: vi.fn(),
}));

// logAgentAction is imported at module top but only used by executeAction,
// not buildWorkspaceActionsPrompt. Stub it so the import is side-effect-free.
vi.mock('../../../api/services/autonomyService.js', () => ({
  logAgentAction: vi.fn(),
}));

// buildWorkspaceActionsPrompt does a dynamic import of database.js for the
// user's timezone, wrapped in try/catch. Mock it so the lookup is
// deterministic instead of relying on the catch fallback.
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { timezone: 'Europe/Paris' }, error: null }),
    })),
  },
}));

const { buildWorkspaceActionsPrompt } = await import(
  '../../../api/services/tools/workspaceActionParser.js'
);

// Realistic tool shapes — names MUST be in ALL_ACTION_TOOL_NAMES
// (GOOGLE_WORKSPACE_TOOL_NAMES + EXTENDED_TOOL_NAMES) or buildWorkspace-
// ActionsPrompt filters them out.
const MEETING_TOOLS = [
  {
    name: 'get_meeting_prep',
    platform: null,
    description:
      'List the meeting briefings the twin has ALREADY prepared. Use this when the user asks broadly — "what meetings do I have?", "am I ready for this week?".',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        timeframe: { type: 'string', description: 'upcoming | recent | all' },
      },
    },
  },
  {
    name: 'meeting_prep',
    platform: null,
    description: 'Generate a FRESH pre-meeting briefing for ONE specific meeting.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Google Calendar event ID' },
        summary: { type: 'string', description: 'Meeting title' },
      },
    },
  },
  {
    name: 'calendar_today',
    platform: 'google_calendar',
    description: "List today's calendar events.",
    category: 'workspace',
    parameters: { type: 'object', properties: {} },
  },
];

describe('buildWorkspaceActionsPrompt — get_meeting_prep wiring (audit-2026-05-14)', () => {
  beforeEach(() => {
    mockGetAvailableTools.mockReset();
  });

  it('returns null when the user has no action tools', async () => {
    mockGetAvailableTools.mockResolvedValue([]);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    expect(prompt).toBeNull();
  });

  it('auto-lists get_meeting_prep in the Available actions block', async () => {
    mockGetAvailableTools.mockResolvedValue(MEETING_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    expect(prompt).toBeTruthy();
    expect(prompt).toContain('get_meeting_prep');
  });

  it('teaches get_meeting_prep in the RULES section, not just the auto-list', async () => {
    mockGetAvailableTools.mockResolvedValue(MEETING_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    // The rule must name the tool and describe its broad-question trigger.
    expect(prompt).toMatch(/get_meeting_prep[^\n]*broad/i);
    // The disambiguation must be explicit: there are TWO meeting actions.
    expect(prompt).toMatch(/two meeting actions/i);
  });

  it('includes at least one [ACTION: get_meeting_prep ...] example', async () => {
    mockGetAvailableTools.mockResolvedValue(MEETING_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    expect(prompt).toMatch(/\[ACTION:\s*get_meeting_prep/);
  });

  it('locks in an example for the exact regression query', async () => {
    mockGetAvailableTools.mockResolvedValue(MEETING_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    // The verbatim query that exposed the bug must be a worked example.
    // Case-insensitive on the lead letter — examples are sentence-cased
    // ("What meetings...") while the live query was lowercase.
    expect(prompt).toMatch(/what meetings do I have coming up and am I prepped\?/i);
    // ...and that example must route to get_meeting_prep, not meeting_prep.
    const exampleIdx = prompt.toLowerCase().indexOf(
      'what meetings do i have coming up and am i prepped?',
    );
    const following = prompt.slice(exampleIdx, exampleIdx + 160);
    expect(following).toMatch(/\[ACTION:\s*get_meeting_prep/);
  });

  it('carries the anti-pattern guard: never answer prep status from calendar context', async () => {
    mockGetAvailableTools.mockResolvedValue(MEETING_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    // The exact failure mode from the audit: answering "not prepped" from
    // calendar context. The prompt must explicitly forbid it.
    expect(prompt).toMatch(/never answer[^\n]*from calendar context/i);
  });

  it('still teaches meeting_prep — the fix does not regress the existing tool', async () => {
    mockGetAvailableTools.mockResolvedValue(MEETING_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    expect(prompt).toMatch(/\[ACTION:\s*meeting_prep/);
    // meeting_prep stays the HIGHEST PRIORITY meeting rule.
    expect(prompt).toMatch(/MEETING PREP \(HIGHEST PRIORITY\)/);
  });

  it('disambiguates the two tools by intent (broad vs one specific meeting)', async () => {
    mockGetAvailableTools.mockResolvedValue(MEETING_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    // Both directions of the decision must be spelled out.
    expect(prompt).toMatch(/broad.*get_meeting_prep|get_meeting_prep.*broad/is);
    expect(prompt).toMatch(/one specific meeting.*meeting_prep|meeting_prep[^\n]*one specific/is);
  });

  it('passes timeframe guidance for get_meeting_prep (upcoming/recent/all)', async () => {
    mockGetAvailableTools.mockResolvedValue(MEETING_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    expect(prompt).toMatch(/timeframe="(upcoming|recent|all)"/);
  });
});
