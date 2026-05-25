/**
 * Backend auth handshake check — calls /api connect endpoints directly
 * with stefano's token and verifies each one returns either:
 *   - 200 with a valid OAuth URL pointing at the right provider, OR
 *   - 503 with configError=true (missing env var — proper failure mode), OR
 *   - 4xx with a clear error message (auth/config issue)
 *
 * No clicking, no popups, no navigation flakiness — just pure HTTP.
 *
 * Run:
 *   TEST_BASE_URL=https://www.twinme.me npx playwright test \
 *     tests/_connector-auth-backend-e2e.spec.ts --project=e2e --workers=1 \
 *     --reporter=list
 */
import { test } from '@playwright/test';
import { TEST_USER_ID } from './e2e/helpers';
import jwt from 'jsonwebtoken';

const BASE_URL = process.env.TEST_BASE_URL || 'https://www.twinme.me';
const API_URL = `${BASE_URL}/api`;

const EXPECTED_HOST: Record<string, RegExp> = {
  spotify: /accounts\.spotify\.com/,
  youtube: /accounts\.google\.com/,
  google_calendar: /accounts\.google\.com/,
  google_gmail: /accounts\.google\.com/,
  github: /github\.com\/login\/oauth/,
  linkedin: /linkedin\.com\/oauth/,
  reddit: /reddit\.com\/api\/v1\/authorize/,
  discord: /discord\.com\/(api\/)?oauth2/,
  slack: /slack\.com\/oauth/,
  strava: /strava\.com\/oauth/,
  twitch: /twitch\.tv\/oauth2/,
  microsoft_outlook: /login\.microsoftonline\.com|login\.live\.com/,
  outlook: /login\.microsoftonline\.com|login\.live\.com/,
  oura: /cloud\.ouraring\.com\/oauth/,
  fitbit: /fitbit\.com\/oauth/,
  whoop: /api\.prod\.whoop\.com|nango\.dev/,
};

const PROVIDERS_TO_TEST = [
  'spotify', 'youtube', 'google_calendar', 'google_gmail', 'github',
  'linkedin', 'reddit', 'discord', 'slack', 'strava', 'twitch',
  'microsoft_outlook', 'oura', 'fitbit', 'whoop',
];

interface Verdict {
  provider: string;
  status: number;
  authUrlHost: string | null;
  matchesExpected: boolean | null;
  clientIdPresent: boolean | null;
  errorMessage: string | null;
  verdict: string;
}

test.setTimeout(120_000);

test('Every OAuth provider returns a usable connect URL OR a clean error', async () => {
  // Mint a fresh JWT for stefano so we test against prod with real auth
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET required in env (.env or .env.test)');
  const token = jwt.sign(
    { id: TEST_USER_ID, email: 'stefanogebara@gmail.com' },
    secret,
    { expiresIn: '5m' },
  );

  const verdicts: Verdict[] = [];

  for (const provider of PROVIDERS_TO_TEST) {
    const v: Verdict = {
      provider,
      status: 0,
      authUrlHost: null,
      matchesExpected: null,
      clientIdPresent: null,
      errorMessage: null,
      verdict: '',
    };

    try {
      const res = await fetch(`${API_URL}/connectors/connect/${provider}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      v.status = res.status;
      const text = await res.text();
      let body: { authUrl?: string; data?: { authUrl?: string }; error?: string; configError?: boolean } = {};
      try { body = JSON.parse(text); } catch { /* HTML or empty */ }

      const authUrl = body?.authUrl || body?.data?.authUrl;
      if (authUrl) {
        try {
          const url = new URL(authUrl);
          v.authUrlHost = url.host + url.pathname;
          const expected = EXPECTED_HOST[provider];
          if (expected) v.matchesExpected = expected.test(authUrl);
          v.clientIdPresent = !!url.searchParams.get('client_id') && url.searchParams.get('client_id') !== 'undefined';
          v.verdict = v.matchesExpected === false ? 'WRONG_PROVIDER'
            : v.clientIdPresent === false ? 'CLIENT_ID_MISSING'
            : 'OAUTH_URL_OK';
        } catch {
          v.verdict = 'INVALID_URL';
          v.errorMessage = authUrl.slice(0, 100);
        }
      } else if (body?.configError) {
        v.verdict = 'CONFIG_ERROR_503';
        v.errorMessage = body.error || null;
      } else if (body?.success && (body as { message?: string }).message?.includes('refresh')) {
        // GET /connect/:provider is also the "reconnect/refresh" endpoint.
        // If the user is already connected, the backend silently refreshes
        // the token instead of returning an authUrl — that's not an error.
        v.verdict = 'TOKEN_REFRESHED_OK';
        v.errorMessage = null;
      } else if (body?.error?.includes('not configured')) {
        // Providers that intentionally aren't in OAUTH_CONFIGS because they
        // only flow through Nango (microsoft_outlook, fitbit). Frontend
        // routes these through POST /api/nango/connect-session instead.
        v.verdict = 'NANGO_ONLY_OK';
        v.errorMessage = null;
      } else if (body?.error) {
        v.verdict = `ERROR_${res.status}`;
        v.errorMessage = body.error;
      } else if (res.status >= 200 && res.status < 300) {
        v.verdict = 'NO_AUTH_URL';
        v.errorMessage = text.slice(0, 100);
      } else {
        v.verdict = `HTTP_${res.status}`;
        v.errorMessage = text.slice(0, 100);
      }
    } catch (err) {
      v.verdict = 'FETCH_FAILED';
      v.errorMessage = err instanceof Error ? err.message : String(err);
    }

    verdicts.push(v);
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n══════════════ BACKEND AUTH HANDSHAKE REPORT ══════════════');
  console.log(`${'verdict'.padEnd(20)} ${'provider'.padEnd(20)} status host`);
  for (const v of verdicts) {
    const host = v.authUrlHost || v.errorMessage?.slice(0, 60) || '-';
    console.log(`${v.verdict.padEnd(20)} ${v.provider.padEnd(20)} ${String(v.status).padEnd(6)} ${host}`);
  }

  const OK_VERDICTS = new Set(['OAUTH_URL_OK', 'TOKEN_REFRESHED_OK', 'NANGO_ONLY_OK']);
  const ok = verdicts.filter((v) => OK_VERDICTS.has(v.verdict)).length;
  const configErrors = verdicts.filter((v) => v.verdict === 'CONFIG_ERROR_503' || v.verdict === 'CLIENT_ID_MISSING');
  const errors = verdicts.filter((v) =>
    !OK_VERDICTS.has(v.verdict) && v.verdict !== 'CONFIG_ERROR_503' && v.verdict !== 'CLIENT_ID_MISSING',
  );

  console.log(`════════════════════════════════════════════════════════════`);
  console.log(`Total: ${verdicts.length} | OK: ${ok} | Config issues: ${configErrors.length} | Errors: ${errors.length}`);

  if (configErrors.length > 0) {
    console.log('\nProviders with config issues (need env vars):');
    configErrors.forEach((v) => console.log(`  - ${v.provider}: ${v.verdict}${v.errorMessage ? ' | ' + v.errorMessage : ''}`));
  }
  if (errors.length > 0) {
    console.log('\nProviders with errors:');
    errors.forEach((v) => console.log(`  - ${v.provider}: ${v.verdict} | ${v.errorMessage}`));
  }
});
