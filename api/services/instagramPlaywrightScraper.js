/**
 * Instagram Playwright Scraper
 * =============================
 * Vanilla Playwright + injected cookies. NO camofox, NO VPS, NO Docker.
 *
 * Validated end-to-end against a real account during the Phase 0 spike:
 *   - /{user}/ profile pages render with standard <a href="/p/..."> + alt text
 *   - /{user}/saved/all-posts/ same standard pattern, NOT Bloks-locked
 *   - /your_activity/interactions/likes/ IS Bloks-locked, do NOT use
 *
 * Input contract:
 *   - cookies: array of cookie objects exported from the user's browser
 *     (the Chrome extension will normalize to this shape before posting)
 *   - username: the user's IG @handle (without the @)
 *   - surfaces: subset of ['saved', 'own_posts', 'follows']
 *   - options: { maxItemsPerSurface, scrollPasses, headless, jitterMs }
 *
 * Output contract:
 *   {
 *     ok: boolean,
 *     scraped: { saved_posts: [], own_posts: [], follows: [] },
 *     detected: { logged_in: boolean, captcha: boolean, rate_limit: boolean, suspended: boolean },
 *     duration_ms: number,
 *     error: string | null,
 *   }
 *
 * NEVER throws to the caller — always returns the result envelope.
 */

import { chromium } from 'playwright-core';
import { createLogger } from './logger.js';
import { sanitizeExternal } from './observationUtils.js';

const log = createLogger('InstagramPlaywrightScraper');

/**
 * Launch Chromium with the right binary for the runtime.
 *
 * - On Vercel (or any Lambda-like serverless env), use @sparticuz/chromium —
 *   a ~50MB Chromium build that fits inside Lambda's bundle limits. Without
 *   this, playwright-core can't find a browser at runtime because Lambda
 *   doesn't preserve the playwright browser cache from npm install.
 * - Locally, use whatever Chromium the `playwright` package downloaded
 *   (playwright-core auto-discovers it via the standard browser-path).
 */
async function _launchChromium(headless) {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) {
    const sparticuz = (await import('@sparticuz/chromium')).default;
    return chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    });
  }
  return chromium.launch({ headless });
}

const DEFAULTS = {
  maxItemsPerSurface: 30,
  scrollPasses: 4,
  headless: true,
  jitterMs: 1500,
  perSurfaceTimeoutMs: 20_000,
  totalTimeoutMs: 50_000,
};

function _jitter(base) {
  const ms = base + Math.floor(Math.random() * base);
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Convert browser-export cookie shape to Playwright addCookies shape.
 * Handles Chrome extension export quirks (sameSite naming, expirationDate vs expires).
 */
function _toPlaywrightCookies(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c.name !== 'string' || typeof c.value !== 'string') continue;
    if (!c.name || !c.value) continue;
    let sameSite = c.sameSite;
    if (typeof sameSite === 'string') {
      const s = sameSite.toLowerCase();
      if (s === 'no_restriction' || s === 'none') sameSite = 'None';
      else if (s === 'lax' || s === 'unspecified') sameSite = 'Lax';
      else if (s === 'strict') sameSite = 'Strict';
      else sameSite = 'Lax';
    } else {
      sameSite = 'Lax';
    }
    const domain = c.domain || '.instagram.com';
    const cookie = {
      name: c.name,
      value: c.value,
      domain: domain.startsWith('.') ? domain : domain,
      path: c.path || '/',
      httpOnly: !!c.httpOnly,
      secure: c.secure !== false,
      sameSite,
    };
    const exp = c.expires ?? c.expirationDate ?? c.expiry;
    if (typeof exp === 'number' && exp > 0) cookie.expires = Math.floor(exp);
    out.push(cookie);
  }
  return out;
}

/**
 * IN-page extractor: same code used in the validated spike.
 * Reads /p/ and /reel/ anchors with their alt text.
 * Also reports page-state signals so we can short-circuit on challenges.
 */
function _pageExtractFn() {
  const links = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
  const seen = new Set();
  const posts = [];
  for (const a of links) {
    const href = a.getAttribute('href');
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const img = a.querySelector('img');
    posts.push({
      url: href.startsWith('/') ? `https://www.instagram.com${href}` : href,
      alt: img?.getAttribute('alt') || null,
      kind: href.includes('/reel/') ? 'reel' : 'post',
    });
  }
  const bodyText = (document.body && document.body.innerText) ? document.body.innerText.toLowerCase() : '';
  let challenge = null;
  if (bodyText.includes('checkpoint_required') || bodyText.includes('unusual activity')) challenge = 'captcha';
  else if (bodyText.includes('limit how often') || bodyText.includes('try again later')) challenge = 'rate_limit';
  else if (bodyText.includes('account has been disabled') || bodyText.includes('/accounts/suspended')) challenge = 'suspended';

  const loggedIn =
    !!document.querySelector('a[href*="/your_activity/"]') ||
    !!document.querySelector('a[href$="/accounts/edit/"]');

  // Diagnostic snapshot when posts are empty — helps debug why Sparticuz-Chromium saw nothing.
  // Includes ONLY non-sensitive page metadata (no cookies, no auth tokens).
  const diagnostic = posts.length === 0 ? {
    page_title: document.title,
    final_url: location.href,
    body_preview: (document.body?.innerText || '').slice(0, 400),
    has_login_form: !!document.querySelector('input[name="username"], input[name="password"]'),
    total_anchor_count: document.querySelectorAll('a').length,
    total_img_count: document.querySelectorAll('img').length,
    body_byte_length: document.documentElement.outerHTML.length,
  } : null;

  return {
    page_url: location.href,
    posts,
    appears_logged_in: loggedIn,
    challenge,
    diagnostic,
  };
}

