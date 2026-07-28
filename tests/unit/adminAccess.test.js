/**
 * Unit tests for the admin-access source of truth (api/services/adminAccess.js).
 *
 * This helper decides the `isAdmin` boolean the SPA mirrors to gate admin
 * route shells. It is the UNION of the two backend gates (DB role +
 * ADMIN_EMAILS allowlist), so the frontend gate is never stricter than the
 * backend. These tests pin that contract, including the fail-closed defaults.
 */
import { describe, it, expect } from 'vitest';
import { computeIsAdmin, getAdminEmailAllowlist } from '../../api/services/adminAccess.js';

const env = (adminEmails) => ({ ADMIN_EMAILS: adminEmails });

describe('getAdminEmailAllowlist', () => {
  it('parses, trims, and lowercases a comma-separated list', () => {
    expect(getAdminEmailAllowlist(env(' Founder@Twinme.me , ops@twinme.me '))).toEqual([
      'founder@twinme.me',
      'ops@twinme.me',
    ]);
  });

  it('returns an empty list when ADMIN_EMAILS is unset or empty', () => {
    expect(getAdminEmailAllowlist(env(undefined))).toEqual([]);
    expect(getAdminEmailAllowlist(env(''))).toEqual([]);
    expect(getAdminEmailAllowlist(env(' , , '))).toEqual([]);
  });
});

describe('computeIsAdmin — email allowlist gate', () => {
  it('is true when the email is in ADMIN_EMAILS (case/space insensitive)', () => {
    expect(computeIsAdmin({ email: 'founder@twinme.me' }, env('founder@twinme.me'))).toBe(true);
    expect(computeIsAdmin({ email: '  Founder@TwinMe.me ' }, env('founder@twinme.me'))).toBe(true);
  });

  it('is false when the email is not in the allowlist', () => {
    expect(computeIsAdmin({ email: 'randomuser@gmail.com' }, env('founder@twinme.me'))).toBe(false);
  });

  it('fails closed with no allowlist configured', () => {
    expect(computeIsAdmin({ email: 'founder@twinme.me' }, env(''))).toBe(false);
  });
});

describe('computeIsAdmin — DB role gate (union, future-proof)', () => {
  it('is true for admin/professor roles regardless of the allowlist', () => {
    expect(computeIsAdmin({ role: 'admin', email: 'nobody@x.com' }, env(''))).toBe(true);
    expect(computeIsAdmin({ role: 'professor', email: 'nobody@x.com' }, env(''))).toBe(true);
    expect(computeIsAdmin({ role: 'ADMIN' }, env(''))).toBe(true);
  });

  it('is false for a non-admin role and non-allowlisted email', () => {
    expect(computeIsAdmin({ role: 'user', email: 'nobody@x.com' }, env('founder@twinme.me'))).toBe(false);
  });

  it('qualifies via EITHER gate (union)', () => {
    // role fails, email passes
    expect(computeIsAdmin({ role: 'user', email: 'founder@twinme.me' }, env('founder@twinme.me'))).toBe(true);
    // email fails, role passes
    expect(computeIsAdmin({ role: 'admin', email: 'nobody@x.com' }, env('founder@twinme.me'))).toBe(true);
  });
});

describe('computeIsAdmin — defensive defaults', () => {
  it('is false for empty / missing / malformed input', () => {
    expect(computeIsAdmin(undefined, env('founder@twinme.me'))).toBe(false);
    expect(computeIsAdmin({}, env('founder@twinme.me'))).toBe(false);
    expect(computeIsAdmin({ email: null, role: null }, env('founder@twinme.me'))).toBe(false);
    expect(computeIsAdmin({ email: 123 }, env('founder@twinme.me'))).toBe(false);
  });
});
