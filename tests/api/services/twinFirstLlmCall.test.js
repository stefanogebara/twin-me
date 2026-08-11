import { describe, it, expect, vi, beforeEach } from 'vitest';

// All mock objects are declared via vi.hoisted() so they exist before the
// hoisted vi.mock factories run.
//
// llmGateway: capture the args each call receives so we can assert on the
// assembled sampling params, and control the returned content.
const gatewayMocks = vi.hoisted(() => ({
  complete: vi.fn().mockResolvedValue({ content: 'buffered reply' }),
  stream: vi.fn(),
  TIER_CHAT: 'chat',
}));
vi.mock('../../../api/services/llmGateway.js', () => gatewayMocks);

// Phase 1 (product-truth-review 2026-08-09): neurotransmitter modifier and
// personality reranker were deleted from runFirstLlmCall — their mocks and
// describe blocks went with them.
const actionMocks = vi.hoisted(() => ({
  parseActions: vi.fn(() => []),
  stripActionTags: vi.fn((t) => t),
}));
vi.mock('../../../api/services/tools/workspaceActionParser.js', () => actionMocks);

import { runFirstLlmCall, classifyGatewayError } from '../../../api/services/twinFirstLlmCall.js';

const FALLBACK = 'I apologize, I could not generate a response.';
const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

const baseArgs = {
  isStreaming: false,
  systemPrompt: 'you are a twin',
  llmMessages: [{ role: 'user', content: 'hi' }],
  userId: USER,
  routingTier: 'chat_standard',
  routedModel: 'deepseek/deepseek-v3.2',
  personalityProfile: null,
  tempDeltaByTier: 0,
  workspaceActionsEnabled: false,
  res: null,
  chatLog: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  gatewayMocks.complete.mockResolvedValue({ content: 'buffered reply' });
});

describe('classifyGatewayError', () => {
  it('flags billing-related failures', () => {
    for (const msg of ['credit balance too low', 'billing issue', 'need more credits', 'error 402']) {
      expect(classifyGatewayError(new Error(msg)).isBilling).toBe(true);
    }
  });

  it('does not flag unrelated failures as billing', () => {
    const r = classifyGatewayError(new Error('upstream timeout'));
    expect(r.isBilling).toBe(false);
    expect(r.message).toBe('upstream timeout');
  });

  it('tolerates a null/undefined error', () => {
    expect(classifyGatewayError(null)).toEqual({ isBilling: false, message: '' });
    expect(classifyGatewayError(undefined).isBilling).toBe(false);
  });
});

describe('runFirstLlmCall — buffered branch sampling params', () => {
  it('falls back to safe defaults when no personality profile is present', async () => {
    await runFirstLlmCall({ ...baseArgs });
    const args = gatewayMocks.complete.mock.calls[0][0];
    expect(args.temperature).toBe(0.7);
    expect(args.top_p).toBe(0.9);
    expect(args.frequency_penalty).toBe(0);
    expect(args.presence_penalty).toBe(0);
    // serviceName carries the routing tier
    expect(args.serviceName).toBe('twin-chat:chat_standard');
    expect(args.modelOverride).toBe('deepseek/deepseek-v3.2');
  });

  it('derives params from the personality profile and adds the tier temperature delta', async () => {
    await runFirstLlmCall({
      ...baseArgs,
      personalityProfile: {
        temperature: 0.6, top_p: 0.88, frequency_penalty: 0.1, presence_penalty: 0.2,
      },
      tempDeltaByTier: 0.05,
    });
    const args = gatewayMocks.complete.mock.calls[0][0];
    expect(args.temperature).toBeCloseTo(0.65, 5);
    expect(args.top_p).toBe(0.88);
    expect(args.frequency_penalty).toBe(0.1);
    expect(args.presence_penalty).toBe(0.2);
  });

  it('returns the fallback message when the gateway yields empty content', async () => {
    gatewayMocks.complete.mockResolvedValue({ content: '' });
    const out = await runFirstLlmCall({ ...baseArgs });
    expect(out.assistantMessage).toBe(FALLBACK);
  });

  it('uses buffered TTFT equal to total time', async () => {
    const out = await runFirstLlmCall({ ...baseArgs });
    expect(out.assistantMessage).toBe('buffered reply');
    expect(out.ttftMs).toBe(out.totalLlmMs);
  });
});

describe('runFirstLlmCall — streaming branch', () => {
  it('streams chunks straight to the response when actions are disabled', async () => {
    const writes = [];
    const res = { write: vi.fn((s) => writes.push(s)) };
    gatewayMocks.stream.mockImplementation(async ({ onChunk }) => {
      onChunk('Hello ');
      onChunk('world');
      return { content: 'Hello world' };
    });

    const out = await runFirstLlmCall({
      ...baseArgs,
      isStreaming: true,
      workspaceActionsEnabled: false,
      res,
    });

    expect(res.write).toHaveBeenCalledTimes(2);
    expect(writes[0]).toContain('"type":"chunk"');
    expect(writes[0]).toContain('Hello ');
    expect(out.assistantMessage).toBe('Hello world');
    expect(out.ttftMs).not.toBeNull();
    // action parser is never consulted when workspace actions are off
    expect(actionMocks.parseActions).not.toHaveBeenCalled();
  });

  it('buffers chunks and flushes stripped text when workspace actions are enabled but none are present', async () => {
    const writes = [];
    const res = { write: vi.fn((s) => writes.push(s)) };
    gatewayMocks.stream.mockImplementation(async ({ onChunk }) => {
      onChunk('some ');
      onChunk('answer');
      return { content: 'some answer' };
    });
    actionMocks.parseActions.mockReturnValue([]); // no actions -> flush clean text once
    actionMocks.stripActionTags.mockImplementation((t) => t);

    const out = await runFirstLlmCall({
      ...baseArgs,
      isStreaming: true,
      workspaceActionsEnabled: true,
      res,
    });

    // chunks were buffered (not written live); a single clean flush happens after
    expect(res.write).toHaveBeenCalledTimes(1);
    expect(writes[0]).toContain('some answer');
    expect(out.assistantMessage).toBe('some answer');
    expect(actionMocks.stripActionTags).toHaveBeenCalledWith('some answer');
  });
});
