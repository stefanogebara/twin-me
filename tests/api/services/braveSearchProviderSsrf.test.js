/**
 * SSRF egress guard for enrichment/braveSearchProvider.js.
 *
 * Audit 2026-07-04 (defense-in-depth, LOW severity): fetchPageText() does a
 * server-side fetch of URLs that come from Brave search RESULTS (indirect user
 * influence). A crafted result could aim that fetch at an internal address
 * (localhost, RFC1918, link-local incl. 169.254.169.254 cloud metadata). This
 * pins the two guard layers:
 *   1. isPublicHttpUrl(url) — pure allow/deny of the destination.
 *   2. fetchPageText redirect handling — a public host can't 3xx-bounce us to
 *      an internal IP, because each Location is re-validated.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Keep the import graph light + deterministic: the module top-level-imports
// llmGateway (which pulls the DB/Express graph) and logger. Neither is used by
// the code under test here.
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { isPublicHttpUrl, fetchPageText } = await import(
  '../../../api/services/enrichment/braveSearchProvider.js'
);

describe('isPublicHttpUrl — SSRF destination allow/deny', () => {
  describe('public destinations pass', () => {
    it.each([
      'https://example.com/article',
      'http://example.com',
      'https://sub.example.co.uk/path?q=1',
      'https://news.ycombinator.com/item?id=1',
      'http://8.8.8.8/',                     // public IPv4 literal
      'http://[2606:4700:4700::1111]/',      // public IPv6 literal
      'http://[::ffff:8.8.8.8]/',            // IPv4-mapped IPv6, public embedded
    ])('%s → true', (url) => {
      expect(isPublicHttpUrl(url)).toBe(true);
    });
  });

  describe('cloud metadata + IPv4 private/reserved ranges are blocked', () => {
    it.each([
      ['169.254.169.254 (cloud metadata)', 'http://169.254.169.254/latest/meta-data/'],
      ['169.254.0.0/16 link-local',        'http://169.254.10.10/'],
      ['127.0.0.0/8 loopback (dot-1)',     'http://127.0.0.1:8080/'],
      ['127.0.0.0/8 loopback (other)',     'http://127.5.5.5/'],
      ['10.0.0.0/8 private',               'http://10.0.0.5/'],
      ['172.16.0.0/12 low edge',           'http://172.16.0.1/'],
      ['172.16.0.0/12 high edge',          'http://172.31.255.255/'],
      ['192.168.0.0/16 private',           'http://192.168.1.1/'],
      ['0.0.0.0/8 unspecified',            'http://0.0.0.0/'],
    ])('blocks %s', (_label, url) => {
      expect(isPublicHttpUrl(url)).toBe(false);
    });

    // Addresses just OUTSIDE the 172.16/12 block must still be allowed —
    // proves the mask math isn't over-broad.
    it.each([
      'http://172.15.0.1/',
      'http://172.32.0.1/',
    ])('does NOT over-block %s (adjacent to 172.16/12)', (url) => {
      expect(isPublicHttpUrl(url)).toBe(true);
    });
  });

  describe('localhost is blocked', () => {
    it.each([
      'http://localhost/',
      'http://localhost:3004/api',
      'http://foo.localhost/',
    ])('blocks %s', (url) => {
      expect(isPublicHttpUrl(url)).toBe(false);
    });
  });

  describe('IPv6 loopback / ULA / link-local are blocked', () => {
    it.each([
      ['::1 loopback',        'http://[::1]/'],
      [':: unspecified',      'http://[::]/'],
      ['fc00::/7 ULA',        'http://[fc00::1]/'],
      ['fd..::/8 ULA',        'http://[fd12:3456::1]/'],
      ['fe80::/10 link-local','http://[fe80::1]/'],
      ['IPv4-mapped loopback','http://[::ffff:127.0.0.1]/'],
    ])('blocks %s', (_label, url) => {
      expect(isPublicHttpUrl(url)).toBe(false);
    });
  });

  describe('non-http(s) schemes are blocked', () => {
    it.each([
      'ftp://example.com/',
      'file:///etc/passwd',
      'gopher://example.com/',
      'data:text/html,<h1>hi</h1>',
      'ws://example.com/',
      'javascript:alert(1)',
    ])('blocks %s', (url) => {
      expect(isPublicHttpUrl(url)).toBe(false);
    });
  });

  describe('malformed / edge inputs are blocked', () => {
    it.each([
      ['empty string', ''],
      ['not a url', 'not a url'],
      ['relative path', '/latest/meta-data/'],
      ['scheme-only', 'http://'],
      ['out-of-range octet', 'http://256.256.256.256/'],
      ['null', null],
      ['undefined', undefined],
    ])('blocks %s', (_label, url) => {
      expect(isPublicHttpUrl(url)).toBe(false);
    });
  });
});

// --- fetchPageText redirect guard -----------------------------------------

/** Minimal Response stub: header lookup is case-insensitive like the real one. */
function makeResponse({ status = 200, headers = {}, body = '' } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    text: async () => body,
  };
}

