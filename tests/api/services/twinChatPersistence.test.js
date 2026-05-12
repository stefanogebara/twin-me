/**
 * Tests for twinChatPersistence — audit bug H10 (2026-05-12).
 *
 * Before the fix, persistChatTurn never forwarded the cold-start latency or
 * memory_count from the route into logConversationToDatabase, so every row
 * in mcp_conversation_logs had cold_start_ms=NULL, memory_count=NULL —
 * blinding the per-leg-timeout / HyDE-skip telemetry work.
 *
 * Today's contract: persistChatTurn forwards coldStartMs + memoryCount to
 * the conversation log writer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogConversationToDatabase = vi.fn();
const mockAddConversationMemoryStream = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../api/services/conversationLearning.js', () => ({
  logConversationToDatabase: (...args) => mockLogConversationToDatabase(...args),
}));

vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addConversationMemory: (...args) => mockAddConversationMemoryStream(...args),
}));

vi.mock('../../../api/services/database.js', () => {
  // Minimal chainable mock so attachLzScoreToLastMessage / twin_messages
  // inserts don't blow up. They are fire-and-forget so we return real
  // resolved Promises whenever the production code calls .then(...).catch(...).
  const settled = Promise.resolve({ data: null, error: null });
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn(() => settled),
    update: vi.fn(() => settled),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabaseAdmin: { from: vi.fn(() => chain) },
  };
});

vi.mock('../../../api/utils/lzComplexity.js', () => ({
  lzComplexity: () => 0.5,
}));

const { persistChatTurn } = await import(
  '../../../api/services/twinChatPersistence.js'
);

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

function basePayload(extra = {}) {
  return {
    userId: TEST_USER,
    message: 'hello',
    assistantMessage: 'hi there',
    conversationId: 'conv-id',
    evalMode: true, // skip the memory-stream write
    routedModel: 'sonnet',
    routingTier: 'CHAT',
    systemPrompt: [{ type: 'text', text: 'system' }],
    soulSignature: { id: 'sig-id' },
    platformData: { spotify: true },
    memories: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    writingProfile: null,
    chatSource: 'direct',
    ...extra,
  };
}

describe('persistChatTurn — cold-start telemetry (audit bug H10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogConversationToDatabase.mockResolvedValue('log-id');
  });

  it('forwards coldStartMs and memoryCount to logConversationToDatabase', async () => {
    await persistChatTurn(basePayload({ coldStartMs: 1234, memoryCount: 7 }));

    expect(mockLogConversationToDatabase).toHaveBeenCalledTimes(1);
    const call = mockLogConversationToDatabase.mock.calls[0][0];
    expect(call.coldStartMs).toBe(1234);
    expect(call.memoryCount).toBe(7);
  });

  it('defaults to null when route omits telemetry (back-compat)', async () => {
    await persistChatTurn(basePayload());

    const call = mockLogConversationToDatabase.mock.calls[0][0];
    expect(call.coldStartMs).toBeNull();
    expect(call.memoryCount).toBeNull();
  });

  it('persists zero memoryCount as a real datapoint, not null', async () => {
    await persistChatTurn(basePayload({ coldStartMs: 800, memoryCount: 0 }));

    const call = mockLogConversationToDatabase.mock.calls[0][0];
    expect(call.coldStartMs).toBe(800);
    expect(call.memoryCount).toBe(0);
  });
});
