import { expect, test } from '@playwright/test';
import { moneyFixture } from './money-beta-fixture';

for (const start of ['', '?start=banks', '?start=phone']) {
  test(`first-visit statement beta cannot open advanced onboarding ${start || 'automatically'}`, async ({page}) => {
    const state = await moneyFixture(page, {firstVisit:true}); state.advanced=false; state.empty=true;
    await page.goto('/money/you'+start);
    await page.getByRole('button',{name:/Add a statement/}).click();
    await expect(page.getByLabel('Statement account',{exact:true})).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Make a key',exact:true})).toHaveCount(0);
  });
}

for (const [start, title] of [['banks', 'Connect your bank.'], ['phone', 'A payment, the moment it happens.']]) {
  test(`owner retains ${start} setup`, async ({page}) => {
    await moneyFixture(page, {firstVisit:true});
    await page.goto('/money/you?start='+start);
    await expect(page.getByRole('dialog').getByRole('heading',{name:title,exact:true})).toBeVisible();
  });
}

test('failed capability lookup keeps advanced onboarding closed', async ({page}) => {
  /* The page carries the capabilities since M2-3; the failure is the part's, not the route's. */
  const state = await moneyFixture(page, {firstVisit:true}); state.empty=true; state.capabilitiesFailed=true;
  await page.goto('/money/you?start=banks');
  await page.getByRole('button',{name:/Add a statement/}).click();
  await expect(page.getByLabel('Statement account',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('student beta offers statements without bank or phone setup', async ({page}) => {
  const state=await moneyFixture(page); state.advanced=false; state.empty=true;
  await page.goto('/money');
  await expect(page.getByRole('link',{name:'Add a statement',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Connect Santander',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Add a statement',exact:true}).click();
  await expect(page.getByText('Live bank connections are not available in this beta. Add a statement instead.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Connect',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Make a key',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/Add a statement/}).click();
  await expect(page.getByLabel('Statement account',{exact:true})).toBeVisible();
});

test('a statement requires an account and submits the chosen account with its file', async ({page}) => {
  const state = await moneyFixture(page);
  await page.goto('/money/you');
  await page.getByRole('button', {name:/Add a statement/}).click();
  await page.getByLabel('Statement file').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('Fecha;Concepto;Importe\n17/09/2026;Cafe;-5,00')});
  await page.getByRole('button', {name:'Import statement',exact:true}).click();
  expect(state.imports).toHaveLength(0);
  await page.getByLabel('Statement account', {exact:true}).selectOption('acc2');
  await page.getByRole('button', {name:'Import statement',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'1 read, 1 added'})).toBeVisible();
  expect(state.imports[0]).toContain('name="accountId"\r\n\r\nacc2');
  expect(state.imports[0]).toContain('Cafe;-5,00');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.locator('#statement-import-form').screenshot({path:test.info().outputPath('statement-form.png')});
});

test('statement-only account and selected file survive a failed import for retry', async ({page}) => {
  const state = await moneyFixture(page); state.statementFailed=true;
  await page.goto('/money/you');
  await page.getByRole('button', {name:/Add a statement/}).click();
  await page.getByLabel('Statement account', {exact:true}).selectOption('new');
  await page.getByLabel('Account name', {exact:true}).fill('Everyday');
  await page.getByLabel('Statement file').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('Fecha;Concepto;Importe\n17/09/2026;Cafe;-5,00')});
  await page.getByRole('button', {name:'Import statement',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'The statement service is unavailable.'})).toBeVisible();
  await expect(page.getByLabel('Statement account', {exact:true})).toHaveValue('manual-account');
  state.statementFailed=false;
  await page.getByRole('button', {name:'Import statement',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'1 read, 1 added'})).toBeVisible();
  expect(state.accountCreations).toBe(1);
  expect(state.imports).toHaveLength(2);
});