const HTML = { 'content-type': 'text/html' };
// >50 chars of visible text after tag stripping, so the length gate passes.
const ARTICLE = '<html><body>' + 'Real article content about a real public person. '.repeat(3) + '</body></html>';

describe('fetchPageText — SSRF-hardened fetch', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns text for a normal public 200 (no redirect) — happy path preserved', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ status: 200, headers: HTML, body: ARTICLE }));
    const out = await fetchPageText('https://example.com/article');
    expect(out).toContain('Real article content');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Must use manual redirect mode (the guard's linchpin).
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('refuses a directly-private URL WITHOUT ever calling fetch', async () => {
    const out = await fetchPageText('http://169.254.169.254/latest/meta-data/');
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a non-http scheme without calling fetch', async () => {
    const out = await fetchPageText('file:///etc/passwd');
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows a public → public redirect and returns the final text', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ status: 302, headers: { location: 'https://cdn.example.com/final' } }))
      .mockResolvedValueOnce(makeResponse({ status: 200, headers: HTML, body: ARTICLE }));
    const out = await fetchPageText('https://example.com/start');
    expect(out).toContain('Real article content');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://cdn.example.com/final');
  });

  it('REFUSES a public → private (127.0.0.1) redirect — the classic bypass', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ status: 302, headers: { location: 'http://127.0.0.1:8080/admin' } }));
    const out = await fetchPageText('https://example.com/redirector');
    expect(out).toBeNull();
    // It fetched the public origin (1 call) but did NOT chase the internal hop.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('REFUSES a public → cloud-metadata redirect', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ status: 301, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }));
    const out = await fetchPageText('https://example.com/redirector');
    expect(out).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bails out after exceeding the redirect cap (public → public → ...)', async () => {
    // Every hop is a public 302 to another public URL → should stop at the cap
    // (MAX_REDIRECTS = 3) and return null rather than loop forever.
    fetchMock.mockImplementation(async (u) =>
      makeResponse({ status: 302, headers: { location: `https://example.com/next?from=${encodeURIComponent(u)}` } })
    );
    const out = await fetchPageText('https://example.com/loop');
    expect(out).toBeNull();
    // 1 initial + up to 3 followed hops, then the 4th redirect trips the cap.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('resolves a RELATIVE redirect Location against the current URL and re-guards it', async () => {
    // Relative Location "/final" resolves to the public origin → allowed.
    fetchMock
      .mockResolvedValueOnce(makeResponse({ status: 302, headers: { location: '/final' } }))
      .mockResolvedValueOnce(makeResponse({ status: 200, headers: HTML, body: ARTICLE }));
    const out = await fetchPageText('https://example.com/start');
    expect(out).toContain('Real article content');
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/final');
  });

  it('still honors the content-type gate on the final response', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"a":1}' })
    );
    const out = await fetchPageText('https://example.com/data.json');
    expect(out).toBeNull();
  });

  it('truncates to maxChars (size cap preserved)', async () => {
    const big = '<html><body>' + 'x'.repeat(20000) + '</body></html>';
    fetchMock.mockResolvedValueOnce(makeResponse({ status: 200, headers: HTML, body: big }));
    const out = await fetchPageText('https://example.com/big', 500);
    expect(out).not.toBeNull();
    expect(out.length).toBe(500);
  });
});
