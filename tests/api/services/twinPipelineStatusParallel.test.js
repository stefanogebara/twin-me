/**
 * Dispatch-shape tests for twinPipelineOrchestrator.getFullTwinStatus
 * (backend-latency audit 2026-07-03).
 *
 * GET /api/twin/status/:userId measured at 3-5s: extraction status, latest
 * twin, and evolution summary were awaited serially, and each hides 1-3
 * sequential DB round trips of its own (~8 serial queries total). They are
 * independent reads, so they now run in one Promise.all.
 *
 * The barrier idiom proves parallel dispatch: all three service calls must
 * be in flight before any resolves — serial code would stall at the first.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetExtractionStatus, mockGetTwin, mockGetEvolutionSummary } = vi.hoisted(
  () => ({
    mockGetExtractionStatus: vi.fn(),
    mockGetTwin: vi.fn(),
    mockGetEvolutionSummary: vi.fn(),
  })
);

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../api/services/extractionOrchestrator.js', () => ({
  default: { getExtractionStatus: mockGetExtractionStatus },
}));
vi.mock('../../../api/services/twinFormationService.js', () => ({
  default: { getTwin: mockGetTwin },
}));
vi.mock('../../../api/services/twinEvolutionService.js', () => ({
  default: { getEvolutionSummary: mockGetEvolutionSummary },
}));
vi.mock('../../../api/services/behavioralEvidencePipeline.js', () => ({
  default: {},
}));

const { default: twinPipelineOrchestrator } = await import(
  '../../../api/services/twinPipelineOrchestrator.js'
);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

describe('getFullTwinStatus (audit 2026-07-03: serial awaits)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches extraction, twin and evolution reads in parallel', async () => {
    let releaseBarrier;
    const barrier = new Promise((resolve) => {
      releaseBarrier = resolve;
    });

    mockGetExtractionStatus.mockImplementation(async () => {
      await barrier;
      return { success: true, platforms: [], totalConnected: 0 };
    });
    mockGetTwin.mockImplementation(async () => {
      await barrier;
      return {
        success: true,
        twin: { user_id: USER_ID, updated_at: '2026-07-01T00:00:00Z', reflections: [] },
      };
    });
    mockGetEvolutionSummary.mockImplementation(async () => {
      await barrier;
      return { success: true, summary: { status: 'stable' } };
    });

    const statusPromise = twinPipelineOrchestrator.getFullTwinStatus(USER_ID);

    // All three must be in flight before ANY of them resolves. The old
    // serial code would have called only getExtractionStatus by now.
    await vi.waitFor(() => {
      expect(mockGetExtractionStatus).toHaveBeenCalledTimes(1);
      expect(mockGetTwin).toHaveBeenCalledTimes(1);
      expect(mockGetEvolutionSummary).toHaveBeenCalledTimes(1);
    });

    releaseBarrier();
    const status = await statusPromise;

    expect(status).toMatchObject({
      success: true,
      pipeline: { isRunning: false },
      extraction: { success: true },
      hasTwin: true,
      evolution: { status: 'stable' },
      personality: null,
      lastUpdated: '2026-07-01T00:00:00Z',
    });
  });

  it('keeps the old serial error semantics when getExtractionStatus rejects', async () => {
    mockGetExtractionStatus.mockRejectedValue(new Error('db unreachable'));
    mockGetTwin.mockResolvedValue({ success: false, error: 'Twin not found' });
    mockGetEvolutionSummary.mockResolvedValue({ success: false, error: 'nope' });

    const status = await twinPipelineOrchestrator.getFullTwinStatus(USER_ID);

    // Same shape the serial code produced: the outer catch converts the
    // rejection into { success: false, error }.
    expect(status).toEqual({ success: false, error: 'db unreachable' });
  });

  it('maps a missing twin to hasTwin:false with null twin', async () => {
    mockGetExtractionStatus.mockResolvedValue({
      success: true,
      platforms: [],
      totalConnected: 0,
    });
    mockGetTwin.mockResolvedValue({ success: false, error: 'Twin not found' });
    mockGetEvolutionSummary.mockResolvedValue({ success: true, summary: { status: 'new' } });

    const status = await twinPipelineOrchestrator.getFullTwinStatus(USER_ID);

    expect(status.success).toBe(true);
    expect(status.twin).toBeNull();
    expect(status.hasTwin).toBe(false);
    expect(status.lastUpdated).toBeNull();
  });
});
