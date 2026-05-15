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

/**
 * Coverage-completeness guard (audit-2026-05-15).
 *
 * Sibling bug class to the get_meeting_prep miss: a tool registered in
 * extendedTools.js but missing from the prompt's EXAMPLES block is
 * effectively invisible to weak models. The auto-listed "Available
 * actions" block alone is not enough — weak models need a worked
 * [ACTION: ...] example to learn the calling shape.
 *
 * This suite locks in coverage: every name in EXTENDED_TOOL_NAMES must
 * appear as at least one [ACTION: <name>] example in the prompt. If a
 * future tool is added without a paired example, these tests fail and
 * surface the drift before it ships.
 */
import { EXTENDED_TOOL_NAMES } from '../../../api/services/tools/extendedTools.js';

const ALL_TOOLS = [
  ...MEETING_TOOLS,
  { name: 'web_search', platform: null, description: 'Search the web.', category: 'research', parameters: { type: 'object', properties: { query: { type: 'string', description: 'q' } } } },
  { name: 'github_list_prs', platform: 'github', description: 'List PRs.', category: 'development', parameters: { type: 'object', properties: {} } },
  { name: 'github_search_issues', platform: 'github', description: 'Search GitHub issues.', category: 'development', parameters: { type: 'object', properties: { query: { type: 'string', description: 'q' } } } },
  { name: 'spotify_search', platform: 'spotify', description: 'Search Spotify.', category: 'music', parameters: { type: 'object', properties: { query: { type: 'string', description: 'q' } } } },
  { name: 'spotify_queue', platform: 'spotify', description: 'Queue a track.', category: 'music', parameters: { type: 'object', properties: { uri: { type: 'string', description: 'u' } } } },
  { name: 'spotify_play_track', platform: 'spotify', description: 'Play a track.', category: 'music', parameters: { type: 'object', properties: { uri: { type: 'string', description: 'u' } } } },
];

describe('buildWorkspaceActionsPrompt — extended tools coverage (audit-2026-05-15)', () => {
  beforeEach(() => {
    mockGetAvailableTools.mockReset();
  });

  it.each(EXTENDED_TOOL_NAMES)(
    'extended tool %s has at least one [ACTION: ...] example in the prompt',
    async (toolName) => {
      mockGetAvailableTools.mockResolvedValue(ALL_TOOLS);
      const prompt = await buildWorkspaceActionsPrompt('user-1');
      const pattern = new RegExp(`\\[ACTION:\\s*${toolName}\\b`);
      expect(prompt).toMatch(pattern);
    },
  );

  it('write-action confirmation rule lists every Spotify write tool', async () => {
    mockGetAvailableTools.mockResolvedValue(ALL_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    // Both spotify writes must be named in the "confirm with the user first" rule.
    expect(prompt).toMatch(/spotify_queue/);
    expect(prompt).toMatch(/spotify_play_track/);
  });

  it('github_search_issues example demonstrates the repo filter param', async () => {
    mockGetAvailableTools.mockResolvedValue(ALL_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    // At least one example must show how to pass repo="owner/name" — the
    // most useful and least-obvious param on the tool.
    expect(prompt).toMatch(/\[ACTION:\s*github_search_issues[^\]]*repo="/);
  });
});

/**
 * Spotify URI-parroting fix (audit-2026-05-15 follow-up).
 *
 * Discovered during live verification of the previous fix: with no
 * spotify_search tool, the model would learn the calling shape from the
 * spotify_play_track example perfectly — and then copy the EXAMPLE URI
 * verbatim when asked to play any song. User asks for "Bohemian
 * Rhapsody", twin plays Radiohead - Creep (the URI from the example).
 *
 * Fix: register spotify_search and rewrite the spotify examples to show
 * the chain (search first → confirm → play/queue with URI from result).
 * Plus an explicit "SPOTIFY URI RULE" in RULES forbidding URI parroting.
 *
 * These tests lock in the fix so a future refactor can't silently revert.
 */
describe('buildWorkspaceActionsPrompt — spotify URI-parroting guard (audit-2026-05-15 v2)', () => {
  beforeEach(() => {
    mockGetAvailableTools.mockReset();
  });

  it('has an explicit SPOTIFY URI RULE that forbids URI parroting', async () => {
    mockGetAvailableTools.mockResolvedValue(ALL_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    expect(prompt).toMatch(/SPOTIFY URI RULE/i);
    // Must explicitly say NEVER copy from examples — the exact failure mode.
    expect(prompt).toMatch(/never copy[^\n]*example/i);
  });

  it('teaches spotify_search via at least one [ACTION: spotify_search ...] example', async () => {
    mockGetAvailableTools.mockResolvedValue(ALL_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    expect(prompt).toMatch(/\[ACTION:\s*spotify_search/);
  });

  it('shows the search-first chain for queue (search then queue)', async () => {
    mockGetAvailableTools.mockResolvedValue(ALL_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    // Find the spotify_queue example and verify a spotify_search call
    // appears BEFORE it in the prompt (search-first chain).
    const queueIdx = prompt.indexOf('[ACTION: spotify_queue');
    const searchIdx = prompt.indexOf('[ACTION: spotify_search');
    expect(queueIdx).toBeGreaterThan(0);
    expect(searchIdx).toBeGreaterThan(0);
    expect(searchIdx).toBeLessThan(queueIdx);
  });

  it('shows the search-first chain for play (search then play)', async () => {
    mockGetAvailableTools.mockResolvedValue(ALL_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    // The play example must be preceded by a spotify_search example, not
    // followed by a raw URI that the model can copy.
    const playIdx = prompt.indexOf('[ACTION: spotify_play_track');
    expect(playIdx).toBeGreaterThan(0);
    const beforePlay = prompt.slice(0, playIdx);
    expect(beforePlay).toMatch(/\[ACTION:\s*spotify_search/);
  });

  it('play example uses a placeholder URI marker, not a raw spotify:track URI', async () => {
    mockGetAvailableTools.mockResolvedValue(ALL_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    // Pull the play example specifically and verify it teaches "use the
    // uri from the search result", not a copyable hardcoded URI.
    const playLineMatch = prompt.match(/\[ACTION:\s*spotify_play_track\s+uri="([^"]+)"\]/);
    expect(playLineMatch).toBeTruthy();
    const uri = playLineMatch[1];
    // Either a placeholder (<...>) or explicit instruction text — never a
    // bare, copy-paste-able spotify:track:XXX URI.
    expect(uri).not.toMatch(/^spotify:(track|album|playlist):[A-Za-z0-9]+$/);
  });

  it('queue example also uses a placeholder URI marker', async () => {
    mockGetAvailableTools.mockResolvedValue(ALL_TOOLS);
    const prompt = await buildWorkspaceActionsPrompt('user-1');
    const queueLineMatch = prompt.match(/\[ACTION:\s*spotify_queue\s+uri="([^"]+)"\]/);
    expect(queueLineMatch).toBeTruthy();
    const uri = queueLineMatch[1];
    expect(uri).not.toMatch(/^spotify:(track|album|playlist):[A-Za-z0-9]+$/);
  });
});
