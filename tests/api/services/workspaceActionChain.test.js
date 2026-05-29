/**
 * Tests for api/services/workspaceActionChain.js
 *
 * Focus: the audit-2026-05-29 turn-budget guard. A chained workspace action
 * must NOT start a tool it cannot finish within the 58s SSE turn budget —
 * otherwise the lambda is hard-killed and the user sees the intermittent
 * "Couldn't fetch your data" error with no twin response at all.
 *
 * The guard bounds each tool to min(static per-tool cap, time remaining in the
 * turn minus a reserve for the follow-up LLM synthesis). When too little time
 * remains, the chain degrades INSTANTLY (feeds a synthetic "timed out" block to
 * the LLM so it can answer gracefully) instead of invoking the tool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external deps before importing the module under test.
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  stream: vi.fn(),
  TIER_CHAT: 'chat',
}));

vi.mock('../../../api/services/tools/workspaceActionParser.js', () => ({
  parseActions: vi.fn(),
  executeAction: vi.fn(),
  formatActionResult: vi.fn(),
  stripActionTags: vi.fn((m) => m),
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { runWorkspaceActionChain } = await import(
  '../../../api/services/workspaceActionChain.js'
);
const { complete } = await import('../../../api/services/llmGateway.js');
const { parseActions, executeAction, formatActionResult } = await import(
  '../../../api/services/tools/workspaceActionParser.js'
);

const ACTION = { toolName: 'gmail_search', params: { query: 'invoices' } };

function baseArgs(overrides = {}) {
  return {
    userId: 'user-1',
    initialMessage: 'Sure — [ACTION: gmail_search(query="invoices")]',
    llmMessages: [{ role: 'user', content: 'find my invoices' }],
    systemPrompt: 'You are the twin.',
    routedModel: 'anthropic/claude-sonnet-4.5',
    isStreaming: false, // non-streaming path → uses complete(), no res.write
    res: { write: vi.fn() },
    chatLog: vi.fn(),
    traceId: 'trace-1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // First parse (on initialMessage) yields one action; follow-up parses yield none.
  parseActions.mockReturnValueOnce([ACTION]).mockReturnValue([]);
  formatActionResult.mockReturnValue('TOOL_RESULT [gmail_search]: 3 emails');
  complete.mockResolvedValue({ content: 'Here is what I found.' });
});

describe('runWorkspaceActionChain — turn budget guard', () => {
  it('degrades INSTANTLY without invoking the tool when the turn budget is exhausted', async () => {
    // Turn started 60s ago → remaining = 56000 - 60000 - 9000 < MIN_TOOL_BUDGET_MS.
    const result = await runWorkspaceActionChain(
      baseArgs({ chatStartTime: Date.now() - 60000 }),
    );

    // The core regression assertion: we must NOT start a tool we can't finish.
    expect(executeAction).not.toHaveBeenCalled();
    // But the chain must still synthesize a graceful reply via the follow-up LLM.
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.degraded).toBe(true);
    expect(result.chainDepth).toBe(1);
    expect(result.assistantMessage).toBe('Here is what I found.');
  });

  it('feeds the synthetic timeout block (not the tool result) to the follow-up LLM when degrading', async () => {
    await runWorkspaceActionChain(
      baseArgs({ chatStartTime: Date.now() - 60000 }),
    );

    // formatActionResult is only used for REAL tool results; the degrade path
    // uses the pre-built override block instead.
    expect(formatActionResult).not.toHaveBeenCalled();
    const followUpMessages = complete.mock.calls[0][0].messages;
    const lastUserTurn = followUpMessages[followUpMessages.length - 1];
    expect(lastUserTurn.role).toBe('user');
    expect(lastUserTurn.content).toContain('TIMED OUT');
    expect(lastUserTurn.content).toContain('Do NOT invent or guess');
  });

  it('invokes the tool normally when there is ample turn budget', async () => {
    executeAction.mockResolvedValue({
      success: true,
      data: { emails: [] },
      elapsedMs: 120,
    });

    const result = await runWorkspaceActionChain(
      baseArgs({ chatStartTime: Date.now() }),
    );

    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledWith('user-1', ACTION);
    expect(result.degraded).toBe(false);
    expect(result.chainDepth).toBe(1);
  });

  it('returns the input unchanged and never touches the LLM when no actions are detected', async () => {
    parseActions.mockReset();
    parseActions.mockReturnValue([]); // no actions at all

    const result = await runWorkspaceActionChain(
      baseArgs({ initialMessage: 'Just a plain reply, no tools.' }),
    );

    expect(executeAction).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(result.chainDepth).toBe(0);
    expect(result.degraded).toBe(false);
    expect(result.assistantMessage).toBe('Just a plain reply, no tools.');
  });
});
