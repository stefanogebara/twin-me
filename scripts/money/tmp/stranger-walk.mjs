/* Walk production as an invited student with no bank: onboarding, Sources, a statement import, Today, Month, Ask. */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import XLSX from 'xlsx';
import dotenv from 'dotenv'; dotenv.config({ path: '.env', quiet: true });
const API = 'https://twin-ai-learn.vercel.app';
const OUT = process.argv[2];
const EMAIL = 'stefanogebara+stranger0913@gmail.com';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: EMAIL, expires_at: new Date(Date.now() + 600000).toISOString() });
const r = await fetch(`${API}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
const { accessToken } = await (await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } })).json();
if (!accessToken) { console.log('no token; verify status', r.status); process.exit(1); }

/* a Santander-style statement: preamble, header, six weeks of a student's payments */
const day = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const es = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = new Date(); const rows = []; let balance = 812.4;
const shops = [['COMPRA MERCADONA MADRID', -23.4], ['METRO DE MADRID', -12.2], ['GLOVO', -14.9], ['CAFETERIA LA ROLLERIE', -4.6], ['COMPRA ZARA MADRID', -39.95], ['UBER', -9.8], ['LIDL MADRID', -31.7], ['BIZUM A MARIA GARCIA', -25], ['SPOTIFY', -10.99], ['COMPRA CARREFOUR EXPRESS', -18.35], ['CINES YELMO', -9.5], ['BAR EL TIGRE', -16]];
for (let back = 44; back >= 0; back -= 1) {
  const d = new Date(today.getTime() - back * 86400000);
  if (d.getDate() === 1) { balance += 1750; rows.push([day(d), day(d), 'TRANSFERENCIA DE PADRES', es(1750), es(balance)]); }
  const n = (back * 7) % 3; for (let i = 0; i < n; i += 1) { const [c, a] = shops[(back + i * 5) % shops.length]; balance += a; rows.push([day(d), day(d), c, es(a), es(balance)]); }
}
const sheet = [['Extracto de movimientos'], ['Cuenta', 'ES00 0049 0000 0000 0000 0000'], ['Periodo', `${rows[0][0]} - ${rows[rows.length - 1][0]}`], [], ['Fecha Operación', 'Fecha Valor', 'Concepto', 'Importe EUR', 'Saldo'], ...rows];
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), 'Movimientos');
const file = `${OUT}/extracto.xlsx`; fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); console.log('statement rows:', rows.length);

const browser = await chromium.launch({ channel: 'chrome' });
const report = [];
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, locale: 'es-ES' });
  await ctx.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); } catch {} }, accessToken);
  const page = await ctx.newPage();
  const errors = []; const failed = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('response', (res) => { if (res.status() >= 400 && res.url().startsWith(API)) failed.push(`${res.status()} ${res.url().replace(API, '')}`); });
  const shot = async (tag) => page.screenshot({ path: `${OUT}/${name}-${tag}.png`, fullPage: true });
  const text = async () => (await page.locator('main').innerText().catch(() => '')).trim();
  const note = (tag, extra = {}) => report.push({ view: name, tag, ...extra });

  const t0 = Date.now();
  await page.goto(`${API}/money`, { waitUntil: 'domcontentloaded' });
  await page.locator('main h1, main .mv-hero').first().waitFor({ timeout: 20000 }).catch(() => {});
  const heroAt = Date.now() - t0; await page.waitForTimeout(3000);
  /* the onboarding sheet, step by step */
  const steps = [];
  for (let i = 0; i < 6; i += 1) {
    const dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.count())) break;
    const dtext = (await dialog.innerText()).trim().split('\n').map((l) => l.trim()).filter(Boolean);
    const buttons = await dialog.locator('button, a.mv-pill').allInnerTexts();
    steps.push({ title: dtext[0], lines: dtext.length, buttons });
    await shot(`onboarding-${i + 1}`);
    const radio = dialog.getByRole('radio', { name: /Espa/ });
    if (await radio.count()) { await radio.check(); await page.waitForTimeout(500); }
    const next = dialog.getByRole('button', { name: /^(Continue|Continuar|Not now|Ahora no|Agora não|Next|Siguiente|Próximo|Done|Listo|Feito|Skip|Saltar|Pular)$/i }).first();
    if (await next.count()) { await next.click(); await page.waitForTimeout(1500); } else { await page.keyboard.press('Escape'); await page.waitForTimeout(800); }
  }
  note('today-first', { heroMs: heroAt, words: (await text()).split(/\s+/).length, steps });
  await shot('today-first');

  await page.goto(`${API}/money/account`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
  const account = await text();
  note('account', { words: account.split(/\s+/).length, sourcesLines: account.split('\n').filter((l) => /banc|bank|extracto|statement|teléfono|phone|móvil/i.test(l)).slice(0, 8) });
  await shot('account');

  if (name === 'desktop') {
    /* the statement import through the real screen */
    const add = page.getByRole('button', { name: /Add a statement|Añadir un extracto|Adicionar um extrato/i }).first();
    if (await add.count()) await add.click(); await page.waitForTimeout(1500);
    const select = page.locator('#statement-account');
    if (await select.count()) {
      await select.selectOption('new'); await page.locator('#statement-account-name').fill('Santander (extracto)');
      await page.locator('#statement-file').setInputFiles(file);
      await page.getByRole('button', { name: /Import statement|Importar extracto|Importar o extrato/i }).click();
      await page.waitForTimeout(12000);
      const after = await text();
      note('import', { result: after.split('\n').filter((l) => /read|leídos|lidos|added|añadid|adicionad|skipped|omitid|ignorad|error|could not|no se pud/i.test(l)).slice(0, 4) });
      await shot('import');
    } else note('import', { result: ['no statement form found'] });
  }

  const t1 = Date.now();
  await page.goto(`${API}/money`, { waitUntil: 'domcontentloaded' }); await page.locator('main h1, main .mv-hero').first().waitFor({ timeout: 20000 }).catch(() => {}); const hero2 = Date.now() - t1; await page.waitForTimeout(5000);
  const todayText = await text();
  note('today-after', { heroMs: hero2, words: todayText.split(/\s+/).length, hero: todayText.split('\n').slice(0, 6) });
  await shot('today-after');
  await page.goto(`${API}/money/month`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  const monthText = await text();
  note('month', { words: monthText.split(/\s+/).length, lines: monthText.split('\n').slice(0, 8) });
  await shot('month');
  if (name === 'desktop') {
    await page.goto(`${API}/money/chat`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
    const box = page.locator('textarea, input[type="text"]').last();
    if (await box.count()) { await box.fill('cuánto gasté esta semana?'); await box.press('Enter'); await page.waitForTimeout(15000); }
    const chat = await text();
    note('ask', { lines: chat.split('\n').slice(-6) });
    await shot('ask');
  }
  note('health', { consoleErrors: [...new Set(errors)].slice(0, 6), failed: [...new Set(failed)].slice(0, 8) });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 6000));
