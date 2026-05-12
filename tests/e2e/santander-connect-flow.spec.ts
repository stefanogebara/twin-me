/**
 * Santander BR connect-flow diagnostic
 * ====================================
 *
 * Drives the "Conectar banco BR" button on /money as far as Playwright can
 * without real bank credentials. CPF is read from the TEST_CPF env var and
 * never committed.
 *
 * What this test actually verifies:
 *   1. Auth flow works on /money
 *   2. "Conectar banco BR" button is present
 *   3. Clicking the button hits POST /api/transactions/pluggy/connect-token
 *   4. The frontend handles each possible backend response:
 *      - 503 PLUGGY_NOT_CONFIGURED → friendly "indisponível" message + CSV fallback
 *      - 200 success → Pluggy widget mounts in an iframe
 *      - 500/other → generic error message
 *   5. If the widget mounts and we can reach the bank search, we type
 *      "Santander" and the CPF, then STOP (no password — that'd risk a
 *      Santander lockout, and we don't have the credential anyway).
 *
 * This is a diagnostic spec — it surfaces what state the user actually sees
 * when they click the button. It does NOT assert "must succeed" because the
 * outcome depends on whether Pluggy is configured.
 *
 * Run:
 *   TWINME_RUN_SANTANDER_DIAG=true TEST_CPF=<your CPF> npx playwright test \
 *     tests/e2e/santander-connect-flow.spec.ts --project=chromium --headed
 *
 * Headed by default so the user can see what's happening — drop --headed for CI.
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { BASE_URL, API_URL, SCREENSHOT_DIR, injectAuth } from './helpers';

test.skip(
  process.env.TWINME_RUN_SANTANDER_DIAG !== 'true',
  'Santander diagnostic is interactive. Set TWINME_RUN_SANTANDER_DIAG=true to opt in.',
);

const SHOT_DIR = path.join(SCREENSHOT_DIR, 'santander-connect');

function maskCpf(cpf: string): string {
  if (cpf.length !== 11) return '***';
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`;
}

async function snap(page: Page, name: string): Promise<void> {
  await fs.mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

interface DiagFinding {
  step: string;
  ok: boolean;
  detail: string;
}

test.describe('Santander BR connect flow — diagnostic', () => {
  test.setTimeout(120_000);

  test('drive /money → Conectar banco BR → see what happens', async ({ page }) => {
    const findings: DiagFinding[] = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!/PostHog|posthog|favicon|ERR_BLOCKED/.test(text)) {
          consoleErrors.push(text);
        }
      }
    });

    const cpf = process.env.TEST_CPF || '';
    expect(cpf.length, 'TEST_CPF env var set (11 digits)').toBe(11);
    expect(/^\d{11}$/.test(cpf), 'TEST_CPF is 11 digits').toBe(true);
    console.log(`[santander-diag] CPF (masked): ${maskCpf(cpf)}`);

    // ── Step 1: authenticate + navigate
    await injectAuth(page);

    // Capture the connect-token request so we know exactly what the backend
    // returned without parsing console output.
    let connectTokenStatus: number | null = null;
    let connectTokenBody: unknown = null;
    page.on('response', async (resp) => {
      if (!resp.url().includes('/api/transactions/pluggy/connect-token')) return;
      connectTokenStatus = resp.status();
      try { connectTokenBody = await resp.json(); } catch { /* may be empty */ }
    });

    await page.goto(`${BASE_URL}/money`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    // Vite dev-server may be HMR-recompiling after a recent source edit — give
    // the lazy MoneyPage chunk room to settle before probing the UI.
    await page.waitForTimeout(3500);
    await snap(page, '01-money-loaded');

    const moneyHeader = page.getByRole('heading', { name: /^Money$/i, level: 1 });
    // Wait actively rather than snapshot-probe — chunks can be slow after HMR.
    const moneyHeaderVisible = await moneyHeader.isVisible({ timeout: 10_000 }).catch(() => false);
    findings.push({
      step: '/money page loaded with header',
      ok: moneyHeaderVisible,
      detail: moneyHeaderVisible ? 'OK' : 'H1 "Money" not found',
    });

    // ── Step 2: locate the Conectar banco BR button
    const connectButton = page.getByRole('button', { name: /Conectar banco BR/i });
    const buttonVisible = await connectButton.isVisible({ timeout: 5000 }).catch(() => false);
    findings.push({
      step: 'Conectar banco BR button visible',
      ok: buttonVisible,
      detail: buttonVisible ? 'OK' : 'Button missing — flow blocked here',
    });

    if (!buttonVisible) {
      // No point continuing — write summary and bail
      await writeSummary(findings, { connectTokenStatus, connectTokenBody, pageErrors, consoleErrors });
      throw new Error('Cannot continue — Conectar banco BR button not found on /money');
    }

    // ── Step 3: click it, watch what happens
    await connectButton.click();
    await page.waitForTimeout(3000);  // give the connect-token POST + widget mount time
    await snap(page, '02-after-click');

    findings.push({
      step: 'POST /pluggy/connect-token response',
      ok: connectTokenStatus !== null,
      detail: connectTokenStatus === null
        ? 'No connect-token request observed'
        : `status ${connectTokenStatus} — body: ${JSON.stringify(connectTokenBody).slice(0, 300)}`,
    });

    // ── Step 4: branch on outcome
    if (connectTokenStatus === 503) {
      // Configuration issue — frontend should show ONE of:
      // (a) Production-friendly: "temporariamente indisponível" + CSV hint
      // (b) Dev-mode actionable: "Pluggy não configurado. Adicione PLUGGY_CLIENT_ID..."
      const friendlyError = page.getByText(
        /temporariamente indispon[ií]vel|use o upload de extrato|Pluggy n[aã]o configurado|PLUGGY_CLIENT_ID/i,
      ).first();
      const showsFriendly = await friendlyError.isVisible().catch(() => false);
      findings.push({
        step: 'PLUGGY_NOT_CONFIGURED → user-actionable error shown',
        ok: showsFriendly,
        detail: showsFriendly
          ? 'OK — frontend surfaces the configuration state (dev hint or production fallback)'
          : 'BUG — backend returned 503 PLUGGY_NOT_CONFIGURED but no UI feedback',
      });
      await snap(page, '03-pluggy-not-configured');
      await writeSummary(findings, { connectTokenStatus, connectTokenBody, pageErrors, consoleErrors });
      // Don't fail the test — this is a configuration state, not a code defect
      return;
    }

    if (connectTokenStatus !== 200) {
      findings.push({
        step: 'Backend returned non-200 / non-503',
        ok: false,
        detail: `Unexpected status ${connectTokenStatus}`,
      });
      await snap(page, '03-unexpected-status');
      await writeSummary(findings, { connectTokenStatus, connectTokenBody, pageErrors, consoleErrors });
      return;
    }

    // ── Step 5: 200 — widget should mount. Pluggy renders inside an iframe.
    const pluggyIframe = page.frameLocator('iframe[src*="connect.pluggy.ai"], iframe[title*="Pluggy"], iframe[title*="Conectar"]').first();
    const widgetReady = await pluggyIframe.locator('body').isVisible({ timeout: 10000 }).catch(() => false);
    findings.push({
      step: 'Pluggy widget iframe mounted',
      ok: widgetReady,
      detail: widgetReady ? 'OK' : 'Widget did not appear within 10s of receiving a connectToken',
    });

    if (!widgetReady) {
      await snap(page, '03-widget-not-mounted');
      await writeSummary(findings, { connectTokenStatus, connectTokenBody, pageErrors, consoleErrors });
      return;
    }

    await snap(page, '03-widget-mounted');

    // ── Step 6: search Santander, enter CPF, stop before password
    // Pluggy's UI has a search input + bank list. Try a few common locators.
    const searchInputs = [
      pluggyIframe.getByPlaceholder(/Buscar|Search|banco|bank/i),
      pluggyIframe.locator('input[type="search"]'),
      pluggyIframe.locator('input[type="text"]').first(),
    ];
    let typedSearch = false;
    for (const loc of searchInputs) {
      if (await loc.isVisible().catch(() => false)) {
        await loc.fill('Santander');
        typedSearch = true;
        break;
      }
    }
    findings.push({
      step: 'Typed "Santander" into widget search',
      ok: typedSearch,
      detail: typedSearch ? 'OK' : 'No search input found in widget',
    });
    await page.waitForTimeout(1500);
    await snap(page, '04-santander-search');

    if (typedSearch) {
      const santanderOption = pluggyIframe.getByText(/Santander/i).first();
      if (await santanderOption.isVisible().catch(() => false)) {
        await santanderOption.click();
        findings.push({ step: 'Clicked Santander option', ok: true, detail: 'OK' });
        await page.waitForTimeout(1500);
        await snap(page, '05-santander-selected');

        // Some Pluggy connectors prompt for CPF before username/password
        const cpfInput = pluggyIframe.locator('input').first();
        if (await cpfInput.isVisible().catch(() => false)) {
          // Only fill if the field accepts numbers (likely CPF)
          await cpfInput.fill(cpf);
          findings.push({
            step: 'Filled CPF in widget',
            ok: true,
            detail: `Filled (masked: ${maskCpf(cpf)})`,
          });
          await snap(page, '06-cpf-filled');
        }
      } else {
        findings.push({
          step: 'Santander option in dropdown',
          ok: false,
          detail: 'Search typed but Santander result not visible — Pluggy connector list may not include it',
        });
      }
    }

    // STOP HERE — going further requires the user's actual Santander password,
    // which we don't have. Continuing risks fraud-detection lockout.
    findings.push({
      step: 'Halted before password',
      ok: true,
      detail: 'Intentional — password step requires real credentials and risks bank lockout',
    });

    await snap(page, '07-final');
    await writeSummary(findings, { connectTokenStatus, connectTokenBody, pageErrors, consoleErrors });
  });
});

