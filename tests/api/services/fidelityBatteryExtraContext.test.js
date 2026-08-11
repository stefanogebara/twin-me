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

const { answerBatteryAsTwin } = await import(
  '../../../api/services/fidelityBatteryService.js'
);

const SPINE_BLOCK = '=== MY TIMELINE (oldest first) ===\n- [5 months ago] test line';

beforeEach(() => {
  vi.clearAllMocks();
  completeMock.mockResolvedValue({
    content: JSON.stringify({ answers: { bfi_reserved: 3 }, confidence: { bfi_reserved: 0.5 } }),
  });
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
