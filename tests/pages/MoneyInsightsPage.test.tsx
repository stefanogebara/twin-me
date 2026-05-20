/**
 * Render smoke test for MoneyInsightsPage (Phase 4.4 moat surface).
 *
 * vitest is configured with environment: 'node' and no jsdom + RTL.
 * Rather than install those (and stand up a workspace split for component
 * tests), this test uses react-dom/server's renderToStaticMarkup, which
 * runs in pure Node without ever touching `document` or `window`.
 *
 * What this catches that jsxParseSmoke cannot:
 *   - Module-load errors (missing imports, circular deps, named-export typos).
 *   - Initial-render crashes ("Cannot read X of undefined" before the first
 *     useEffect resolves).
 *   - JSX prop-type mismatches with sub-components (e.g. renaming a prop
 *     in BrokerageHoldingsCard but forgetting to update the caller).
 *
 * What it deliberately does NOT cover:
 *   - Post-mount behaviour (useEffect, async fetch state transitions —
 *     SSR runs synchronously and useEffect callbacks never fire).
 *   - DOM events / user interaction (no jsdom, no Testing Library).
 *   - Visual regression (no snapshots — Stitch / Playwright cover that).
 *
 * If a regression in this test fires, the page is broken at first paint
 * and the smoke isn't theoretical.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ── mocks ─────────────────────────────────────────────────────────────────────
// Mock react-router-dom so we don't need a Router wrapper. useNavigate
// returns a no-op so the page renders its loading-then-empty state.
vi.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: '/money/insights', search: '', hash: '', state: null, key: '' }),
  useParams: () => ({}),
  Link: ({ children }: { children?: React.ReactNode }) => React.createElement('a', null, children),
}));

// Stub useDocumentTitle — pure hook that calls document.title, no-op in SSR.
vi.mock('@/hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => {},
}));

// Stub the API so initial state stays empty and useEffect-fired requests
// (which won't run under SSR, but might if a future refactor adds a
// synchronous data path) return safe empty defaults.
vi.mock('@/services/api/transactionsAPI', () => ({
  getInvestmentCorrelationInsights: vi.fn(async () => []),
  getRecurringSubscriptions: vi.fn(async () => ({
    success: true,
    count: 0,
    totalMonthly: 0,
    currency: 'USD',
    synthesis: '',
    stressfulSignupCount: 0,
    subscriptions: [],
  })),
  getTimelineAnalysis: vi.fn(async () => []),
}));

// Stub the heavy sub-components — they have their own dependency trees
// (charts, lucide icons, more API calls). Rendering them as null keeps
// the smoke test focused on the parent page's own JSX and state wiring.
vi.mock('@/pages/components/money/BrokerageHoldingsCard', () => ({
  BrokerageHoldingsCard: () => React.createElement('div', { 'data-stub': 'BrokerageHoldingsCard' }),
}));
vi.mock('@/pages/components/money/BrokerageActivityCard', () => ({
  BrokerageActivityCard: () => React.createElement('div', { 'data-stub': 'BrokerageActivityCard' }),
}));
vi.mock('@/pages/components/money/StressSpendTimeline', () => ({
  StressSpendTimeline: () => React.createElement('div', { 'data-stub': 'StressSpendTimeline' }),
}));

// Lucide icons are SSR-safe but pull in lots of source files; the page
// renders fine without them — stub the specific icons used so we don't
// recurse into the icon registry just to draw an arrow.
vi.mock('lucide-react', () => {
  const Stub = () => React.createElement('span', null);
  return {
    ArrowLeft: Stub, Brain: Stub, AlertCircle: Stub, Loader2: Stub,
    Repeat: Stub, TrendingUp: Stub, MessageCircle: Stub, ChevronDown: Stub,
    Sparkles: Stub, Activity: Stub, Music: Stub, Calendar: Stub,
    DollarSign: Stub, Heart: Stub, Moon: Stub, Zap: Stub, Trash2: Stub,
    Plus: Stub, Check: Stub, X: Stub, Settings: Stub, Loader: Stub,
  };
});

// ── test ──────────────────────────────────────────────────────────────────────
// Import the page AFTER mocks land. Default export per the page module.
const { default: MoneyInsightsPage } = await import('@/pages/MoneyInsightsPage');

describe('MoneyInsightsPage — render smoke', () => {
  it('mounts and produces non-empty markup at initial render (loading state)', () => {
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(React.createElement(MoneyInsightsPage));
    }).not.toThrow();

    // The page renders a loader skeleton on first paint while the API
    // promises are in flight. We assert there's *some* output — the
    // exact text is brittle, but "empty string" means the component
    // returned null without throwing, which is also a bug.
    expect(html.length).toBeGreaterThan(0);
    expect(typeof html).toBe('string');
  });

  it('renders without referencing window or document (pure-server-safe)', () => {
    // If anything in the component or its (un-mocked) imports touches
    // window.* or document.* during render, SSR throws ReferenceError.
    // We assert the renderToStaticMarkup call itself doesn't fail with
    // a Reference error — which proves the page is SSR-clean and safe
    // for future server-rendering layers (e.g. static generation).
    expect(() => {
      renderToStaticMarkup(React.createElement(MoneyInsightsPage));
    }).not.toThrow(/window is not defined|document is not defined/);
  });
});
