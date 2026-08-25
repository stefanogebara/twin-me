/**
 * Non-email fallout of the magic-link outage (2026-08-24).
 * ========================================================
 * Root cause #1 of that outage was not an email bug at all: on Vercel
 * serverless the invocation is FROZEN the moment the response flushes, so any
 * promise still in flight never runs. `doWork(...).catch(...)` immediately
 * before `res.json()` / `res.redirect()` is a never-runs, not a background job.
 *
 * The email call sites were fixed in emailSendReliability.test.js. The same
 * pattern survived on four non-email side effects in auth-simple.js, each with
 * its own silent, user-visible consequence:
 *
 *   1. betaInviteService.redeemInviteCode — the invite is never marked used,
 *      so a single-use beta code stays redeemable forever. Four call sites
 *      (email signup, magic-link verify, OAuth GET, OAuth POST).
 *   2. betaInviteService.addToWaitlist — a user rejected at the beta gate is
 *      redirected to /waitlist and told they are on the list, but the row is
 *      never written. They are on neither list.
 *   3. profileEnrichmentService.enrichFromEmail — new users never get an
 *      enriched profile, which is exactly what the onboarding "instant wow"
 *      screen reads. Enrichment fans out to several external APIs and cannot
 *      be awaited inside an OAuth redirect, so it belongs on the durable
 *      queue (Inngest), not detached from a dying invocation.
 *   4. The /verify Redis profile cache — the SET after the Supabase read never
 *      lands, so the 5-minute cache has never once been populated in
 *      production and every /verify pays a full DB round-trip.
 *
 * Enrichment carried a SECOND bug that the freeze hid: enrichFromEmail
 * resolves `{ success, data }`, and the call sites passed that WRAPPER into
 * saveEnrichment, which reads `enrichmentData.discovered_*` off it. Un-freezing
 * the call without unwrapping would have started writing all-null
 * enriched_profiles rows with source 'unknown' — a worse failure than doing
 * nothing, because the onboarding screen would treat them as a real result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, '../../api');
const AUTH_FILE = path.join(API_DIR, 'routes/auth-simple.js');

// ---------------------------------------------------------------------------
// Fire-and-forget guard — the same scan emailSendReliability.test.js runs for
// senders, over the non-email side effects that must also finish inside the
// request lifetime.
//
// Files that DEFINE these functions are excluded: their own declarations and
// internal delegations are not call sites we care about.
// ---------------------------------------------------------------------------

const GUARDED = [
  'redeemInviteCode',
  'addToWaitlist',
  'enrichFromEmail',
  'saveEnrichment',
];

const DEFINING_FILES = [
  'services/betaInviteService.js',
  'services/profileEnrichmentService.js',
  'services/enrichment/enrichmentStore.js',
].map(f => path.join(API_DIR, f));

function walkJs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '_archive') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkJs(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

// Comment lines are prose ABOUT these functions, not call sites — this file
// and the fixed routes both describe the bug in words, and a scanner that
// can't tell the difference cries wolf on its own documentation.
function isCommented(line, column) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  return line.slice(0, column).includes('//');
}

const callSites = [];
for (const file of walkJs(API_DIR)) {
  if (DEFINING_FILES.includes(file)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const name of GUARDED) {
    const pattern = new RegExp(`\\b${name}\\s*\\(`, 'g');
    lines.forEach((line, idx) => {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        // Imports/re-exports name the function without invoking it meaningfully.
        if (/^\s*(import|export)\b/.test(line)) continue;
        if (isCommented(line, match.index)) continue;
        const before = line.slice(0, match.index);
        if (/\bfunction\s+$/.test(before)) continue;
        callSites.push({
          file: path.relative(API_DIR, file),
          line: idx + 1,
          name,
          detached: !(/\bawait\s+[\w.]*$/.test(before) || /\breturn\s+[\w.]*$/.test(before)),
        });
      }
    });
  }
}

describe('no post-response side effect is left detached on Vercel', () => {
  it('finds the known call sites (the guard is actually scanning something)', () => {
    expect(callSites.length).toBeGreaterThanOrEqual(5);
  });

  it('awaits (or returns) every guarded side effect inside the request lifetime', () => {
    const forgotten = callSites
      .filter(c => c.detached)
      .map(c => `${c.file}:${c.line} — ${c.name}() is not awaited`);
    expect(forgotten).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Enrichment specifically must NOT be awaited inline — it fans out to Gravatar,
// GitHub, Brave/Gemini, PDL and an LLM narrative pass. It goes on the queue.
// ---------------------------------------------------------------------------

describe('profile enrichment runs on the durable queue, not in the auth request', () => {
  const authSource = readFileSync(AUTH_FILE, 'utf8');

  it('auth-simple.js no longer calls the enrichment service directly', () => {
    const enrichCalls = callSites.filter(
      c => c.file === 'routes/auth-simple.js' && (c.name === 'enrichFromEmail' || c.name === 'saveEnrichment')
    );
    expect(enrichCalls).toEqual([]);
    expect(authSource).not.toMatch(/^import .*profileEnrichmentService/m);
  });

  it('auth-simple.js enqueues the enrichment event instead', async () => {
    expect(authSource).toMatch(/inngest\.send\(/);
    const { EVENTS } = await import('../../api/services/inngestClient.js');
    expect(EVENTS.ENRICH_PROFILE).toBe('twin/profile.enrich');
    expect(authSource).toMatch(/EVENTS\.ENRICH_PROFILE/);
  });

  it('the enqueue is awaited — a detached send is frozen exactly like the work was', () => {
    const sends = [...authSource.matchAll(/inngest\.send\(/g)];
    expect(sends.length).toBeGreaterThanOrEqual(1);
    for (const m of sends) {
      const before = authSource.slice(Math.max(0, m.index - 20), m.index);
      expect(before, `inngest.send at index ${m.index} is not awaited`).toMatch(/\bawait\s+$/);
    }
  });

  it('the enrichment function is registered on the Inngest serve endpoint', () => {
    const serveSource = readFileSync(path.join(API_DIR, 'routes/inngest.js'), 'utf8');
    expect(serveSource).toMatch(/profileEnrichmentFunction/);
    expect(serveSource).toMatch(/functions\/profileEnrichment\.js/);
  });

  it('stays within the Inngest plan concurrency cap of 5', () => {
    const fnSource = readFileSync(path.join(API_DIR, 'inngest/functions/profileEnrichment.js'), 'utf8');
    for (const m of fnSource.matchAll(/limit:\s*(\d+)/g)) {
      expect(Number(m[1])).toBeLessThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// The shape bug the freeze was hiding.
// ---------------------------------------------------------------------------

const enrichMock = vi.fn();
const saveMock = vi.fn().mockResolvedValue({ success: true });
vi.mock('../../api/services/profileEnrichmentService.js', () => ({
  profileEnrichmentService: {
    enrichFromEmail: (...a) => enrichMock(...a),
    saveEnrichment: (...a) => saveMock(...a),
  },
}));

describe('enrichAndSaveProfile unwraps the { success, data } envelope', () => {
  beforeEach(() => {
    enrichMock.mockReset();
    saveMock.mockClear();
  });

  it('saves the inner data, not the wrapper (a wrapper writes an all-null row)', async () => {
    enrichMock.mockResolvedValue({
      success: true,
      data: { discovered_name: 'Ada Lovelace', discovered_company: 'Analytical Engines', source: 'brave' },
    });
    const { enrichAndSaveProfile } = await import('../../api/inngest/functions/profileEnrichment.js');

    const result = await enrichAndSaveProfile({ userId: 'u1', email: 'ada@example.com', fullName: 'Ada Lovelace' });

    expect(saveMock).toHaveBeenCalledOnce();
    const [, , saved] = saveMock.mock.calls[0];
    expect(saved.discovered_name).toBe('Ada Lovelace');
    expect(saved.source).toBe('brave');
    expect(saved).not.toHaveProperty('success');
    expect(saved).not.toHaveProperty('data');
    expect(result.enriched).toBe(true);
  });

  it('does not write a row when enrichment returned nothing usable', async () => {
    enrichMock.mockResolvedValue({ success: false, data: null });
    const { enrichAndSaveProfile } = await import('../../api/inngest/functions/profileEnrichment.js');

    const result = await enrichAndSaveProfile({ userId: 'u1', email: 'ada@example.com' });

    expect(saveMock).not.toHaveBeenCalled();
    expect(result.enriched).toBe(false);
  });

  it('skips entirely without a userId or email rather than upserting a junk row', async () => {
    const { enrichAndSaveProfile } = await import('../../api/inngest/functions/profileEnrichment.js');

    await expect(enrichAndSaveProfile({ userId: null, email: 'ada@example.com' }))
      .resolves.toMatchObject({ enriched: false });
    expect(enrichMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The /verify Redis cache — written detached, so never written at all.
// ---------------------------------------------------------------------------

describe('the /verify profile cache is actually written', () => {
  const authSource = readFileSync(AUTH_FILE, 'utf8');

  it('awaits the cache SET after the Supabase read', () => {
    expect(authSource).toMatch(/await\s+redis\.set\(cacheKey/);
    expect(authSource).not.toMatch(/^\s*redis\.set\(cacheKey/m);
  });

  it('awaits the logout cache bust (a stale profile otherwise survives logout)', () => {
    expect(authSource).toMatch(/await\s+redisClient\.del\(`verify:/);
  });
});
