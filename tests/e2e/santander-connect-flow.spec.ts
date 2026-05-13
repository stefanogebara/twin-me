/**
 * Bank connect-flow diagnostic (Pluggy BR — sandbox + production safe)
 * =====================================================================
 *
 * Drives the "Conectar banco BR" button on /money. Behavior branches on
 * which Pluggy environment the backend returns:
 *
 *  - 503 PLUGGY_NOT_CONFIGURED → verify the frontend's friendly fallback,
 *    report config gap, exit clean.
 *
 *  - 200 + environment="sandbox" → drive the FULL flow including password,
 *    using Pluggy's documented sandbox test users. There's no real bank
 *    behind these — zero lockout risk. End-to-end smoke for the connect +
 *    webhook + BankConnectionsList pipeline.
 *
 *  - 200 + environment="production" → drive up to CPF entry, then HALT
 *    before password. Real credentials would risk Santander fraud-lockout
 *    and we don't typically have them in CI anyway.
 *
 * CPF and password are read from env vars and never committed. Sandbox has
 * documented defaults so the test runs without secrets when Pluggy is in
 * sandbox mode.
 *
 * Setup (for sandbox end-to-end):
 *   1. Sign up free at https://dashboard.pluggy.ai
 *   2. Dashboard → API → copy CLIENT_ID + CLIENT_SECRET
 *   3. Add to .env:
 *        PLUGGY_CLIENT_ID=...
 *        PLUGGY_CLIENT_SECRET=...
 *        PLUGGY_ENV=sandbox
 *   4. Restart npm run server:dev
 *
 * Run:
 *   TWINME_RUN_SANTANDER_DIAG=true \
 *   TEST_CPF=<11 digits> \
 *   [TEST_BANK_USERNAME=user-ok] [TEST_BANK_PASSWORD=password-ok] \
 *     npx playwright test tests/e2e/santander-connect-flow.spec.ts \
 *     --project=chromium --reporter=line
 *
 * Drop --headed for CI; add it for visual debugging.
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

    // Cold Vite dev-server compiles the lazy MoneyPage chunk on first hit, which
    // can take 30+ seconds. Wait actively for the H1 to appear using waitFor()
    // — note: locator.isVisible() does NOT honor its timeout option (it's a
    // snapshot check). Use locator.waitFor() for actual timeout-based waiting.
    const moneyHeader = page.getByRole('heading', { name: /^Money$/i, level: 1 });
    await moneyHeader.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
    const moneyHeaderVisible = await moneyHeader.isVisible();
    await snap(page, '01-money-loaded');
    findings.push({
      step: '/money page loaded with header',
      ok: moneyHeaderVisible,
      detail: moneyHeaderVisible ? 'OK' : 'H1 "Money" not found',
    });

    // ── Step 2: locate the Conectar banco BR button
    const connectButton = page.getByRole('button', { name: /Conectar banco BR/i });
    await connectButton.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const buttonVisible = await connectButton.isVisible();
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

    // ── Step 5b: dismiss Pluggy's intro/onboarding modal if present.
    // The widget opens with a "Demo uso a Pluggy para se conectar às suas
    // contas" splash that has a Continuar / Continue button before the
    // bank list appears.
    const introContinue = pluggyIframe.getByRole('button', { name: /Continuar|Continue|Começar|Get started|Avançar/i }).first();
    if (await introContinue.isVisible().catch(() => false)) {
      console.log('[diag] Dismissing Pluggy intro modal');
      await introContinue.click().catch(() => {});
      await page.waitForTimeout(1500);
      await snap(page, '03b-after-intro');
    }

    // ── Step 6: determine environment (sandbox vs production)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (connectTokenBody as any)?.environment ?? 'unknown';
    const isSandbox = env === 'sandbox';
    findings.push({
      step: 'Pluggy environment',
      ok: env === 'sandbox' || env === 'production',
      detail: `environment="${env}"${isSandbox ? ' — driving full sandbox flow' : ' — halting before password'}`,
    });

    // ── Step 7: search a bank.
    // In sandbox, target the Pluggy Bank or Santander Sandbox connector
    // (no real bank — safe to drive to completion).
    // In production, target Santander (real bank — stop before password).
    const searchTerm = isSandbox ? 'Pluggy' : 'Santander';
    const searchInputs = [
      pluggyIframe.getByPlaceholder(/Buscar|Search|banco|bank/i),
      pluggyIframe.locator('input[type="search"]'),
      pluggyIframe.locator('input[type="text"]').first(),
    ];
    let typedSearch = false;
    for (const loc of searchInputs) {
      if (await loc.isVisible().catch(() => false)) {
        await loc.fill(searchTerm);
        typedSearch = true;
        break;
      }
    }
    findings.push({
      step: `Typed "${searchTerm}" into widget search`,
      ok: typedSearch,
      detail: typedSearch ? 'OK' : 'No search input found in widget',
    });
    await page.waitForTimeout(1500);
    await snap(page, '04-bank-search');

    if (!typedSearch) {
      await writeSummary(findings, { connectTokenStatus, connectTokenBody, pageErrors, consoleErrors });
      return;
    }

    // ── Step 8: pick the connector
    const connectorRegex = isSandbox ? /Pluggy|Sandbox/i : /Santander/i;
    const connectorOption = pluggyIframe.getByText(connectorRegex).first();
    const connectorVisible = await connectorOption.isVisible({ timeout: 3000 }).catch(() => false);
    findings.push({
      step: `Connector "${isSandbox ? 'Pluggy/Sandbox' : 'Santander'}" visible in list`,
      ok: connectorVisible,
      detail: connectorVisible ? 'OK' : 'Connector not in Pluggy list — connector inventory may have changed',
    });

    if (!connectorVisible) {
      await snap(page, '05-no-connector');
      await writeSummary(findings, { connectTokenStatus, connectTokenBody, pageErrors, consoleErrors });
      return;
    }

    await connectorOption.click();
    await page.waitForTimeout(2000);
    await snap(page, '05-connector-selected');

    // ── Step 9: credentials form
    // Pluggy renders bank-specific input fields. We try CPF first (some BR
    // banks need it), then fall back to username/password by order.
    //
    // Sandbox default credentials (Pluggy's documented test users):
    //   user-ok / password-ok            → instant success
    //   user-mfa-2step / password-mfa-2step → MFA flow
    //
    // Production: never auto-fill password — overridden only when user
    // explicitly sets TEST_BANK_PASSWORD and we're in sandbox.
    const username = process.env.TEST_BANK_USERNAME || (isSandbox ? 'user-ok' : '');
    const password = process.env.TEST_BANK_PASSWORD || (isSandbox ? 'password-ok' : '');

    // Try CPF input first if visible (some connectors prompt for it)
    const cpfInput = pluggyIframe.locator('input[name*="cpf" i], input[placeholder*="CPF" i]').first();
    if (await cpfInput.isVisible({ timeout: 1500 }).catch(() => false)) {
      await cpfInput.fill(cpf);
      findings.push({ step: 'Filled CPF', ok: true, detail: `(masked: ${maskCpf(cpf)})` });
      await snap(page, '06-cpf');
    }

    // Username / login field
    const userInput = pluggyIframe.locator(
      'input[name*="user" i], input[name*="login" i], input[placeholder*="usuário" i], input[type="text"]',
    ).first();
    if (await userInput.isVisible({ timeout: 1500 }).catch(() => false) && username) {
      await userInput.fill(username);
      findings.push({ step: 'Filled username', ok: true, detail: isSandbox ? `sandbox default: ${username}` : 'from TEST_BANK_USERNAME' });
      await snap(page, '07-username');
    }

    if (!isSandbox) {
      // Production: HALT here. No password entry, no submission.
      findings.push({
        step: 'Halted before password (production)',
        ok: true,
        detail: 'Intentional — real credentials risk Santander fraud-lockout',
      });
      await snap(page, '08-halted-prod');
      await writeSummary(findings, { connectTokenStatus, connectTokenBody, pageErrors, consoleErrors });
      return;
    }

    // ── Step 10: SANDBOX-ONLY — password + submit + connection completes
    const passwordInput = pluggyIframe.locator('input[type="password"]').first();
    if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false) && password) {
      await passwordInput.fill(password);
      findings.push({ step: 'Filled sandbox password', ok: true, detail: 'sandbox default' });
      await snap(page, '08-password');
    }

    // Pluggy's sandbox NeoPluggy connector has MULTIPLE consent screens
    // ("Continuar" intro → "Conectar" authorize → external mock auth →
    // back to widget). Click any submit-shaped button repeatedly until
    // we either see no more such buttons or the widget closes.
    const submitRegex = /Continuar|Continue|Conectar|Connect|Confirmar|Authorize|Autorizar|Sim|Yes/i;
    let submitClicks = 0;
    for (let i = 0; i < 6; i++) {
      const submitButton = pluggyIframe.getByRole('button', { name: submitRegex }).first();
      const visible = await submitButton.isVisible({ timeout: 1500 }).catch(() => false);
      if (!visible) break;
      await submitButton.click().catch(() => {});
      submitClicks++;
      await page.waitForTimeout(2500);
      await snap(page, `08-submit-${i + 1}`);
    }
    findings.push({
      step: 'Clicked through Pluggy consent screens',
      ok: submitClicks > 0,
      detail: `${submitClicks} submit click(s) made`,
    });

    // Wait for connection to settle — Pluggy widget closes on success,
    // BankConnectionsList back on /money should pick up the new item.
    await page.waitForTimeout(8000);
    await snap(page, '09-after-submit');

    // ── Step 11: verify the connection appeared in BankConnectionsList
    // The list renders connector_name + a status chip. After a successful
    // sandbox link, the chip should read "sincronizado" or "sincronizando".
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await snap(page, '10-money-after-link');

    const connectionListed = await page.getByText(/Pluggy|Sandbox/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const statusChip = await page.getByText(/sincronizad[oa]|sincronizando/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    findings.push({
      step: 'Bank appears in BankConnectionsList after link',
      ok: connectionListed,
      detail: connectionListed
        ? `OK — chip status visible: ${statusChip}`
        : 'Connection did not appear — webhook may not have fired or list query failed',
    });

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
