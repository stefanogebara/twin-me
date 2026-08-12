/**
 * answerBatteryAsTwin — extraContext injection (Phase 3, product-truth-review)
 * ============================================================================
 * Phase 3 makes fidelity the eval harness for context-pipeline features: a
 * candidate context block (temporal spine first) is injected into the twin's
 * battery grounding and the measured twin_accuracy decides whether it ships.
 * That only works if the injection goes through the PRODUCTION answering
 * function — a harness with its own prompt would measure a prompt nobody
 * ships. Pinned here:
 * - extraContext lands in the system prompt of BOTH half-battery LLM calls
 * - omitting it leaves the prompt without the block (baseline unchanged)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';

const { completeMock } = vi.hoisted(() => ({ completeMock: vi.fn() }));

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: completeMock,
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../../api/services/twinSummaryService.js', () => ({
  getTwinSummary: vi.fn().mockResolvedValue('summary text'),
}));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  retrieveDiverseMemories: vi.fn().mockResolvedValue([{ content: 'memory one' }]),
}));
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
// Shipped 2026-08-12: production battery grounding fetches the recent
// platform digest itself. Controllable per-test; default: digest present.
const { digestMock } = vi.hoisted(() => ({ digestMock: vi.fn() }));
vi.mock('../../../api/services/recentPlatformDigest.js', () => ({
  renderRecentPlatformDigest: digestMock,
}));

const { answerBatteryAsTwin } = await import(
  '../../../api/services/fidelityBatteryService.js'
);

const SPINE_BLOCK = '=== MY TIMELINE (oldest first) ===\n- [5 months ago] test line';

const DIGEST_BLOCK = '=== MY LAST TWO WEEKS (platform data, Jul 29 - Aug 12) ===\nSPOTIFY (426 events):\n- [Aug 11] Played X';

beforeEach(() => {
  vi.clearAllMocks();
  completeMock.mockResolvedValue({
    content: JSON.stringify({ answers: { bfi_reserved: 3 }, confidence: { bfi_reserved: 0.5 } }),
  });
  digestMock.mockResolvedValue({ text: DIGEST_BLOCK, events: 426, platforms: 1 });
});

describe('answerBatteryAsTwin — extraContext', () => {
  it('injects extraContext into the system prompt of both half calls', async () => {
    await answerBatteryAsTwin('user-1', { extraContext: SPINE_BLOCK });

    expect(completeMock).toHaveBeenCalledTimes(2);
    for (const call of completeMock.mock.calls) {
      expect(call[0].system).toContain(SPINE_BLOCK);
      // grounding still present alongside the injected block
      expect(call[0].system).toContain('summary text');
      expect(call[0].system).toContain('memory one');
    }
  });

  it('leaves the prompt untouched when extraContext is omitted (baseline)', async () => {
    await answerBatteryAsTwin('user-1');

    expect(completeMock).toHaveBeenCalledTimes(2);
    for (const call of completeMock.mock.calls) {
      expect(call[0].system).not.toContain('MY TIMELINE');
    }
  });
});

describe('answerBatteryAsTwin — recent platform digest (production grounding)', () => {
  it('includes the digest in the system prompt of both half calls', async () => {
    await answerBatteryAsTwin('user-1');

    expect(digestMock).toHaveBeenCalledWith('user-1', expect.objectContaining({ supabase: expect.anything() }));
    expect(completeMock).toHaveBeenCalledTimes(2);
    for (const call of completeMock.mock.calls) {
      expect(call[0].system).toContain('MY LAST TWO WEEKS');
      expect(call[0].system).toContain('SPOTIFY (426 events)');
    }
  });

  it('degrades to a digest-free prompt when the renderer fails', async () => {
    digestMock.mockRejectedValue(new Error('db down'));

    const result = await answerBatteryAsTwin('user-1');

    expect(result).not.toBeNull(); // battery still answered
    for (const call of completeMock.mock.calls) {
      expect(call[0].system).not.toContain('MY LAST TWO WEEKS');
    }
  });

  it('composes with extraContext (candidate arms stack on top of the digest)', async () => {
    await answerBatteryAsTwin('user-1', { extraContext: SPINE_BLOCK });

    for (const call of completeMock.mock.calls) {
      expect(call[0].system).toContain('MY LAST TWO WEEKS');
      expect(call[0].system).toContain(SPINE_BLOCK);
    }
  });
});
