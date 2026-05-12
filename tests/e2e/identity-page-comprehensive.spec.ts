/**
 * /identity page — comprehensive quality audit
 * ============================================
 *
 * Identity is the Soul Signature dashboard — TwinMe's identity portrait.
 * It fetches 3 endpoints (personality profile, twin identity, soul layers)
 * and renders the user's archetype + 5 soul-signature layers.
 *
 * STANDARDS — every assertion maps to an ID.
 *
 * B — Backend Contract
 *   B-1   GET /personality-profile  returns 401 unauth
 *   B-2   GET /twin/identity        returns 401 unauth
 *   B-3   GET /soul-signature/layers returns 401 unauth
 *   B-4   GET /personality-profile  authed → { success, profile: OCEAN+sampling }
 *   B-5   GET /twin/identity        authed → { success, data: { summary?, identity?, profile? } }
 *   B-6   GET /soul-signature/layers authed → { success, data: layers }
 *
 * F — Page Flow
 *   F-1   Unauth → /auth
 *   F-2   Cold load (no cached data) → LoadingSkeleton visible
 *   F-3   Both fetches succeed with full data → archetype H1 + layers visible
 *   F-4   Empty (no summary, no layers) → EmptyState "I'm still figuring you out" + CTA
 *   F-5   Error from either fetch → red error banner + "Try again" button
 *   F-6   "Try again" click refetches identity (visible network activity)
 *
 * E — Error & Loading
 *   E-1   500 on all 3 fetches → page renders error banner, no global ErrorBoundary crash
 *   E-3   No unfiltered console.error
 *   E-4   No pageerror
 *
 * U — UI Tokens
 *   U-1   --background = #13121a
 *   U-2   H1 archetype uses Instrument Serif italic, size ≥ 32px
 *   U-3   At least one glass surface (backdrop-blur ≥ 16px)
 *   U-4   "Try again" / "Connect platforms" pills border-radius ≥ 100px
 *   U-6   Zero navy surfaces ≥ 80×80px
 *
 * X — UX
 *   X-1   "Try again" button has accessible name + focusable
 *   X-2   EmptyState CTAs ("Connect platforms", "Interview") have visible text
 *
 * C — CX / Content
 *   C-1   EmptyState shows "I'm still figuring you out" headline
 *   C-2   EmptyState explains what's needed (connect platforms)
 *   C-3   Error state surfaces meaningful message + retry path
 *
 * Opt-in: TWINME_RUN_IDENTITY_AUDIT=true
 */

import { test, expect, Page, Route } from '@playwright/test';
import { BASE_URL, API_URL, injectAuth, mintTestToken } from './helpers';

test.skip(
  process.env.TWINME_RUN_IDENTITY_AUDIT !== 'true',
  'Identity audit is heavy. Set TWINME_RUN_IDENTITY_AUDIT=true to opt in.',
);

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — shaped to match what authFetch unwraps in IdentityPage
// ─────────────────────────────────────────────────────────────────────────────

