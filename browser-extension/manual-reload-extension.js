// Quick script to reload extension via chrome://extensions
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${__dirname}`,
      `--load-extension=${__dirname}`,
    ],
  });

  const page = await context.pages()[0] || await context.newPage();

  console.log('Navigating to chrome://extensions...');
  await page.goto('chrome://extensions');
  await page.waitForTimeout(2000);

  console.log('Enabling developer mode...');
  await page.evaluate(() => {
    const devMode = document.querySelector('extensions-manager')?.shadowRoot?.querySelector('#devMode');
    if (devMode && !devMode.checked) devMode.click();
  });
  await page.waitForTimeout(1000);

  console.log('Clicking reload button for Soul Signature extension...');
  await page.evaluate(() => {
    const items = document.querySelector('extensions-manager')
      ?.shadowRoot?.querySelectorAll('extensions-item-list')?.[0]
      ?.shadowRoot?.querySelectorAll('extensions-item');

    for (const item of items || []) {
      const name = item.shadowRoot?.querySelector('#name-and-version')?.textContent;
      if (name?.includes('Soul Signature')) {
        const reload = item.shadowRoot?.querySelector('#dev-reload-button');
        if (reload) {
          reload.click();
          console.log('✅ Extension reloaded!');
          return;
        }
      }
    }
  });

  await page.waitForTimeout(2000);
  console.log('\n✅ Extension reloaded successfully!');
  console.log('Closing in 3 seconds...');
  await page.waitForTimeout(3000);
  await context.close();
})();
