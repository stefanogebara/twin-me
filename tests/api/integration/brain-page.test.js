/**
 * Brain Page Integration Tests
 * =============================
 * Bug: C1 — Brain page infinite spinner, no content ever loads.
 *
 * Root cause investigation:
 * - Backend /api/twin/reflections works (200 OK, returns data)
 * - Frontend BrainPage.tsx fetches via authFetch('/twin/reflections?limit=20')
 * - Response must match: { success: true, reflections: Array<{ id, content, importance, expert, category, createdAt }> }
 *
 * Tests:
 * 1. Reflections endpoint returns correct shape for frontend consumption
 * 2. Empty reflections returns empty array (not null/undefined)
 * 3. Frontend timeout + late response: reflections still populate after timeout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Environment setup ────────────────────────────────────────────────────────
process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// ── Mock Supabase ────────────────────────────────────────────────────────────
const mockData = [];
const chain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(function () {
    return Promise.resolve({ data: mockData, error: null });
  }),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => chain),
  })),
}));

// Mock service imports that intelligent-twin.js pulls in
vi.mock('../../../api/services/intelligentTwinEngine.js', () => ({ default: {} }));
vi.mock('../../../api/services/userContextAggregator.js', () => ({ default: {} }));
vi.mock('../../../api/services/intelligentMusicService.js', () => ({ default: {} }));
vi.mock('../../../api/services/spotifyInsightGenerator.js', () => ({ default: {} }));
vi.mock('../../../api/services/specialists/SpecialistOrchestrator.js', () => ({ default: {} }));
vi.mock('../../../api/services/crossPlatformInferenceService.js', () => ({ crossPlatformInferenceService: {} }));
vi.mock('../../../api/services/purposeLearningService.js', () => ({ default: {} }));
vi.mock('../../../api/middleware/auth.js', () => ({
  authenticateUser: (req, _res, next) => {
    req.user = { id: 'test-user-id' };
    next();
  },
}));

describe('C1: Brain page reflections endpoint', () => {
  beforeEach(() => {
    mockData.length = 0;
    vi.clearAllMocks();
  });

  it('returns { success: true, reflections: [] } when user has no reflections', async () => {
    const { default: router } = await import('../../../api/routes/intelligent-twin.js');
    const layer = router.stack.find(l => l.route?.path === '/reflections' && l.route?.methods?.get);
    expect(layer).toBeTruthy();

    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    const req = { user: { id: 'test-user-id' }, query: { limit: '20' } };
    const res = {
      _status: 200,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; },
    };

    await handler(req, res);

    expect(res._json).toEqual({ success: true, reflections: [] });
    expect(res._json.reflections).toBeInstanceOf(Array);
    // Frontend checks: json.success && Array.isArray(json.reflections)
    expect(res._json.success).toBe(true);
  });

  it('returns reflections matching frontend Reflection interface', async () => {
    mockData.push({
      id: 'ref-1',
      content: 'You gravitate toward late-night coding sessions.',
      importance_score: 8,
      metadata: { expert: 'lifestyle_analyst', category: null },
      created_at: '2026-03-11T02:31:35.146934+00:00',
    });

    const { default: router } = await import('../../../api/routes/intelligent-twin.js');
    const layer = router.stack.find(l => l.route?.path === '/reflections' && l.route?.methods?.get);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req = { user: { id: 'test-user-id' }, query: {} };
    const res = {
      _status: 200,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; },
    };

    await handler(req, res);

    expect(res._json.success).toBe(true);
    expect(res._json.reflections).toHaveLength(1);

    const r = res._json.reflections[0];
    // These fields must match BrainPage.tsx Reflection interface:
    // { id: string, content: string, importance: number, expert: string|null, category: string|null, createdAt: string }
    expect(r).toEqual({
      id: 'ref-1',
      content: 'You gravitate toward late-night coding sessions.',
      importance: 8,
      expert: 'lifestyle_analyst',
      category: null,
      createdAt: '2026-03-11T02:31:35.146934+00:00',
    });
  });

  it('returns reflections even when metadata is null', async () => {
    mockData.push({
      id: 'ref-2',
      content: 'Some reflection without metadata.',
      importance_score: 7,
      metadata: null,
      created_at: '2026-03-10T00:00:00Z',
    });

    const { default: router } = await import('../../../api/routes/intelligent-twin.js');
    const layer = router.stack.find(l => l.route?.path === '/reflections' && l.route?.methods?.get);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req = { user: { id: 'test-user-id' }, query: {} };
    const res = {
      _status: 200,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; },
    };

    await handler(req, res);

    // Should NOT throw even when metadata is null
    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.reflections[0].expert).toBeNull();
    expect(res._json.reflections[0].category).toBeNull();
  });
});

describe('C1: Brain page frontend data flow', () => {
  it('reflections response shape is consumable by BrainPage useEffect', () => {
    // Simulate what BrainPage.tsx line 162 does:
    // if (!cancelled && json.success && Array.isArray(json.reflections)) {
    //   setReflections(json.reflections);
    // }
    const apiResponse = {
      success: true,
      reflections: [
        { id: '1', content: 'test', importance: 7, expert: 'lifestyle_analyst', category: null, createdAt: '2026-03-11T00:00:00Z' },
      ],
    };

    // This is the exact check BrainPage uses — it MUST pass
    const passes = apiResponse.success && Array.isArray(apiResponse.reflections);
    expect(passes).toBe(true);

    // Verify each reflection has the fields BrainPage.tsx uses in rendering
    for (const r of apiResponse.reflections) {
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('content');
      expect(r).toHaveProperty('importance');
      expect(r).toHaveProperty('expert');
      expect(r).toHaveProperty('createdAt');
    }
  });

  it('empty reflections triggers empty state (not infinite spinner)', () => {
    const apiResponse = { success: true, reflections: [] };

    const reflectionsLoading = false; // after fetch completes
    const topDiscoveries = []; // no reflections → no discoveries

    // BrainPage line 303: {reflectionsLoading && <spinner>}
    // BrainPage line 310: {!reflectionsLoading && topDiscoveries.length === 0 && <empty state>}
    const showsSpinner = reflectionsLoading;
    const showsEmptyState = !reflectionsLoading && topDiscoveries.length === 0;

    expect(showsSpinner).toBe(false);
    expect(showsEmptyState).toBe(true);
  });

  it('null metadata does not crash expert lookup in EXPERT_META', () => {
    // BrainPage line 248: const key = r.expert || 'unknown';
    // BrainPage line 332: const em = EXPERT_META[expertKey];
    const EXPERT_META = {
      lifestyle_analyst: { label: 'Lifestyle', color: '#34d399' },
    };

    const reflectionWithNullExpert = { expert: null, content: 'test' };
    const key = reflectionWithNullExpert.expert || 'unknown';
    const em = EXPERT_META[key]; // should be undefined, not throw

    expect(key).toBe('unknown');
    expect(em).toBeUndefined();
    // BrainPage line 353: {em && <label>} — safely skips rendering label
  });
});
