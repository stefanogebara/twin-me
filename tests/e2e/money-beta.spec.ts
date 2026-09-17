import { expect, test } from '@playwright/test';
import { moneyFixture } from './money-beta-fixture';

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
