// @vitest-environment jsdom
/**
 * Money paints for a known person before the verify lands; everything else still waits
 * (M2-A, 2026-09-22). A browser with no earlier session waits everywhere.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ state: { isLoaded: false, isSignedIn: false, isAdmin: false, needsOnboarding: false, user: null as null | { id: string } } }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => auth.state }));
vi.mock('@/components/Wait', () => ({ default: () => <p>waiting</p> }));
vi.mock('@/lib/i18n', () => ({ useDictReady: () => true, langOf: () => 'en' }));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: (globalThis as { __path?: string }).__path || '/', search: '', hash: '' }),
  Navigate: ({ to }: { to: string }) => <p>go {to}</p>,
}));
import ProtectedRoute from '../../src/components/ProtectedRoute';

const at = (path: string) => { (globalThis as { __path?: string }).__path = path; return renderToStaticMarkup(<ProtectedRoute><p>page</p></ProtectedRoute>); };

describe('ProtectedRoute before the verify lands', () => {
  it('paints money for a person this browser knows', () => {
    auth.state = { isLoaded: false, isSignedIn: false, isAdmin: false, needsOnboarding: false, user: { id: 'u1' } };
    expect(at('/money')).toContain('page');
    expect(at('/money/month')).toContain('page');
    expect(at('/money/chat')).toContain('page');
  });
  it('still waits everywhere else, and for a stranger', () => {
    auth.state = { isLoaded: false, isSignedIn: false, isAdmin: false, needsOnboarding: false, user: { id: 'u1' } };
    expect(at('/admin/beta')).toContain('waiting');
    expect(at('/presence')).toContain('waiting');
    auth.state = { ...auth.state, user: null };
    expect(at('/money')).toContain('waiting');
  });
  it('sends a person whose verify failed to sign in', () => {
    auth.state = { isLoaded: true, isSignedIn: false, isAdmin: false, needsOnboarding: false, user: null };
    expect(at('/money')).toContain('go /auth?redirect=%2Fmoney');
  });
  it('renders a verified person as before', () => {
    auth.state = { isLoaded: true, isSignedIn: true, isAdmin: false, needsOnboarding: true, user: { id: 'u1' } };
    expect(at('/money')).toContain('page');
    expect(at('/presence')).toContain('go /money');
  });
});