for (const path of ['/money','/money/month','/money/you','/money/plan','/money/chat','/money/setup']) {
  test(`Money route ${path} renders without browser errors or horizontal overflow`, async ({ page }) => {
    await moneyFixture(page);
    const errors: string[] = [];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(path);
    if(path==='/money/chat') {
      const input=page.getByPlaceholder('Ask about your money');
      await input.fill('What did I spend today?'); await input.press('Enter');
      await expect(page.getByText('You spent 12.50 EUR at Audit Cafe.',{exact:false})).toBeVisible();
    } else if(path==='/money/month') {
      const month=new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'});
      await page.getByRole('button',{name:new RegExp(month)}).click();
      await page.getByRole('button',{name:/Audit Cafe/}).click();
      await expect(page.getByText('Audit Cafe 12.50',{exact:true})).toBeVisible();
    } else {
      await expect(page.locator('h1').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    await expect(page).toHaveURL(new RegExp(path+'$'));
  });
}

test('outage is visible, retry recovers, empty ledger is distinct',async ({page})=>{
  const state=await moneyFixture(page); state.failing=true;
  await page.goto('/money');
  await expect(page.getByText('Your month could not be read.',{exact:true})).toBeVisible();
  state.failing=false;
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByRole('heading',{name:/today/})).toBeVisible();
  state.empty=true; await page.reload();
  await expect(page.getByRole('heading',{name:'Nothing read yet.',exact:true})).toBeVisible();
});

test('loads the last payment beyond page 200',async ({page})=>{
  const state=await moneyFixture(page); state.paginated=true;
  await page.goto('/money/month');
  const month=new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  await page.getByRole('button',{name:new RegExp(month)}).click();
  await expect(page.getByRole('button',{name:/Last page cafe/})).toBeVisible();
});


test('home opens an editable chat draft without sending it', async ({page}) => {
  await moneyFixture(page);
  let sends=0; page.on('request',r=>{if(r.url().endsWith('/money/chat/stream')) sends++;});
  await page.goto('/money');
  await page.getByLabel('Ask about your money',{exact:true}).fill('Was the train a one-off?');
  await page.getByRole('button',{name:'Open conversation'}).click();
  await expect(page).toHaveURL(/\/money\/chat$/);
  await expect(page.getByRole('textbox',{name:'Ask about your money'})).toHaveValue('Was the train a one-off?');
  expect(sends).toBe(0);
});

test('interrupted HTTP 200 chat reports incompleteness and keeps the partial answer', async ({page}) => {
  const state=await moneyFixture(page); state.interrupted=true;
  await page.goto('/money/chat');
  const box=page.getByRole('textbox',{name:'Ask about your money'});
  await box.fill('Explain this week'); await box.press('Enter');
  await expect(page.getByText('An unfinished answer',{exact:true})).toBeVisible();
  await expect(page.getByRole('alert').filter({hasText:'The answer was interrupted'})).toBeVisible();
  await expect(box).toBeEnabled();
});

test('confirmed chat correction refreshes Today even inside its 30-second cache', async ({page}) => {
  const state=await moneyFixture(page); state.offer=true;
  await page.goto('/money');
  await expect(page.locator('.mv-day-value')).toContainText('16,43');
  await page.getByRole('button',{name:'Open conversation'}).click();
  // Wait for the lazy route: Today also has a textbox with this accessible name.
  await expect(page.getByRole('heading', { name: 'Ask.', exact: true })).toBeVisible();
  const box=page.getByRole('textbox',{name:'Ask about your money'});
  await box.fill('That cafe payment is not mine'); await box.press('Enter');
  await page.getByRole('button',{name:'Not my payment'}).click();
  await expect(page.getByText('Updated your ledger.',{exact:true})).toBeVisible();
  if (await page.getByRole('button',{name:'Menu',exact:true}).isVisible()) await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('link',{name:'Today',exact:true}).click();
  await expect(page.locator('.mv-day-value')).toContainText('29,99');
});

test('cards stay under their account and a confirmed type survives reload', async ({page}) => {
  const state=await moneyFixture(page); state.cards=true;
  await page.goto('/money/you');
  const accounts=page.locator('.mv-bank-account');
  await expect(accounts).toHaveCount(2);
  await expect(accounts.nth(0).getByLabel('Card ending 1234',{exact:false})).toHaveValue('unknown');
  await expect(accounts.nth(1).getByLabel('Card ending 1234',{exact:false})).toHaveValue('debit');
  await accounts.nth(0).getByLabel('Card ending 1234',{exact:false}).selectOption('credit');
  await expect(accounts.nth(0).getByLabel('Card ending 1234',{exact:false})).toHaveValue('credit');
  await page.reload();
  await expect(accounts.nth(0).getByLabel('Card ending 1234',{exact:false})).toHaveValue('credit');
  await expect(accounts.nth(1).getByLabel('Card ending 1234',{exact:false})).toHaveValue('debit');
  await accounts.nth(0).screenshot({path:test.info().outputPath('bank-cards.png')});
});

test('Today exposes its figure and conversation without a decorative globe', async ({page}) => {
  await moneyFixture(page); await page.goto('/money');
  await expect(page.locator('.mv-day-value')).toBeVisible();
  await expect(page.getByRole('button',{name:'Open conversation'})).toBeInViewport();
  expect(await page.locator('main.mv').evaluate(e=>getComputedStyle(e).getPropertyValue('--section').trim())).toBe((page.viewportSize()?.width || 1440) < 768 ? '96px' : '128px');
  await page.screenshot({path:test.info().outputPath('today.png'),fullPage:true});
});


for (const path of ['/money', '/money/chat']) {
  test(`composer focus stays on its container on ${path}`, async ({page}) => {
    await moneyFixture(page);
    await page.goto(path);
    const input = page.getByRole('textbox', {name:'Ask about your money'});
    await input.click();
    await expect(input).toBeFocused();
    await expect(input).toHaveCSS('outline-style','none');
    const frame = path === '/money' ? page.locator('.mv-home-ask') : page.locator('.mc-composer-inner');
    await expect(frame).toHaveCSS('outline-style','solid');
    await expect(frame).toHaveCSS('outline-width','2px');
    await input.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(input).toBeFocused();
    await expect(frame).toHaveCSS('outline-style','solid');
    await input.fill('An editable question');
    await expect(input).toHaveValue('An editable question');
    await frame.screenshot({path:test.info().outputPath('composer-focus.png')});
  });
}
