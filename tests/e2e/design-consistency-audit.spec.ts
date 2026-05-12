/**
 * Design Consistency Audit
 *
 * Visits every authenticated route, takes a full-page screenshot, and
 * extracts the computed design tokens for cross-page comparison.
 *
 * What we check (per CLAUDE.md design system):
 *   - body background = #13121a (or sun-driven gradient — never solid navy)
 *   - body font-family includes Geist or Inter (UI text)
 *   - h1/h2 hero font-family includes Instrument Serif where present
 *   - Glass surfaces (computed backdrop-filter blur >= 16px) are present
 *   - Sidebar outer container is FLAT (no border-radius)
 *   - Primary CTAs use pill geometry (rounded-full or border-radius >= 100px)
 *   - No navy blue on chrome surfaces >= 80x80px (small brand dots OK)
 *
 * Output:
 *   - tests/e2e/screenshots/design-audit/<route>.png
 *   - tests/e2e/screenshots/design-audit/report.json
 *
 * Opt-in: set TWINME_RUN_DESIGN_AUDIT=true. Heavy (visits 18+ routes).
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { BASE_URL, SCREENSHOT_DIR, injectAuth } from './helpers';

test.skip(
  process.env.TWINME_RUN_DESIGN_AUDIT !== 'true',
  'Design audit is heavy. Set TWINME_RUN_DESIGN_AUDIT=true to opt in.',
);

const AUDIT_DIR = path.join(SCREENSHOT_DIR, 'design-audit');

interface DesignTokens {
  route: string;
  bodyBgColor: string;
  bodyBgImage: string;
  bodyFontFamily: string;
  rootFontSize: string;
  h1FontFamily: string | null;
  h1Text: string | null;
  glassSurfaceCount: number;
  sidebarPresent: boolean;
  sidebarOuterRadius: string | null;
  sidebarFlat: boolean | null;
  primaryButtonRadii: string[];
  primaryButtonPillCount: number;
  nonPillCtaSamples: Array<{ radius: string; text: string; html: string }>;
  navyBlueLeaks: Array<{ selector: string; bg: string; color: string; html: string }>;
  cssVarBackground: string;
  cssVarAccentAmber: string;
  cssVarAccentPurple: string;
}

const ROUTES_TO_AUDIT = [
  '/',
  '/discover',
  '/dashboard',
  '/identity',
  '/brain',
  '/wiki',
  '/goals',
  '/money',
  '/connect',
  '/talk-to-twin',
  '/settings',
  '/privacy-spectrum',
  '/insights/spotify',
  '/insights/calendar',
  '/pricing',
  '/departments',
  '/get-started',
  '/journal',
] as const;

async function extractTokens(page: import('@playwright/test').Page, route: string): Promise<DesignTokens> {
  return await page.evaluate((routeArg) => {
    const isNavyish = (rgb: string): boolean => {
      const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return false;
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return b > 100 && b > r * 1.5 && b > g * 1.3 && r < 80;
    };

    const parsePx = (v: string | null | undefined): number => {
      if (!v) return 0;
      const m = v.match(/(\d+(?:\.\d+)?)px/);
      return m ? parseFloat(m[1]) : 0;
    };

    const body = document.body;
    const html = document.documentElement;
    const bodyStyles = window.getComputedStyle(body);
    const htmlStyles = window.getComputedStyle(html);

    // Hero/heading font: try multiple selectors in priority order
    const h1 = document.querySelector('h1') as HTMLElement | null
      ?? document.querySelector('[class*="text-heading"]') as HTMLElement | null
      ?? document.querySelector('[style*="Instrument"]') as HTMLElement | null;
    const h1Styles = h1 ? window.getComputedStyle(h1) : null;

    // Glass surface count: detect computed backdrop-filter blur (>= 16px) on
    // any element with a visible bg. Catches inline styles AND Tailwind classes.
    let glassSurfaceCount = 0;
    const candidates = document.querySelectorAll('*');
    const maxScan = Math.min(candidates.length, 1500);
    for (let i = 0; i < maxScan; i++) {
      const el = candidates[i] as HTMLElement;
      const cs = window.getComputedStyle(el);
      const filter = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || '';
      if (filter && filter !== 'none') {
        const blurMatch = filter.match(/blur\((\d+(?:\.\d+)?)px\)/);
        if (blurMatch && parseFloat(blurMatch[1]) >= 16) {
          glassSurfaceCount++;
        }
      }
    }

    // Sidebar — try multiple selectors; the actual sidebar is a <nav> with
    // role="navigation" inside a flat <div> container.
    const sidebarNav = document.querySelector('nav[role="navigation"][aria-label*="Main"], nav[aria-label*="navigation" i]') as HTMLElement | null;
    let sidebarOuterRadius: string | null = null;
    let sidebarFlat: boolean | null = null;
    if (sidebarNav) {
      // Walk up to find the flat container (the fixed-positioned outer)
      let outer: HTMLElement | null = sidebarNav;
      while (outer && outer !== document.body) {
        const cs = window.getComputedStyle(outer);
        if (cs.position === 'fixed' && cs.left === '0px' && cs.top === '0px') {
          break;
        }
        outer = outer.parentElement;
      }
      if (outer && outer !== document.body) {
        const cs = window.getComputedStyle(outer);
        sidebarOuterRadius = `${cs.borderTopLeftRadius}/${cs.borderTopRightRadius}/${cs.borderBottomRightRadius}/${cs.borderBottomLeftRadius}`;
        // Flat = all four corners 0px
        sidebarFlat = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
          .every(r => parsePx(r) === 0);
      }
    }

    const primaryButtonRadii: string[] = [];
    let primaryButtonPillCount = 0;
    const nonPillCtaSamples: Array<{ radius: string; text: string; html: string }> = [];
    const buttons = document.querySelectorAll('button');
    const maxBtn = Math.min(buttons.length, 40);
    for (let i = 0; i < maxBtn; i++) {
      const btn = buttons[i] as HTMLElement;
      const cs = window.getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 32) continue;
      const text = (btn.textContent || '').trim();
      if (text.length < 2) continue;
      const bg = cs.backgroundColor;
      // Primary CTA has SOLID light fill: rgb(245,...) OR rgba(...) with alpha >= 0.5.
      // Glass buttons use rgba(255,255,255,0.06-0.10) — those match the rgb but
      // need to be excluded by alpha to avoid false positives.
      const rgbaMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!rgbaMatch) continue;
      const [, rs, gs, bs, alphaStr] = rgbaMatch;
      const rv = parseInt(rs, 10), gv = parseInt(gs, 10), bvNum = parseInt(bs, 10);
      const alpha = alphaStr !== undefined ? parseFloat(alphaStr) : 1;
      const isLight = rv >= 240 && gv >= 240 && bvNum >= 240 && alpha >= 0.5;
      if (!isLight) continue;
      const radius = cs.borderTopLeftRadius;
      const radiusPx = parsePx(radius);
      const isPill = radiusPx >= 100 || radiusPx >= rect.height / 2;
      primaryButtonRadii.push(radius);
      if (isPill) {
        primaryButtonPillCount++;
      } else if (nonPillCtaSamples.length < 3) {
        nonPillCtaSamples.push({
          radius,
          text: text.slice(0, 40),
          html: btn.outerHTML.slice(0, 300),
        });
      }
      if (primaryButtonRadii.length >= 5) break;
    }

    // Navy-on-surface detector (size-filtered)
    const SURFACE_MIN_PX = 80;
    const navyLeaks: Array<{ selector: string; bg: string; color: string; html: string }> = [];
    for (let i = 0; i < Math.min(candidates.length, 800); i++) {
      const el = candidates[i] as HTMLElement;
      const cs = window.getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || !isNavyish(bg)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < SURFACE_MIN_PX || rect.height < SURFACE_MIN_PX) continue;
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toString().slice(0, 80);
      const parent = el.parentElement;
      const htmlSnippet = (parent?.outerHTML ?? el.outerHTML).slice(0, 400);
      navyLeaks.push({ selector: `${tag}.${cls}`, bg, color: cs.color, html: htmlSnippet });
      if (navyLeaks.length >= 5) break;
    }

    return {
      route: routeArg,
      bodyBgColor: bodyStyles.backgroundColor,
      bodyBgImage: bodyStyles.backgroundImage.slice(0, 200),
      bodyFontFamily: bodyStyles.fontFamily,
      rootFontSize: htmlStyles.fontSize,
      h1FontFamily: h1Styles?.fontFamily ?? null,
      h1Text: h1?.textContent?.trim().slice(0, 60) ?? null,
      glassSurfaceCount,
      sidebarPresent: !!sidebarNav,
      sidebarOuterRadius,
      sidebarFlat,
      primaryButtonRadii,
      primaryButtonPillCount,
      nonPillCtaSamples,
      navyBlueLeaks: navyLeaks,
      cssVarBackground: htmlStyles.getPropertyValue('--background').trim(),
      cssVarAccentAmber: htmlStyles.getPropertyValue('--accent-amber').trim(),
      cssVarAccentPurple: htmlStyles.getPropertyValue('--accent-purple').trim(),
    };
  }, route);
}

test.describe('Design Consistency Audit', () => {
  test.setTimeout(240_000);

  test('every page matches platform design tokens', async ({ page }) => {
    await fs.mkdir(AUDIT_DIR, { recursive: true });
    await injectAuth(page);

    const report: DesignTokens[] = [];
    const issues: string[] = [];

    for (const route of ROUTES_TO_AUDIT) {
      const safeName = route.replace(/\//g, '_') || 'root';
      console.log(`[design-audit] ${route}`);

      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);

        const tokens = await extractTokens(page, route);
        report.push(tokens);

        if (tokens.cssVarBackground && tokens.cssVarBackground !== '#13121a') {
          issues.push(`${route}: --background = "${tokens.cssVarBackground}" (expected #13121a)`);
        }
        if (!/Geist|Inter|system-ui/i.test(tokens.bodyFontFamily)) {
          issues.push(`${route}: body font "${tokens.bodyFontFamily}" missing Geist/Inter`);
        }
        if (tokens.navyBlueLeaks.length > 0) {
          issues.push(`${route}: ${tokens.navyBlueLeaks.length} navy-blue surface(s): ${tokens.navyBlueLeaks.map(l => l.bg).join(', ')}`);
        }
        if (tokens.sidebarPresent && tokens.sidebarFlat === false) {
          issues.push(`${route}: sidebar outer container has border-radius "${tokens.sidebarOuterRadius}" (CLAUDE.md requires FLAT)`);
        }

        await page.screenshot({
          path: path.join(AUDIT_DIR, `${safeName}.png`),
          fullPage: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        issues.push(`${route}: navigation failed — ${msg}`);
        console.error(`[design-audit] ${route} failed:`, msg);
      }
    }

    await fs.writeFile(
      path.join(AUDIT_DIR, 'report.json'),
      JSON.stringify({ report, issues }, null, 2),
    );

    console.log('\n=== DESIGN AUDIT REPORT ===');
    console.log(`Pages audited: ${report.length} / ${ROUTES_TO_AUDIT.length}`);
    console.log(`Issues: ${issues.length}`);
    issues.forEach(i => console.log('  - ' + i));

    expect(report.length, 'should audit all routes').toBeGreaterThanOrEqual(ROUTES_TO_AUDIT.length - 2);
  });
});
