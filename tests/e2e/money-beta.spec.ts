import { expect, test } from '@playwright/test';
import { moneyFixture } from './money-beta-fixture';

for (const start of ['', '?start=banks', '?start=phone']) {
  test(`first-visit statement beta cannot open advanced onboarding ${start || 'automatically'}`, async ({page}) => {
    const state = await moneyFixture(page, {firstVisit:true}); state.advanced=false; state.empty=true;
    await page.goto('/money/account'+start);
    await page.getByRole('button',{name:/Add a statement/}).click();
    await expect(page.getByLabel('Statement account',{exact:true})).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Make a key',exact:true})).toHaveCount(0);
  });
}

for (const [start, title] of [['banks', 'Connect your bank.'], ['phone', 'A payment, the moment it happens.']]) {
  test(`owner retains ${start} setup`, async ({page}) => {
    await moneyFixture(page, {firstVisit:true});
    await page.goto('/money/account?start='+start);
    await expect(page.getByRole('dialog').getByRole('heading',{name:title,exact:true})).toBeVisible();
  });
}

test('failed capability lookup keeps advanced onboarding closed', async ({page}) => {
  /* The page carries the capabilities since M2-3; the failure is the part's, not the route's. */
  const state = await moneyFixture(page, {firstVisit:true}); state.empty=true; state.capabilitiesFailed=true;
  await page.goto('/money/account?start=banks');
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
  /* The gate computes its reason (M3-8); today's production reason for a stranger is the restricted application. */
  await expect(page.getByText('Bank connections open for everyone once our bank access is cleared. Until then, add a statement.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Connect',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Make a key',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/Add a statement/}).click();
  await expect(page.getByLabel('Statement account',{exact:true})).toBeVisible();
});

test('a statement requires an account and submits the chosen account with its file', async ({page}) => {
  const state = await moneyFixture(page);
  await page.goto('/money/account');
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

test('statement clarification keeps the file, asks explicitly, and imports only after answers', async ({page}) => {
  await moneyFixture(page);
  const requests: string[] = [];
  let failConfirmation = true;
  await page.route('**/api/money/statement', async route => {
    const body = route.request().postData() || ''; requests.push(body);
    if (!body.includes('name="answers"')) return route.fulfill({json:{success:true,data:{needs:{
      plan:{index:0,columns:{date:0,concept:1,amount:2},sign:'signed'},
      questions:[{id:'sign',asks:'Is this column what you spent, or what came in?',choices:[{value:'all_out',label:'Money out'},{value:'all_in',label:'Money in'}]}],preview:[],read:1,skipped:0,reviewRequired:true,
    }}}});
    if (!body.includes('name="confirm"')) return route.fulfill({json:{success:true,data:{needs:{
      plan:{index:0,columns:{date:0,concept:1,amount:2},sign:'all_out'}, questions:[],
      preview:[{day:'2026-09-20',name:'Dinner',amount:25,currency:'EUR',direction:'out'}],read:1,skipped:0,reviewRequired:true,
    }}}});
    if (failConfirmation) return route.fulfill({status:503,json:{success:false,error:'Please retry the import.'}});
    return route.fulfill({json:{success:true,data:{read:1,created:1,attached:0,skipped:0}}});
  });
  await page.goto('/money/account');
  await page.getByRole('button',{name:/Add a statement/}).click();
  await page.getByLabel('Statement account',{exact:true}).selectOption('acc2');
  await page.getByLabel('Statement file').setInputFiles({name:'budget.csv',mimeType:'text/csv',buffer:Buffer.from('When;What;How much\n2026-09-20;Dinner;25.00')});
  await page.getByRole('button',{name:'Import statement',exact:true}).click();
  await expect(page.getByText('Nothing has been imported yet.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Review import',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Statement file')).not.toHaveValue('');
  await page.getByLabel('Is this money out or money in?',{exact:true}).selectOption('all_out');
  await page.getByRole('button',{name:/Add a statement/}).click();
  await page.getByRole('button',{name:/Add a statement/}).click();
  await expect(page.getByLabel('Statement file')).not.toHaveValue('');
  await expect(page.getByLabel('Is this money out or money in?',{exact:true})).toHaveValue('all_out');
  await page.getByRole('button',{name:'Review import',exact:true}).click();
  await expect(page.getByText('1 ready to import, 0 skipped.',{exact:true})).toBeVisible();
  await expect(page.getByText('Money out · 25,00 EUR',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Add a statement/}).click();
  await page.getByRole('button',{name:/Add a statement/}).click();
  await expect(page.getByLabel('Statement file')).not.toHaveValue('');
  await page.locator('#statement-import-form').screenshot({path:test.info().outputPath('statement-review.png')});
  await page.getByRole('button',{name:'Confirm and import',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Please retry the import.'})).toBeVisible();
  await expect(page.getByText('Money out · 25,00 EUR',{exact:true})).toBeVisible();
  failConfirmation = false;
  await page.getByRole('button',{name:'Confirm and import',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'1 read, 1 added'})).toBeVisible();
  expect(requests).toHaveLength(4);
  expect(requests[1]).toContain('name="accountId"\r\n\r\nacc2');
  expect(requests[1]).toContain('Dinner;25.00');
  expect(requests[1]).toContain('"sign":"all_out"');
  expect(requests[1]).toContain('name="plan"');
  expect(requests[1]).not.toContain('name="confirm"');
  expect(requests[2]).toContain('name="confirm"\r\n\r\ntrue');
  expect(requests[3]).toContain('"sign":"all_out"');
  await expect(page.getByLabel('Statement file')).toHaveValue('');
});

test('a different statement file or account discards its prior interpretation', async ({page}) => {
  await moneyFixture(page);
  const bodies: string[] = [];
  await page.route('**/api/money/statement', route => {
    bodies.push(route.request().postData() || '');
    return route.fulfill({json:{success:true,data:{needs:{
      plan:{index:0,columns:{date:0,amount:1}}, questions:[], preview:[], read:0, skipped:1, reviewRequired:true,
    }}}});
  });
  await page.goto('/money/account');
  await page.getByRole('button',{name:/Add a statement/}).click();
  await page.getByLabel('Statement account',{exact:true}).selectOption('acc1');
  await page.getByLabel('Statement file').setInputFiles({name:'first.csv',mimeType:'text/csv',buffer:Buffer.from('When;Cost\nmissing;5')});
  await page.getByRole('button',{name:'Import statement',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm and import',exact:true})).toBeDisabled();
  await expect(page.getByText('Some rows could not be read. Check your file before importing.',{exact:true})).toBeVisible();
  await page.getByLabel('Statement account',{exact:true}).selectOption('acc2');
  await expect(page.getByText('Nothing has been imported yet.',{exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'Import statement',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm and import',exact:true})).toBeDisabled();
  await page.getByLabel('Statement file').setInputFiles({name:'second.csv',mimeType:'text/csv',buffer:Buffer.from('When;Cost\n2026-09-21;8')});
  await expect(page.getByText('Nothing has been imported yet.',{exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'Import statement',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm and import',exact:true})).toBeDisabled();
  expect(bodies).toHaveLength(3);
  for (const body of bodies) { expect(body).not.toContain('name="plan"'); expect(body).not.toContain('name="confirm"'); }
  expect(bodies[1]).toContain('name="accountId"\r\n\r\nacc2');
  expect(bodies[2]).toContain('second.csv');
});

test('statement-only account and selected file survive a failed import for retry', async ({page}) => {
  const state = await moneyFixture(page); state.statementFailed=true;
  await page.goto('/money/account');
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

for (const path of ['/money','/money/month','/money/you','/money/account','/money/plan','/money/chat','/money/setup']) {
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
  await page.getByRole('button',{name:'Ask',exact:true}).click();
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
  await page.getByRole('button',{name:'Ask',exact:true}).click();
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
  await page.goto('/money/account');
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
  await expect(page.getByRole('button',{name:'Ask',exact:true})).toBeInViewport();
  expect(await page.locator('main.mv').evaluate(e=>getComputedStyle(e).getPropertyValue('--section').trim())).toBe((page.viewportSize()?.width || 1440) < 768 ? '112px' : '160px');
  await page.screenshot({path:test.info().outputPath('today.png'),fullPage:true});
});


for (const path of ['/money', '/money/chat']) {
  test(`composer retains a visible focus indicator on ${path}`, async ({page}) => {
    await moneyFixture(page);
    await page.goto(path);
    const input = page.getByRole('textbox', {name:'Ask about your money'});
    await input.click();
    await expect(input).toBeFocused();
    await expect(input).toHaveCSS('outline-style','none');
    const frame = path === '/money' ? page.locator('.mv-home-ask') : page.locator('.mc-composer-inner');
    if (path === '/money') {
      await expect(frame).toHaveCSS('outline-style','solid');
      await expect(frame).toHaveCSS('outline-width','2px');
    } else {
      await expect(frame).toHaveCSS('outline-style','none');
      await expect(input).toHaveCSS('box-shadow', 'rgb(37, 31, 33) 0px 2px 0px 0px');
    }
    await input.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(input).toBeFocused();
    if (path === '/money') await expect(frame).toHaveCSS('outline-style','solid');
    else await expect(input).toHaveCSS('box-shadow', 'rgb(37, 31, 33) 0px 2px 0px 0px');
    await input.fill('An editable question');
    await expect(input).toHaveValue('An editable question');
    await frame.screenshot({path:test.info().outputPath('composer-focus.png')});
  });
}


test('Ask keeps supporting payments behind a keyboard-accessible disclosure', async ({page}) => {
  await moneyFixture(page);
  await page.route('**/api/money/chat/history', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:[
    {id:'question',role:'user',text:'Where did it go?'},
    {id:'answer',role:'twin',text:'Nine supporting payments are available.',receipts:Array.from({length:9},(_,i)=>({id:`source-${i}`,merchant:`Evidence shop ${i+1}`,occurred_at:'2026-09-20T12:00:00Z',amount:10,currency:'EUR'}))},
  ]})}));
  await page.goto('/money/chat');
  const summary=page.locator('summary').filter({hasText:'Supporting payments (9)'});
  await expect(summary).toBeVisible();
  await expect(page.getByText('Evidence shop 1',{exact:true})).not.toBeVisible();
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('Evidence shop 9',{exact:true})).toBeVisible();
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('Evidence shop 9',{exact:true})).not.toBeVisible();
  await expect(page.getByText('Nine supporting payments are available.',{exact:true})).toBeVisible();
});

test('Ask presents a purchase comparison and keeps its evidence keyboard accessible', async ({ page }) => {
  await moneyFixture(page);
  await page.route('**/api/money/chat/history', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [
    { id: 'q', role: 'user', text: 'Can I spend 25 euros on dinner today?' },
    { id: 'a', role: 'twin', text: '25,00 € is 8,57 € above today’s estimate of 16,43 €.',
      figures: [{ kind: 'purchase', cost: 25, allowance: 16.43, difference: 8.57, currency: 'EUR' }],
      basis: ['Available balance and upcoming charges.'] },
  ] }) }));
  await page.goto('/money/chat');
  await expect(page.locator('.mc-purchase-amount')).toHaveText(/8,57\s*€/);
  await expect(page.locator('.mc-purchase-label')).toHaveText('over today’s estimate');
  const details = page.getByRole('button', { name: 'Calculation details', exact: true });
  await details.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('Available balance and upcoming charges.', { exact: true })).toBeVisible();
  await page.locator('.mc-ledger-activity > summary').click();
  await expect(page.locator('.mc-trace')).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Ask about your money', exact: true });
  await input.fill('A follow-up');
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Ask keeps the complete text when a stored comparison is malformed', async ({ page }) => {
  await moneyFixture(page);
  await page.route('**/api/money/chat/history', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [
    { id: 'a', role: 'twin', text: 'The estimate is unavailable.', figures: [{ kind: 'purchase', cost: 25, allowance: null, difference: null, currency: 'EUR' }] },
  ] }) }));
  await page.goto('/money/chat');
  await expect(page.getByText('The estimate is unavailable.', { exact: true })).toBeVisible();
  await expect(page.locator('.mc-purchase')).toHaveCount(0);
});

test('beta signup submits the chosen phone and Money sources', async ({ page }) => {
  await moneyFixture(page);
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/beta/signup', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Preview validation only' }) });
  });
  await page.goto('/beta');
  await page.getByLabel('Your name', { exact: true }).fill('Synthetic Student');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid');
  await page.getByRole('button', { name: 'Bank statements', exact: true }).click();
  await page.getByRole('button', { name: 'iPhone', exact: true }).click();
  await page.getByRole('button', { name: 'Apply for the beta', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Preview validation only');
  expect(submitted).toMatchObject({ name: 'Synthetic Student', email: 'synthetic@example.invalid', phone: 'ios', platforms: ['statements'] });
  await expect(page.getByRole('button', { name: 'Spotify', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('payment evidence failure stays distinct from empty and retries without reopening the payment', async ({page}) => {
  await moneyFixture(page);
  let reads = 0;
  await page.route('**/api/money/transactions/tx1/sightings', async route => {
    reads++;
    return route.fulfill({status:reads === 1 ? 503 : 200,contentType:'application/json',body:JSON.stringify(reads === 1
      ? {success:false,error:'Synthetic receipt outage'}
      : {success:true,data:[{id:'s1',source:'bankfeed',seen_at:new Date().toISOString(),raw_text:'Recovered receipt for Audit Cafe',amount:12.5,currency:'EUR'}]})});
  });
  await page.goto('/money/month');
  const month = new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  await page.getByRole('button',{name:new RegExp(month)}).click();
  const payment = page.getByRole('button',{name:/Audit Cafe/});
  await payment.click();
  await expect(page.getByRole('alert').filter({hasText:'Could not read these receipts.'})).toBeVisible();
  await expect(page.getByText('Reading the receipts.',{exact:true})).toHaveCount(0);
  await expect(page.getByText('No receipt kept for this one.',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByText('Recovered receipt for Audit Cafe',{exact:true})).toBeVisible();
  await expect(payment).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('alert').filter({hasText:'Could not read these receipts.'})).toHaveCount(0);
  expect(reads).toBe(2);
});


test('Ask waits for saved history while preserving an editable draft', async ({ page }) => {
  await moneyFixture(page);
  let finishHistory!: () => void;
  const held = new Promise<void>((resolve) => { finishHistory = resolve; });
  await page.route('**/api/money/chat/history', async route => {
    await held;
    await route.fulfill({ json: { success: true, data: [
      { id: 'earlier-user', role: 'user', text: 'An earlier question' },
      { id: 'earlier-answer', role: 'twin', text: 'An earlier saved answer' },
    ] } });
  });
  await page.goto('/money/chat');
  await expect(page.getByRole('status').filter({ hasText: 'Loading your conversation' })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Ask about your money', exact: true });
  await input.fill('My unsent follow-up');
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add a photo or a file', exact: true })).toBeDisabled();
  await input.press('Enter');
  await expect(input).toHaveValue('My unsent follow-up');
  finishHistory();
  await expect(page.getByText('An earlier saved answer', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Loading your conversation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
  await expect(input).toHaveValue('My unsent follow-up');
});

test('calendar failure stays unread and can be retried without reconnecting', async ({page}) => {
  await moneyFixture(page);
  let failed = true;
  await page.route('**/api/money/calendar', route => failed
    ? route.fulfill({status:502,json:{success:false,error:'The calendar could not be read right now.'}})
    : route.fulfill({json:{success:true,data:{connected:true,google:true,feeds:[],events_seen:3,learned_at:new Date().toISOString(),learned:[]}}}));
  await page.goto('/money/account');
  const sources = page.locator('#sources');
  await expect(sources.getByText('That could not be read right now.',{exact:true})).toBeVisible();
  await expect(sources.getByRole('button',{name:'Connect Google',exact:true})).toHaveCount(0);
  failed = false;
  await sources.getByRole('button',{name:'Try calendar again',exact:true}).click();
  await expect(sources.getByText(/3 events read, last/)).toBeVisible();
  await expect(sources.getByRole('button',{name:'Try calendar again',exact:true})).toHaveCount(0);
});

test('known calendar reauthorization failure offers the recovery action', async ({page}) => {
  await moneyFixture(page);
  await page.route('**/api/money/calendar', route => route.fulfill({status:502,json:{success:false,error:'The calendar could not be read right now.',needsReconnect:true}}));
  await page.goto('/money/account');
  const sources = page.locator('#sources');
  await expect(sources.getByRole('button',{name:'Reconnect Google',exact:true})).toBeVisible();
  await expect(sources.getByRole('button',{name:'Try calendar again',exact:true})).toHaveCount(0);
});
