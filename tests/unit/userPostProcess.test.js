/**
 * runUserPostProcess — the synthesis half of observation ingestion, extracted so
 * it can run OFF the ingestion request path (#170).
 *
 * Context: fetch+store is cheap and essential; the synthesis (platform experts,
 * proactive insights, goals, activity metrics, soul-signature cache warm) is
 * CPU/LLM-heavy. Running it inline starves the event loop under Fluid
 * concurrency so a withDeadline timer can't even fire → 60s kill (#136/#190).
 * This function is invoked from the Inngest per-user function's own
 * `post-process` step, which Inngest re-drives as a SEPARATE invocation with a
 * fresh budget. Everything here is best-effort: one failing task must never
 * sink the others, and the function must never throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(__dir, rel), 'utf8');
const INGESTION_SRC = read('../../api/services/observationIngestion.js');
const INNGEST_FN_SRC = read('../../api/inngest/functions/userObservationIngestion.js');
const CRON_SRC = read('../../api/routes/cron-observation-ingestion.js');

vi.mock('../../api/services/reflectionEngine.js', () => ({
  shouldTriggerReflection: vi.fn().mockResolvedValue(false),
  generateReflections: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../api/services/platformExperts.js', () => ({
  runPlatformExpert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../api/services/proactiveInsights.js', () => ({
  generateProactiveInsights: vi.fn().mockResolvedValue(undefined),
  evaluateNudgeOutcomes: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../api/services/goalTrackingService.js', () => ({
  trackGoalProgress: vi.fn().mockResolvedValue(undefined),
  generateGoalSuggestions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../api/services/activityMetricsService.js', () => ({
  calculateAllActivityMetrics: vi.fn().mockResolvedValue(undefined),
  detectActivityAnomaly: vi.fn().mockResolvedValue({ anomaly: false }),
}));
vi.mock('../../api/services/observationUtils.js', () => ({
  getSupabase: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../api/services/cacheWarmer.js', () => ({
  warmUserCaches: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { runUserPostProcess } from '../../api/services/userPostProcess.js';
import { runPlatformExpert } from '../../api/services/platformExperts.js';
import { generateProactiveInsights, evaluateNudgeOutcomes } from '../../api/services/proactiveInsights.js';
import { trackGoalProgress, generateGoalSuggestions } from '../../api/services/goalTrackingService.js';
import { calculateAllActivityMetrics } from '../../api/services/activityMetricsService.js';
import { warmUserCaches } from '../../api/services/cacheWarmer.js';
import { shouldTriggerReflection, generateReflections } from '../../api/services/reflectionEngine.js';

const U = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

beforeEach(() => vi.clearAllMocks());

describe('runUserPostProcess', () => {
  it('runs a platform expert for each platform with new observations', async () => {
    await runUserPostProcess(U, { platforms: ['spotify', 'youtube'] });
    expect(runPlatformExpert).toHaveBeenCalledWith(U, 'spotify');
    expect(runPlatformExpert).toHaveBeenCalledWith(U, 'youtube');
    expect(runPlatformExpert).toHaveBeenCalledTimes(2);
  });

  it('runs the full synthesis fan of side-effects', async () => {
    await runUserPostProcess(U, { platforms: [] });
    expect(generateProactiveInsights).toHaveBeenCalledWith(U);
    expect(evaluateNudgeOutcomes).toHaveBeenCalledWith(U);
    expect(trackGoalProgress).toHaveBeenCalledWith(U, null);
    expect(generateGoalSuggestions).toHaveBeenCalledWith(U);
    expect(calculateAllActivityMetrics).toHaveBeenCalledWith(U);
    expect(warmUserCaches).toHaveBeenCalledWith(U, 'observation-ingestion');
  });

  it('triggers reflections only when shouldTriggerReflection resolves true', async () => {
    shouldTriggerReflection.mockResolvedValueOnce(false);
    await runUserPostProcess(U, {});
    expect(generateReflections).not.toHaveBeenCalled();

    shouldTriggerReflection.mockResolvedValueOnce(true);
    await runUserPostProcess(U, {});
    expect(generateReflections).toHaveBeenCalledWith(U);
  });

  it('never throws and reports failures when a task rejects; other tasks still run', async () => {
    generateProactiveInsights.mockRejectedValueOnce(new Error('insights boom'));
    const result = await runUserPostProcess(U, { platforms: ['spotify'] });
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.userId).toBe(U);
    expect(warmUserCaches).toHaveBeenCalled(); // sibling task unaffected
  });

  it('defaults platforms to empty (no experts) and still runs core synthesis', async () => {
    const result = await runUserPostProcess(U);
    expect(runPlatformExpert).not.toHaveBeenCalled();
    expect(generateProactiveInsights).toHaveBeenCalled();
    expect(result.tasks).toBeGreaterThan(0);
  });
});

/**
 * Static wiring canary for the #170 split. Regression guard so the heavy
 * synthesis can never silently slide back onto the ingestion request path
 * (which is what 504'd after #190 under Fluid concurrency).
 */
describe('goal: synthesis is deferred off the ingestion request path', () => {
  it('runObservationIngestion accepts and gates on a deferPostProcess flag', () => {
    expect(INGESTION_SRC).toMatch(/deferPostProcess\s*=\s*false/);
    // The soul-sig cache warm — the heaviest awaited job — must be gated.
    expect(INGESTION_SRC).toMatch(/if \(!deferPostProcess && stats\.observationsStored > 0\)/);
    // Records which platforms had new data for the deferred expert pass.
    expect(INGESTION_SRC).toContain('platformsByUser');
  });

  it('the Inngest per-user fn ingests deferred, then runs post-process in its own step', () => {
    expect(INNGEST_FN_SRC).toMatch(/deferPostProcess:\s*true/);
    expect(INNGEST_FN_SRC).toMatch(/step\.run\('post-process'/);
    expect(INNGEST_FN_SRC).toContain('runUserPostProcess');
  });

  it('the cron inline/starvation path defers synthesis', () => {
    expect(CRON_SRC).toMatch(/deferPostProcess:\s*true/);
  });
});
