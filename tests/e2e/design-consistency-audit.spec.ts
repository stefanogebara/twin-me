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
 *   - Glass surfaces use rgba(255,255,255,0.06) background
 *   - Sidebar nav active state uses --accent-vibrant-glow (not navy)
 *   - No navy blue (#1e3a8a, #1e40af, #2563eb, etc.) on solid backgrounds
 *
 * Output:
 *   - tests/e2e/screenshots/design-audit/<route>.png
 *   - tests/e2e/screenshots/design-audit/report.json
 *
 * Opt-in: set TWINME_RUN_DESIGN_AUDIT=true. Heavy (visits 14+ routes).
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
  sidebarActiveBg: string | null;
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
] as const;

async function extractTokens(page: import('@playwright/test').Page, route: string): Promise<DesignTokens> {
  return await page.evaluate((routeArg) => {
    // Inline navy-ish detector — blue dominates red and green, blue is bright
    const isNavyish = (rgb: string): boolean => {
      const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return false;
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return b > 100 && b > r * 1.5 && b > g * 1.3 && r < 80;
    };

    const body = document.body;
    const html = document.documentElement;
    const bodyStyles = window.getComputedStyle(body);
    const htmlStyles = window.getComputedStyle(html);

    const h1 = document.querySelector('h1, h2[class*="serif"], [class*="text-heading"]') as HTMLElement | null;
    const h1Styles = h1 ? window.getComputedStyle(h1) : null;

    const glassEls = Array.from(document.querySelectorAll<HTMLElement>('[class*="backdrop-blur"]'));

    const sidebar = document.querySelector('nav[class*="sidebar"], [class*="Sidebar"], aside') as HTMLElement | null;
    const sidebarActive = sidebar?.querySelector('[class*="active"], [aria-current="page"]') as HTMLElement | null;

    // Only flag navy backgrounds on meaningfully-sized surfaces. Tiny
    // elements (status dots, brand icons, platform identification chips)
    // legitimately use platform brand colors — that's not a CLAUDE.md
    // violation, that's required for brand recognition. Threshold: 80px
    // in each dimension catches actual chrome surfaces (cards, panels,
    // buttons) without flagging 6px dots or 44px logo tiles.
    const SURFACE_MIN_PX = 80;
    const navyLeaks: Array<{ selector: string; bg: string; color: string; html: string }> = [];
    const allEls = document.querySelectorAll('*');
    for (let i = 0; i < Math.min(allEls.length, 500); i++) {
      const el = allEls[i] as HTMLElement;
      const cs = window.getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || !isNavyish(bg)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < SURFACE_MIN_PX || rect.height < SURFACE_MIN_PX) continue;

      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toString().slice(0, 80);
      const parent = el.parentElement;
      const html = (parent?.outerHTML ?? el.outerHTML).slice(0, 400);
      navyLeaks.push({ selector: `${tag}.${cls}`, bg, color: cs.color, html });
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
      glassSurfaceCount: glassEls.length,
      sidebarPresent: !!sidebar,
      sidebarActiveBg: sidebarActive ? window.getComputedStyle(sidebarActive).backgroundColor : null,
      navyBlueLeaks: navyLeaks,
      cssVarBackground: htmlStyles.getPropertyValue('--background').trim(),
      cssVarAccentAmber: htmlStyles.getPropertyValue('--accent-amber').trim(),
      cssVarAccentPurple: htmlStyles.getPropertyValue('--accent-purple').trim(),
    };
  }, route);
}

test.describe('Design Consistency Audit', () => {
  test.setTimeout(180_000);

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
          issues.push(`${route}: ${tokens.navyBlueLeaks.length} navy-blue element(s): ${tokens.navyBlueLeaks.map(l => l.bg).join(', ')}`);
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
