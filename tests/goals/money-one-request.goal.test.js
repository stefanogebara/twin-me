/**
 * Goal: Today is one request, and nothing on the page waits on a third party (M2-3, 2026-09-19).
 * (Lived in money-one-read.goal.test.js until 2026-09-22, when the server-side one-read test
 * took that name by mistake; restored here, unchanged.)
 * The page used to make nine requests through a browser's six connections and wait four
 * seconds on Google's font stylesheet before its first request left.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const hook = readFileSync(`${ROOT}src/pages/money/useMoneyAccount.ts`, 'utf8');
const html = readFileSync(`${ROOT}index.html`, 'utf8');
const route = readFileSync(`${ROOT}api/_app/routes/money.js`, 'utf8');

describe('the money page is one read', () => {
  it('reads the page once and never the nine parts one by one', () => {
    expect(hook).toMatch(/moneyAPI\.page\(/);
    for (const part of ['forecast', 'ledger', 'recurring', 'months', 'readings', 'usage', 'today', 'accounts', 'inbox', 'capabilities']) {
      expect(hook, `useMoneyAccount reads ${part} on its own`).not.toMatch(new RegExp(`moneyAPI\\.${part}\\(`));
    }
    expect(route).toMatch(/router\.get\('\/page'/);
  });
  it('loads no stylesheet or font from another origin', () => {
    const links = [...html.matchAll(/<link[^>]+>/g)].map((m) => m[0]).filter((l) => /stylesheet|preload/.test(l));
    for (const l of links) expect(l, l).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(html).toMatch(/\/fonts\/geist\.css/);
  });
});
