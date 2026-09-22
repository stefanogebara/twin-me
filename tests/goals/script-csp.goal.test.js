/**
 * Goal: no script runs on the site unless it came from a file the CSP names (audit M1-C, 2026-09-22).
 *
 * `script-src` carried `'unsafe-inline'` for one inline theme script in index.html, which
 * made the header say nothing about cross-site scripting. The theme script is gone (the
 * register is light everywhere; ThemeContext still stamps the attribute after mount), the
 * Claura prototypes under public/cinematic went with their inline scripts, and the header
 * now allows only the site's own files and PostHog. Drift in any of the three fails here.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const htmlFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter((d) => d.isFile() && d.name.endsWith('.html'))
  .map((d) => path.join(d.parentPath ?? d.path, d.name));
const inlineScripts = (html) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attrs, body]) => !/\bsrc\s*=/.test(attrs) && body.trim() !== '');
const inlineHandlers = (html) => [...html.matchAll(/\son[a-z]+\s*=\s*["']/gi)].map((m) => m[0].trim());

describe('scripts come only from files the CSP names', () => {
  it('index.html has no inline script and no inline handler', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(inlineScripts(html).map((m) => m[2].trim().slice(0, 60))).toEqual([]);
    expect(inlineHandlers(html)).toEqual([]);
  });

  it('nothing served from public/ carries an inline script', () => {
    const offenders = htmlFiles(path.join(ROOT, 'public'))
      .filter((f) => inlineScripts(fs.readFileSync(f, 'utf8')).length || inlineHandlers(fs.readFileSync(f, 'utf8')).length)
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("the header's script-src allows no inline or eval and names only the site and PostHog", () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy');
    expect(csp, 'a Content-Security-Policy header in vercel.json').toBeTruthy();
    const scriptSrc = csp.value.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src '));
    expect(scriptSrc).toBeTruthy();
    const sources = scriptSrc.split(/\s+/).slice(1);
    expect(sources).not.toContain("'unsafe-inline'");
    expect(sources).not.toContain("'unsafe-eval'");
    expect(sources.filter((s) => !s.startsWith("'"))).toEqual(['https://us-assets.i.posthog.com', 'https://us.i.posthog.com']);
    expect(sources).toContain("'self'");
  });
});