async function _scrapeSurface(page, url, scrollPasses, maxItems, jitterMs) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await _jitter(jitterMs);
  for (let i = 0; i < scrollPasses; i++) {
    await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
    await _jitter(jitterMs);
  }
  const data = await page.evaluate(_pageExtractFn);
  return {
    page_url: data.page_url,
    posts: (data.posts || []).slice(0, maxItems),
    appears_logged_in: data.appears_logged_in,
    challenge: data.challenge,
    diagnostic: data.diagnostic,
  };
}

/**
 * Main entry point. Run a single scrape pass for one user.
 *
 * @param {Object} args
 * @param {Array} args.cookies - cookie objects from the user's browser
 * @param {string} args.username - @handle without @
 * @param {Array<string>} args.surfaces - subset of ['saved', 'own_posts', 'follows']
 * @param {Object} [args.options]
 * @returns {Promise<Object>} envelope (see file header)
 */
export async function scrapeInstagramWithCookies({ cookies, username, surfaces, options = {} }) {
  const opts = { ...DEFAULTS, ...options };
  const startedAt = Date.now();
  const envelope = {
    ok: false,
    scraped: { saved_posts: [], own_posts: [], follows: [] },
    detected: { logged_in: false, captcha: false, rate_limit: false, suspended: false },
    diagnostics: {},
    duration_ms: 0,
    error: null,
  };

  if (!username || typeof username !== 'string') {
    envelope.error = 'username required';
    return envelope;
  }
  const safeUsername = sanitizeExternal(username, 50).replace(/[^a-zA-Z0-9._]/g, '');
  if (!safeUsername) {
    envelope.error = 'username after sanitization is empty';
    return envelope;
  }

  const playwrightCookies = _toPlaywrightCookies(cookies);
  if (playwrightCookies.length === 0) {
    envelope.error = 'no valid cookies provided';
    return envelope;
  }

  const enabled = new Set(Array.isArray(surfaces) && surfaces.length > 0 ? surfaces : ['saved']);

  let browser;
  try {
    browser = await _launchChromium(opts.headless);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: undefined, // let Playwright's default Chromium UA pass IG's basic checks
    });
    await context.addCookies(playwrightCookies);
    const page = await context.newPage();

    // Per-surface scrape with budgets. Race against per-surface timeout.
    const surfaceTargets = [];
    if (enabled.has('own_posts')) {
      surfaceTargets.push({
        key: 'own_posts',
        url: `https://www.instagram.com/${safeUsername}/`,
      });
    }
    if (enabled.has('saved')) {
      surfaceTargets.push({
        key: 'saved',
        url: `https://www.instagram.com/${safeUsername}/saved/all-posts/`,
      });
    }
    // 'follows' surface requires clicking the "following" button to open the modal;
    // direct URL redirects to profile. Skip in Phase 1 — track as known limitation.

    const totalDeadline = Date.now() + opts.totalTimeoutMs;

    for (const target of surfaceTargets) {
      if (Date.now() > totalDeadline) {
        log.warn('Total scrape deadline exceeded — skipping remaining surfaces', {
          remaining: surfaceTargets.length - surfaceTargets.indexOf(target),
        });
        break;
      }
      try {
        const scraped = await Promise.race([
          _scrapeSurface(page, target.url, opts.scrollPasses, opts.maxItemsPerSurface, opts.jitterMs),
          new Promise((_, rej) => setTimeout(() => rej(new Error('per-surface timeout')), opts.perSurfaceTimeoutMs)),
        ]);

        if (scraped.appears_logged_in) envelope.detected.logged_in = true;
        if (scraped.challenge === 'captcha') envelope.detected.captcha = true;
        if (scraped.challenge === 'rate_limit') envelope.detected.rate_limit = true;
        if (scraped.challenge === 'suspended') envelope.detected.suspended = true;

        if (scraped.challenge) {
          // Stop early on any IG-side block — don't keep poking.
          log.warn('IG challenge detected — short-circuiting scrape', { challenge: scraped.challenge, surface: target.key });
          break;
        }

        if (target.key === 'saved') envelope.scraped.saved_posts = scraped.posts;
        if (target.key === 'own_posts') envelope.scraped.own_posts = scraped.posts;
        if (scraped.diagnostic) envelope.diagnostics[target.key] = scraped.diagnostic;
      } catch (e) {
        log.warn('surface scrape error', { surface: target.key, error: e?.message });
        envelope.error = envelope.error || `surface ${target.key}: ${e?.message}`;
        // Continue to next surface — partial results are valuable.
      }
    }

    // Success criterion: at least one surface produced data AND no IG-side block.
    const anyData =
      envelope.scraped.saved_posts.length > 0 ||
      envelope.scraped.own_posts.length > 0 ||
      envelope.scraped.follows.length > 0;
    envelope.ok =
      anyData &&
      !envelope.detected.captcha &&
      !envelope.detected.rate_limit &&
      !envelope.detected.suspended;
  } catch (e) {
    log.warn('Instagram scrape fatal error', { error: e?.message });
    envelope.error = envelope.error || e?.message || 'unknown error';
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        log.warn('browser close error', { error: e?.message });
      }
    }
    envelope.duration_ms = Date.now() - startedAt;
  }

  return envelope;
}

export default { scrapeInstagramWithCookies };