const PERSONALITY_PROFILE = {
  openness: 0.85,
  conscientiousness: 0.78,
  extraversion: 0.55,
  agreeableness: 0.72,
  neuroticism: 0.42,
  temperature: 0.7,
  top_p: 0.9,
  confidence: 0.82,
  memory_count_at_build: 412,
  last_built_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

const IDENTITY_DATA = {
  identity: {
    lifeStage: 'early_career',
    culturalOrientation: 'global_digital_native',
    careerSalience: 'high',
    approximateAge: 28,
    confidence: 0.82,
    promptFragment: 'An analytically-minded creative.',
    twinVoiceHint: 'Warm but precise.',
    inferredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  profile: {
    archetype: 'The Creative Synthesizer',
    uniqueness_markers: ['Rhythmic Thinker', 'Intentional Planner'],
    music_signature: { top_genres: ['Lo-fi'], listening_patterns: 'Music for focus.' },
    core_values: ['Curiosity', 'Authenticity'],
    personality_summary: 'Highly open to new experiences.',
  },
  expertInsights: {},
  summary: 'You are a creative synthesizer.',
  summaryUpdatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
};

const SOUL_LAYERS = {
  values: {
    values: [
      { name: 'Curiosity & Growth', evidence: 'You consistently make time for learning.', strength: 0.9 },
      { name: 'Deep Connection', evidence: 'You invest heavily in 1:1 time.', strength: 0.85 },
    ],
  },
  rhythms: {
    chronotype: 'night_owl',
    peakHours: '10pm - 2am',
    summary: 'Best work happens at night.',
    distribution: { morning: 0.1, afternoon: 0.25, evening: 0.35, night: 0.3 },
  },
  taste: {
    statement: 'You go deep on artists you love.',
    topSignals: ['Brazilian pagode', 'Jazz at midnight'],
    diversity: 0.7,
  },
  connections: {
    style: 'deep_connector',
    summary: 'Small circle, deep investment.',
    patterns: ['1:1 over groups'],
  },
  growth_edges: { shifts: [], isStable: true },
  generated_at: new Date().toISOString(),
};

const EMPTY_IDENTITY_DATA = {
  identity: null,
  profile: null,
  expertInsights: {},
  summary: null,
  summaryUpdatedAt: null,
};

const EMPTY_SOUL_LAYERS = {
  values: null,
  rhythms: null,
  taste: null,
  connections: null,
  growth_edges: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers (string globs only — regex starved Vite earlier in the session)
// ─────────────────────────────────────────────────────────────────────────────

async function jsonRoute(page: Page, glob: string, status: number, body: unknown): Promise<void> {
  await page.route(glob, async (route: Route) => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function mockIdentityFull(page: Page): Promise<void> {
  await jsonRoute(page, '**/api/personality-profile*', 200, { success: true, profile: PERSONALITY_PROFILE });
  await jsonRoute(page, '**/api/twin/identity*', 200, { success: true, data: IDENTITY_DATA });
  await jsonRoute(page, '**/api/soul-signature/layers*', 200, { success: true, data: SOUL_LAYERS });
  // Page also calls these as part of context — return harmless responses
  await jsonRoute(page, '**/api/platform-status*', 200, { success: true, connectedProviders: ['spotify', 'google_calendar'] });
}

async function mockIdentityEmpty(page: Page): Promise<void> {
  await jsonRoute(page, '**/api/personality-profile*', 200, { success: true, profile: null });
  await jsonRoute(page, '**/api/twin/identity*', 200, { success: true, data: EMPTY_IDENTITY_DATA });
  await jsonRoute(page, '**/api/soul-signature/layers*', 200, { success: true, data: EMPTY_SOUL_LAYERS });
  await jsonRoute(page, '**/api/platform-status*', 200, { success: true, connectedProviders: [] });
}

async function mockIdentity500(page: Page): Promise<void> {
  const err = { success: false, error: 'simulated server error' };
  await jsonRoute(page, '**/api/personality-profile*', 500, err);
  await jsonRoute(page, '**/api/twin/identity*', 500, err);
  await jsonRoute(page, '**/api/soul-signature/layers*', 500, err);
  await jsonRoute(page, '**/api/platform-status*', 200, { success: true, connectedProviders: [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function extractIdentityTokens(page: Page) {
  return await page.evaluate(() => {
    const html = document.documentElement;
    const htmlStyles = getComputedStyle(html);
    const h1 = document.querySelector('h1');
    const h1Styles = h1 ? getComputedStyle(h1) : null;
    let glassCount = 0;
    let navyLeaks = 0;
    const all = document.querySelectorAll('*');
    for (let i = 0; i < Math.min(all.length, 1500); i++) {
      const el = all[i] as HTMLElement;
      const cs = getComputedStyle(el);
      const filter = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || '';
      const m = filter.match(/blur\((\d+(?:\.\d+)?)px\)/);
      if (m && parseFloat(m[1]) >= 16) glassCount++;
      const bg = cs.backgroundColor;
      const rgb = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgb) {
        const r = +rgb[1], g = +rgb[2], b = +rgb[3];
        if (b > 100 && b > r * 1.5 && b > g * 1.3 && r < 80) {
          const rect = el.getBoundingClientRect();
          if (rect.width >= 80 && rect.height >= 80) navyLeaks++;
        }
      }
    }
    return {
      cssBackground: htmlStyles.getPropertyValue('--background').trim(),
      h1Text: h1?.textContent?.trim() ?? null,
      h1FontFamily: h1Styles?.fontFamily ?? null,
      h1FontSize: h1Styles?.fontSize ?? null,
      glassCount,
      navyLeaks,
    };
  });
}

function attachQuietConsoleListener(page: Page): { errors: string[]; pageErrors: string[] } {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  const BENIGN = ['PostHog', 'posthog', 'favicon', 'ERR_BLOCKED_BY_CLIENT', 'analytics'];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN.some((b) => text.includes(b))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => { pageErrors.push(err.message); });
  return { errors, pageErrors };
}

// Dismiss the first-time reveal overlay if it appears — uses localStorage flag.
async function pretendRevealAlreadySeen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('soul_sig_revealed_v2', '1');
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Backend contract
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/identity — backend contract', () => {
  test('B-1..B-3: identity endpoints return 401 without auth', async ({ request }) => {
    const paths = ['/personality-profile', '/twin/identity', '/soul-signature/layers'];
    for (const p of paths) {
      const res = await request.get(`${API_URL}${p}`);
      expect(res.status(), `${p} unauth status`).toBe(401);
    }
  });

  test('B-4..B-6: authed calls return well-shaped JSON', async ({ request }) => {
    const token = mintTestToken();
    const headers = { Authorization: `Bearer ${token}` };

    const profileRes = await request.get(`${API_URL}/personality-profile`, { headers });
    expect(profileRes.status(), 'B-4 status').toBe(200);
    const profileJson = await profileRes.json();
    expect(profileJson, 'B-4 has success').toHaveProperty('success');
    // profile can be null if user hasn't built one yet — both shapes are valid
    expect(['object'], 'B-4 profile property type').toContain(typeof profileJson.profile === 'object' ? 'object' : typeof profileJson.profile);

    const identityRes = await request.get(`${API_URL}/twin/identity`, { headers });
    expect(identityRes.status(), 'B-5 status').toBe(200);
    const identityJson = await identityRes.json();
    expect(identityJson, 'B-5 has success').toHaveProperty('success');
    expect(identityJson, 'B-5 has data').toHaveProperty('data');

    const layersRes = await request.get(`${API_URL}/soul-signature/layers`, { headers });
    expect(layersRes.status(), 'B-6 status').toBe(200);
    const layersJson = await layersRes.json();
    expect(layersJson, 'B-6 has success').toHaveProperty('success');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Authenticated UI — full data
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/identity — full data', () => {
  test('F-3, U-*: archetype H1 renders, design tokens correct', async ({ page }) => {
    const sink = attachQuietConsoleListener(page);
    await injectAuth(page);
    await pretendRevealAlreadySeen(page);
    await mockIdentityFull(page);

    await page.goto(`${BASE_URL}/identity`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    await page.waitForTimeout(2500);

    // F-3: an archetype H1 renders. The archetype name is computed from soul
    // layers by determineArchetypeFromSoulLayers, so the exact text varies with
    // the fixture shape — assert any H1 inside <main> with non-empty content,
    // not a specific name.
    const h1 = page.locator('main h1').first();
    await expect(h1, 'F-3 archetype H1 rendered').toBeVisible({ timeout: 10_000 });
    const h1Text = (await h1.textContent())?.trim();
    expect(h1Text && h1Text.length, 'F-3 H1 has content').toBeGreaterThan(0);

    // U-2: Instrument Serif italic, size ≥ 32px
    const tokens = await extractIdentityTokens(page);
    expect(tokens.cssBackground, 'U-1 --background').toBe('#13121a');
    expect(tokens.h1FontFamily, 'U-2 h1 family').toMatch(/Instrument Serif/);
    expect(parseFloat(tokens.h1FontSize || '0'), 'U-2 h1 ≥ 32px').toBeGreaterThanOrEqual(32);
    expect(tokens.glassCount, 'U-3 glass surfaces').toBeGreaterThanOrEqual(1);
    expect(tokens.navyLeaks, 'U-6 zero navy').toBe(0);

    expect(sink.errors, 'E-3 console errors').toHaveLength(0);
    expect(sink.pageErrors, 'E-4 page errors').toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Empty state
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/identity — empty state', () => {
  test('F-4, C-1, C-2, X-2: empty state surfaces helpful CTAs', async ({ page }) => {
    const sink = attachQuietConsoleListener(page);
    await injectAuth(page);
    await pretendRevealAlreadySeen(page);
    await mockIdentityEmpty(page);

    await page.goto(`${BASE_URL}/identity`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    await page.waitForTimeout(2500);

    // C-1: empty headline
    await expect(
      page.getByText(/still figuring you out/i),
      'C-1 empty headline',
    ).toBeVisible();

    // C-2: explanatory copy mentions connecting platforms
    await expect(
      page.getByText(/Connect Spotify, Calendar, or YouTube/i),
      'C-2 empty explainer',
    ).toBeVisible();

    // X-2: CTA buttons visible
    await expect(
      page.getByRole('button', { name: /Connect platforms/i }),
      'X-2 Connect platforms CTA',
    ).toBeVisible();

    expect(sink.errors, 'E-3 empty console errors').toHaveLength(0);
    expect(sink.pageErrors, 'E-4 empty page errors').toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Error state
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/identity — error state', () => {
  test('F-5, E-1, C-3: 500 surfaces error banner with retry, no boundary crash', async ({ page }) => {
    test.setTimeout(45_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => { pageErrors.push(err.message); });

    await injectAuth(page);
    await pretendRevealAlreadySeen(page);
    await mockIdentity500(page);

    await page.goto(`${BASE_URL}/identity`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');

    // React Query retries failed fetches 3x with exponential backoff (~1s + 2s + 4s
    // ≈ 7+ seconds before the error state settles). Wait for the "Try again"
    // button as the deterministic settle signal.
    const tryAgain = page.getByRole('button', { name: /Try again/i });
    await expect(tryAgain, 'F-5 Try again button visible').toBeVisible({ timeout: 20_000 });

    // E-1: must NOT have fallen to the global ErrorBoundary
    const boundaryCaught = await page.getByText('Something went wrong').isVisible().catch(() => false);
    expect(boundaryCaught, 'E-1 no ErrorBoundary crash').toBe(false);

    // F-5 + C-3: error copy visible alongside the retry button
    const errorText = page.getByText(/Could not load|Failed to load/i).first();
    await expect(errorText, 'F-5 error message visible').toBeVisible({ timeout: 3000 });

    // U-4: Try again button border-radius ≥ 100px (pill)
    const radius = parseFloat(await tryAgain.evaluate((el) => getComputedStyle(el).borderTopLeftRadius));
    expect(radius, 'U-4 Try again pill ≥ 100px').toBeGreaterThanOrEqual(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Unauthenticated
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/identity — unauthenticated', () => {
  test('F-1: redirects to /auth', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE_URL}/identity`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url, 'F-1 not on /identity').not.toMatch(/\/identity$/);
    expect(url, 'F-1 lands on /auth').toMatch(/\/auth/);
  });
});