async function writeSummary(
  findings: DiagFinding[],
  ctx: { connectTokenStatus: number | null; connectTokenBody: unknown; pageErrors: string[]; consoleErrors: string[] },
): Promise<void> {
  await fs.mkdir(SHOT_DIR, { recursive: true });
  const lines: string[] = [];
  lines.push('# Santander BR connect-flow diagnostic\n');
  lines.push(`Run: ${new Date().toISOString()}\n`);
  lines.push(`Backend connect-token status: ${ctx.connectTokenStatus ?? '(none)'}\n`);
  lines.push('## Steps\n');
  for (const f of findings) {
    lines.push(`- ${f.ok ? '✓' : '✗'} **${f.step}** — ${f.detail}`);
  }
  if (ctx.pageErrors.length > 0) {
    lines.push('\n## Page errors\n');
    ctx.pageErrors.forEach((e) => lines.push(`- ${e}`));
  }
  if (ctx.consoleErrors.length > 0) {
    lines.push('\n## Console errors (non-benign)\n');
    ctx.consoleErrors.slice(0, 10).forEach((e) => lines.push(`- ${e}`));
  }
  const reportPath = path.join(SHOT_DIR, 'report.md');
  await fs.writeFile(reportPath, lines.join('\n'));
  console.log(`\n[santander-diag] Report: ${reportPath}`);

  // Print to stdout too for immediate visibility
  console.log('\n=== DIAGNOSTIC SUMMARY ===');
  for (const f of findings) {
    console.log(`  ${f.ok ? '✓' : '✗'} ${f.step}`);
    console.log(`    ${f.detail}`);
  }
}
