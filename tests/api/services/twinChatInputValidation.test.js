/**
 * Tests for twinChatInputValidation — audit bug H4 (2026-05-12).
 *
 * Before the fix, validateChatInput auto-created a twin_conversations row
 * eagerly. If pre-flight then rejected the request (429 monthly limit,
 * 429 rate-limit, 403 freemium paywall, 503 gateway), the conversation
 * row was left behind with the user's message as title and ZERO messages.
 *
 * Today's contract:
 *   - validateChatInput MUST NOT touch the database for conversation creation.
 *   - autoCreateConversation is exported so the route can call it AFTER
 *     pre-flight gates pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: (...args) => {
        mockInsert(...args);
        return {
          select: () => ({
            single: () => mockSingle(),
          }),
        };
      },
      select: (...args) => mockSelect(...args),
    })),
  },
}));

const { validateChatInput, autoCreateConversation } = await import(
  '../../../api/services/twinChatInputValidation.js'
);

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

describe('validateChatInput — no eager conversation creation (audit bug H4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a fresh request without creating a twin_conversations row', async () => {
    const result = await validateChatInput({
      userId: TEST_USER,
      body: { message: 'hello twin' },
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe('hello twin');
    // CRITICAL: validateChatInput must NOT insert into twin_conversations.
    // If a downstream gate later rejects the request, no orphan row remains.
    expect(mockInsert).not.toHaveBeenCalled();
    // No conversation id is returned for new conversations — the route
    // creates it post-pre-flight.
    expect(result.conversationId).toBeNull();
  });

  it('passes through an explicit conversationId without DB writes', async () => {
    const result = await validateChatInput({
      userId: TEST_USER,
      body: { message: 'follow-up', conversationId: 'existing-uuid' },
    });

    expect(result.ok).toBe(true);
    expect(result.conversationId).toBe('existing-uuid');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects empty messages without DB writes', async () => {
    const result = await validateChatInput({
      userId: TEST_USER,
      body: { message: '   ' },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects oversize messages without DB writes', async () => {
    const result = await validateChatInput({
      userId: TEST_USER,
      body: { message: 'x'.repeat(8001) },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('autoCreateConversation inserts only when called explicitly (post-pre-flight)', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'new-conv-id' }, error: null });

    const id = await autoCreateConversation(TEST_USER, 'hello twin');

    expect(id).toBe('new-conv-id');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: TEST_USER,
        title: 'hello twin',
        mode: 'twin',
      })
    );
  });
});
