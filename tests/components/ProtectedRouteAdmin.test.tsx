/**
 * Gate test for ProtectedRoute's `requireAdmin` prop (defense-in-depth for
 * the /admin/* and /eval route shells).
 *
 * vitest runs in a node environment with no jsdom/RTL, so — like
 * tests/pages/MoneyInsightsPage.test.tsx — this renders synchronously with
 * react-dom/server's renderToStaticMarkup. react-router-dom's <Navigate> is
 * mocked to a marker element carrying its `to` target, and useAuth is stubbed
 * per-case, which is all we need to assert redirect vs. children.
 *
 * Acceptance covered: an authenticated non-admin visiting an admin route is
 * redirected to /today (the one home after the Phase 1 IA collapse) and never
 * sees the admin shell; an admin is unaffected; and the non-admin gate does
 * NOT regress ordinary routes.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProtectedRoute from '@/components/ProtectedRoute';

// ── mocks ───────────────────────────────────────────────────────────────────
// <Navigate> → a marker span exposing the redirect target as a data attribute.
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) =>
    React.createElement('span', { 'data-redirect': to }),
  useLocation: () => ({ pathname: '/admin/beta', search: '', hash: '' }),
}));

// useAuth → per-test controllable auth state.
let mockAuth: {
  isSignedIn: boolean;
  isLoaded: boolean;
  isAdmin: boolean;
  needsOnboarding: boolean;
};
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

const SHELL = 'SECRET-ADMIN-SHELL';
const renderGate = (requireAdmin: boolean) =>
  renderToStaticMarkup(
    React.createElement(
      ProtectedRoute,
      { requireAdmin },
      React.createElement('div', null, SHELL),
    ),
  );

beforeEach(() => {
  mockAuth = { isSignedIn: true, isLoaded: true, isAdmin: false, needsOnboarding: false };
});

describe('ProtectedRoute requireAdmin', () => {
  it('redirects an authenticated non-admin to /today and hides the shell', () => {
    mockAuth = { isSignedIn: true, isLoaded: true, isAdmin: false, needsOnboarding: false };
    const html = renderGate(true);
    expect(html).toContain('data-redirect="/today"');
    expect(html).not.toContain(SHELL);
  });

  it('renders the admin shell for an admin', () => {
    mockAuth = { isSignedIn: true, isLoaded: true, isAdmin: true, needsOnboarding: false };
    const html = renderGate(true);
    expect(html).toContain(SHELL);
    expect(html).not.toContain('data-redirect');
  });

  it('redirects a signed-out user to /auth (not /dashboard)', () => {
    mockAuth = { isSignedIn: false, isLoaded: true, isAdmin: false, needsOnboarding: false };
    const html = renderGate(true);
    expect(html).toContain('data-redirect="/auth');
    expect(html).not.toContain(SHELL);
  });

  it('shows the loader (no shell, no redirect) until auth is loaded', () => {
    mockAuth = { isSignedIn: true, isLoaded: false, isAdmin: false, needsOnboarding: false };
    const html = renderGate(true);
    expect(html).not.toContain(SHELL);
    expect(html).not.toContain('data-redirect');
  });

  it('does NOT gate ordinary routes: a non-admin sees a non-admin shell', () => {
    mockAuth = { isSignedIn: true, isLoaded: true, isAdmin: false, needsOnboarding: false };
    const html = renderGate(false);
    expect(html).toContain(SHELL);
    expect(html).not.toContain('data-redirect');
  });
});
