/**
 * /meetings live-scan diagnostic — drives the real flow against the test
 * user's actual Google Calendar.
 *
 * Steps:
 *   1. Auth-inject, navigate to /meetings
 *   2. Click "Atualizar" — triggers POST /api/meeting-briefings/scan which
 *      reads the user's real Google Calendar (next 26h)
 *   3. Wait for the scan to settle, verify the result note appears
 *   4. Verify briefing cards rendered (the test user has 2 real
 *      appointments tomorrow: "Dra Ana Academia da Mente", "Cabelereiro
 *      Amelia") OR a clean empty state if the calendar genuinely has
 *      nothing
 *   5. Screenshot every beat
 *
 * Diagnostic, not strict-assert — the test user's calendar changes day to
 * day. It verifies the FLOW works (scan → briefings render), not specific
 * meeting titles.
 *
 * Opt-in: TWINME_RUN_MEETINGS_LIVE=true
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { BASE_URL, SCREENSHOT_DIR, injectAuth } from './helpers';

test.skip(
  process.env.TWINME_RUN_MEETINGS_LIVE !== 'true',
  'Live meetings scan hits the real Google Calendar. Set TWINME_RUN_MEETINGS_LIVE=true to opt in.',
);

const SHOT_DIR = path.join(SCREENSHOT_DIR, 'meetings-live');

test.describe('/meetings — live calendar scan', () => {
  test.setTimeout(180_000); // scan + briefing generation = multiple LLM calls

  test('Atualizar reads the real calendar and renders briefings', async ({ page }) => {
    await fs.mkdir(SHOT_DIR, { recursive: true });

    const findings: string[] = [];
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (!/PostHog|posthog|favicon|ERR_BLOCKED/.test(t)) consoleErrors.push(t);
      }
    });

    // Capture the scan response so we know exactly what the backend returned.
    let scanStatus: number | null = null;
    let scanBody: unknown = null;
    page.on('response', async (resp) => {
      if (!resp.url().includes('/api/meeting-briefings/scan')) return;
      scanStatus = resp.status();
      try { scanBody = await resp.json(); } catch { /* ignore */ }
    });

    await injectAuth(page);

    // ── Step 1: load /meetings
    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Meetings', level: 1 }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOT_DIR, '01-loaded.png'), fullPage: true });
    findings.push('/meetings page loaded');

    // ── Step 2: click Atualizar
    const atualizar = page.getByRole('button', { name: /Atualizar/i });
    await expect(atualizar, 'Atualizar button present').toBeVisible();
    await atualizar.click();
    findings.push('Clicked Atualizar');

    // ── Step 3: wait for the scan to settle. The button shows "Escaneando…"
    // while in flight; we wait for it to return to "Atualizar".
    await page.getByRole('button', { name: /Atualizar/i }).waitFor({ timeout: 120_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOT_DIR, '02-after-scan.png'), fullPage: true });

    findings.push(`Scan response: status=${scanStatus} body=${JSON.stringify(scanBody)}`);

    // ── Step 4: verify the scan note appeared
    const noteCandidates = [
      /reuni[ãa]o nova preparada/i,
      /reuni[õo]es novas preparadas/i,
      /j[áa] estava/i,
      /j[áa] estavam/i,
      /Nenhuma reuni[ãa]o externa/i,
      /Erro ao escanear/i,
      /n[ãa]o foi poss[íi]vel escanear/i,
    ];
    let noteFound = '';
    for (const re of noteCandidates) {
      const loc = page.getByText(re).first();
      if (await loc.isVisible().catch(() => false)) {
        noteFound = (await loc.textContent())?.trim() || re.source;
        break;
      }
    }
    findings.push(`Scan note shown: ${noteFound || '(none found)'}`);

    // ── Step 5: did briefing cards render?
    // After the scan + reload, the page either shows hero/upcoming cards
    // or the empty state. Both are valid — we just report which.
    await page.waitForTimeout(3000); // give the reload + briefing list time
    await page.screenshot({ path: path.join(SHOT_DIR, '03-final.png'), fullPage: true });

    const heroHeading = page.getByText(/Pr[óo]xima/i).first();
    const emptyState = page.getByText(/Nenhuma reuni[ãa]o por aqui ainda/i).first();
    const hasHero = await heroHeading.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    // Count rendered meeting cards by their Instrument-Serif h2 titles.
    const cardTitles = await page.locator('h2').allTextContents().catch(() => []);
    findings.push(`Hero section visible: ${hasHero}`);
    findings.push(`Empty state visible: ${hasEmpty}`);
    findings.push(`Card titles on page: ${JSON.stringify(cardTitles.slice(0, 8))}`);

    // ── Write report
    const report = [
      '# /meetings live calendar scan',
      `Run: ${new Date().toISOString()}`,
      '',
      '## Findings',
      ...findings.map((f) => `- ${f}`),
      '',
      consoleErrors.length ? '## Console errors' : '## Console errors — none',
      ...consoleErrors.slice(0, 10).map((e) => `- ${e}`),
    ].join('\n');
    await fs.writeFile(path.join(SHOT_DIR, 'report.md'), report);

    console.log('\n=== /meetings LIVE SCAN ===');
    findings.forEach((f) => console.log('  ' + f));
    if (consoleErrors.length) {
      console.log('  console errors:');
      consoleErrors.slice(0, 5).forEach((e) => console.log('    ' + e.slice(0, 160)));
    }

    // Hard assertions — the FLOW must work, regardless of calendar contents:
    expect(scanStatus, 'scan endpoint returned a status').not.toBeNull();
    expect([200].includes(scanStatus as number), `scan returned 200 (got ${scanStatus})`).toBe(true);
    // Either briefings rendered OR a clean empty state — never a broken page.
    expect(hasHero || hasEmpty, 'page shows briefings or a clean empty state').toBe(true);
    expect(consoleErrors, 'no unfiltered console errors').toHaveLength(0);
  });
});
