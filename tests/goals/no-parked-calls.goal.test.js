/**
 * Goal: the front end calls no parked address (2026-09-26, audit A1).
 *
 * M2-B deleted the retired twin's routes by following imports. A call from src/ to the API
 * is not an import, so three live doors kept calling parked prefixes and met a 410 on
 * production: "Make a key" (/api/api-keys), the Google Calendar return
 * (/api/connectors/callback) and the landing's email field (/api/discovery/scan). This reads
 * every call the front end makes, judges it with the server's own parkedPath(), and holds two
 * lines: the money surfaces call nothing parked, and the twin leftovers may only shrink.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parkedPath } from '../../api/_app/middleware/legacyTwin.js';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);

/* The shapes a call takes in src/: a path handed to authFetch or moneyFetch (relative to
   API_URL, which ends in /api); a fetch of `${API_URL}/...` or a local alias of it; and an
   endpoint chosen into a variable first (OAuthCallback). A template hole ends the path. */
const CALLS = [
  /\b(?:moneyFetch|authFetch)\(\s*['"`](\/[^'"`$?#\s]*)/g,
  /\b(?:fetch|runConnectionRequest)\(\s*`\$\{(?:API_URL|apiUrl|baseUrl)\}(\/[^`$?#\s]*)/g,
  /\b\w*[Ee]ndpoint\s*=\s*['"`](\/[^'"`$?#\s]*)/g,
];

function sources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every API path each file under src/ calls, as the server sees it (/api/...). */
function apiCalls(root = ROOT) {
  const calls = {};
  for (const file of sources(path.join(root, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    const found = new Set();
    for (const shape of CALLS) for (const match of text.matchAll(shape)) found.add(`/api${match[1]}`);
    if (found.size) calls[path.relative(root, file)] = [...found].sort();
  }
  return calls;
}

function parkedCalls(root = ROOT) {
  const parked = {};
  for (const [file, paths] of Object.entries(apiCalls(root))) {
    const hits = paths.filter((p) => parkedPath(p));
    if (hits.length) parked[file] = hits;
  }
  return parked;
}

/* What the money product is made of on the page: none of it may call a parked address. */
const MONEY = [
  /^src\/pages\/money\//,
  /^src\/services\/api\/money/,
  /^src\/components\/Money/,
  /^src\/pages\/Index\.tsx$/,
  /^src\/pages\/nocturne\/NocturneLanding\.tsx$/,
  /^src\/pages\/CustomAuth\.tsx$/,
];
const isMoney = (file) => MONEY.some((pattern) => pattern.test(file));

/* The retired twin's pages that are still routed. Each entry goes when its page goes (M2-1);
   nothing may be added. When a line disappears from the code, delete it here. */
const LEFTOVERS = {
  'src/components/onboarding/SoulRichnessBar.tsx': ['/api/memories'],
  'src/hooks/usePlatformsSummary.ts': ['/api/connectors/', '/api/platforms/summary'],
  'src/pages/AdminLLMCosts.tsx': ['/api/departments/budgets'],
  'src/pages/InstantTwinOnboarding.tsx': ['/api/enrichment/status/', '/api/insights/proactive/generate', '/api/onboarding/instant-signature', '/api/twins'],
  'src/pages/OAuthCallback.tsx': ['/api/entertainment/oauth/callback'],
  'src/pages/components/onboarding/ConnectionRevealCard.tsx': ['/api/mem0/memories'],
  'src/pages/components/onboarding/GenerateCTA.tsx': ['/api/soul-signature/archetype'],
  'src/pages/components/onboarding/PlatformConnectionsStep.tsx': ['/api/connect/pitch-hooks'],
  'src/pages/components/onboarding/usePlatformConnect.ts': ['/api/entertainment/connect/', '/api/nango/connect-session', '/api/nango/verify-connection'],
  'src/pages/components/settings/GoogleWorkspaceConnect.tsx': ['/api/entertainment/connect/google_gmail'],
  'src/services/api/importsAPI.ts': ['/api/imports', '/api/imports/process', '/api/imports/process-chat', '/api/imports/upload-url'],
  'src/services/api/instagramAPI.ts': ['/api/instagram/consent', '/api/instagram/data', '/api/instagram/data-summary', '/api/instagram/session', '/api/instagram/status', '/api/instagram/surfaces'],
};

describe('the front end calls no parked address', () => {
  it('reads the calls it is meant to read', () => {
    const calls = apiCalls();
    expect(calls['src/services/api/moneyAPI.ts']).toEqual(expect.arrayContaining(['/api/money/page', '/api/money/today', '/api/money/transactions/']));
    expect(Object.values(calls).flat().length).toBeGreaterThan(60);
  });

  it('keeps every money surface on live addresses', () => {
    const offending = Object.entries(parkedCalls()).filter(([file]) => isMoney(file)).flatMap(([file, paths]) => paths.map((p) => `${file} ${p}`));
    expect(offending).toEqual([]);
  });

  it('finishes the Google Calendar connection on a live address', () => {
    expect(parkedCalls()['src/pages/OAuthCallback.tsx'] || []).not.toContain('/api/connectors/callback');
  });

  it('lets the twin leftovers only shrink', () => {
    const found = Object.fromEntries(Object.entries(parkedCalls()).filter(([file]) => !isMoney(file)));
    const added = Object.entries(found).flatMap(([file, paths]) => paths.filter((p) => !(LEFTOVERS[file] || []).includes(p)).map((p) => `${file} ${p}`));
    const gone = Object.entries(LEFTOVERS).flatMap(([file, paths]) => paths.filter((p) => !(found[file] || []).includes(p)).map((p) => `${file} ${p}`));
    expect(added, 'a new call to a parked address').toEqual([]);
    expect(gone, 'no longer in the code: delete it from LEFTOVERS').toEqual([]);
  });
});
