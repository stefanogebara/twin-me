/** The feed remains unwired; these tests cover parsing and approval, not network safety. */
import { describe, it, expect, vi } from 'vitest';
import { parseDelimited, toSightings } from '../../../../api/_app/services/money/statements/importer.js';
import { planQuestions } from '../../../../api/_app/services/money/statements/shape.js';
import { isSheetUrl, normaliseSheetUrl, sheetKind, readSheetFeed, MAX_SHEET_BYTES, createSheetApproval } from '../../../../api/_app/services/money/statements/sheetFeed.js';

describe('isSheetUrl', () => {
  it('takes an https address with a real host', () => {
    expect(isSheetUrl('https://docs.google.com/spreadsheets/d/abc/export?format=csv')).toBe(true);
    expect(isSheetUrl('https://example.com/budget.csv')).toBe(true);
  });

  it('refuses anything that is not https', () => {
    expect(isSheetUrl('http://docs.google.com/spreadsheets/d/abc/export?format=csv')).toBe(false);
    expect(isSheetUrl('file:///etc/passwd')).toBe(false);
    expect(isSheetUrl('ftp://example.com/a.csv')).toBe(false);
  });

  /* A server that fetches a pasted address on a schedule will happily fetch its own cloud's
     metadata service, or something inside the network, if nobody stops it. */
  it('refuses the addresses that are only reachable from inside', () => {
    expect(isSheetUrl('https://localhost/a.csv')).toBe(false);
    expect(isSheetUrl('https://intranet.local/a.csv')).toBe(false);
    expect(isSheetUrl('https://db.internal/a.csv')).toBe(false);
    expect(isSheetUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSheetUrl('https://10.0.0.5/a.csv')).toBe(false);
    expect(isSheetUrl('https://[::1]/a.csv')).toBe(false);
    expect(isSheetUrl('https://nodot/a.csv')).toBe(false);
  });

  it('refuses what is not a URL at all', () => {
    expect(isSheetUrl('')).toBe(false);
    expect(isSheetUrl(null)).toBe(false);
    expect(isSheetUrl('my budget')).toBe(false);
  });
});

describe('normaliseSheetUrl', () => {
  /* People paste the address in their browser bar, which is the edit page and is HTML. */
  it('turns the link a person copies from Google Sheets into the CSV of that tab', () => {
    expect(normaliseSheetUrl('https://docs.google.com/spreadsheets/d/1AbC_d-9/edit#gid=1234'))
      .toBe('https://docs.google.com/spreadsheets/d/1AbC_d-9/export?format=csv&gid=1234');
  });

  it('keeps the first tab when the link names none', () => {
    expect(normaliseSheetUrl('https://docs.google.com/spreadsheets/d/1AbC_d-9/edit?usp=sharing'))
      .toBe('https://docs.google.com/spreadsheets/d/1AbC_d-9/export?format=csv&gid=0');
  });

  it('leaves an export or a published link alone, since both already give CSV', () => {
    const exported = 'https://docs.google.com/spreadsheets/d/1AbC_d-9/export?format=csv&gid=7';
    expect(normaliseSheetUrl(exported)).toBe(exported);
    const published = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vABC/pub?output=csv';
    expect(normaliseSheetUrl(published)).toBe(published);
  });

  it('leaves any other https address alone', () => {
    expect(normaliseSheetUrl('https://example.com/budget.csv')).toBe('https://example.com/budget.csv');
  });

  it('is null for an address it will not fetch', () => {
    expect(normaliseSheetUrl('http://example.com/a.csv')).toBeNull();
    expect(normaliseSheetUrl('https://127.0.0.1/a.csv')).toBeNull();
    expect(normaliseSheetUrl('')).toBeNull();
  });

  it('refuses a Google Doc, which is prose and not a ledger', () => {
    expect(normaliseSheetUrl('https://docs.google.com/document/d/1AbC/edit')).toBeNull();
  });
});

describe('sheetKind', () => {
  it('names where the sheet lives, for the line the screen shows', () => {
    expect(sheetKind('https://docs.google.com/spreadsheets/d/a/export?format=csv')).toBe('google');
    expect(sheetKind('https://onedrive.live.com/download?cid=1')).toBe('onedrive');
    expect(sheetKind('https://acme-my.sharepoint.com/personal/x/_layouts/download.aspx')).toBe('onedrive');
    expect(sheetKind('https://example.com/budget.csv')).toBe('csv');
  });
});

// Network/empty-body responses are independent of the real schema tests below.
describe('readSheetFeed', () => {
  const plan = { index: 0, columns: { date: 0, concept: 1, amount: 2 }, dateOrder: 'dmy', decimal: ',', sign: 'all_out', currency: 'EUR', year: 2026, answered: ['sign', 'year', 'currency', 'dateOrder'] };
  const feed = { url: 'https://docs.google.com/spreadsheets/d/abc/edit#gid=0', plan, accountId: 'acc-1' };
  const csv = 'Fecha;Gasto;Importe\n03/04;Mercadona;23,40\n';
  feed.approval = createSheetApproval(feed, parseDelimited(csv), { confirmed: true });

  const deps = (over = {}) => ({
    fetchText: vi.fn().mockResolvedValue(csv),
    parseDelimited: vi.fn().mockReturnValue([['Fecha', 'Gasto', 'Importe'], ['03/04', 'Mercadona', '23,40']]),
    planQuestions: vi.fn().mockReturnValue([]),
    toSightings: vi.fn().mockReturnValue({ sightings: [{ amount: 23.4 }] }),
    ingestSightings: vi.fn().mockResolvedValue({ created: 1, attached: 0 }),
    ...over,
  });

  it('fetches the CSV of the sheet, not the page the person pasted', async () => {
    const d = deps();
    await readSheetFeed(feed, d);
    expect(d.fetchText.mock.calls[0][0]).toBe('https://docs.google.com/spreadsheets/d/abc/export?format=csv&gid=0');
  });

  it('applies the plan that was agreed, and reports what it wrote', async () => {
    const d = deps();
    const out = await readSheetFeed(feed, d);
    expect(d.toSightings.mock.calls[0][1]).toMatchObject({ plan, accountId: 'acc-1' });
    expect(out).toMatchObject({ ok: true, read: 1, created: 1 });
  });

  it('will not read a sheet whose columns were never agreed', async () => {
    const out = await readSheetFeed({ ...feed, plan: null }, deps());
    expect(out).toMatchObject({ ok: false, reason: 'no_plan' });
  });

  it('asks again rather than importing the wrong columns when the sheet changes shape', async () => {
    const d = deps({ planQuestions: vi.fn().mockReturnValue([{ id: 'sign', asks: '?', choices: [] }]) });
    const out = await readSheetFeed(feed, d);
    expect(out).toMatchObject({ ok: false, reason: 'shape_changed' });
    expect(out.questions).toHaveLength(1);
    expect(d.ingestSightings).not.toHaveBeenCalled();
  });

  it('says the sheet is not shared when Google answers with its sign-in page', async () => {
    const d = deps({ fetchText: vi.fn().mockResolvedValue('<!DOCTYPE html><html>Sign in</html>') });
    const out = await readSheetFeed(feed, d);
    expect(out).toMatchObject({ ok: false, reason: 'not_shared' });
    expect(d.ingestSightings).not.toHaveBeenCalled();
  });

  it('is unreachable rather than thrown when the fetch fails', async () => {
    const d = deps({ fetchText: vi.fn().mockRejectedValue(new Error('timeout')) });
    await expect(readSheetFeed(feed, d)).resolves.toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('refuses an address it would not fetch, however it was stored', async () => {
    const d = deps();
    await expect(readSheetFeed({ ...feed, url: 'http://169.254.169.254/' }, d)).resolves.toMatchObject({ ok: false, reason: 'bad_url' });
    expect(d.fetchText).not.toHaveBeenCalled();
  });

  it('writes nothing when the sheet holds no readable row', async () => {
    const d = deps({ toSightings: vi.fn().mockReturnValue({ sightings: [] }) });
    const out = await readSheetFeed(feed, d);
    expect(out).toMatchObject({ ok: false, reason: 'no_rows' });
    expect(d.ingestSightings).not.toHaveBeenCalled();
  });

  it('passes the byte cap to the future network adapter', async () => {
    const d = deps();
    await readSheetFeed(feed, d);
    expect(d.fetchText.mock.calls[0][1]).toMatchObject({ maxBytes: MAX_SHEET_BYTES });
  });
});

// Real parsing/interpretation: column drift must not be hidden by mocks.
describe('approved sheet schema', () => {
  const csv = 'Date;Description;Amount\n2026-09-20;Cafe;-10\n';
  const plan = { index: 0, columns: { date: 0, concept: 1, amount: 2 }, dateOrder: 'ymd', decimal: '.', sign: 'signed', currency: 'EUR', year: null, answered: [] };
  const base = { url: 'https://example.com/budget.csv', accountId: '00000000-0000-4000-8000-000000000071', plan };
  const approved = () => ({ ...base, approval: createSheetApproval(base, parseDelimited(csv), { confirmed: true }) });
  const actualDeps = (body = csv) => ({ fetchText: vi.fn().mockResolvedValue(body), parseDelimited, toSightings, planQuestions, ingestSightings: vi.fn().mockResolvedValue({ created: 1 }) });
  it('does not treat zero questions as approval', async () => {
    const d = actualDeps();
    expect(planQuestions(parseDelimited(csv), plan)).toEqual([]);
    expect(await readSheetFeed(base, d)).toMatchObject({ ok: false, reason: 'approval_required' });
    expect(d.fetchText).not.toHaveBeenCalled();
    expect(d.ingestSightings).not.toHaveBeenCalled();
  });
  it.each([
    ['inserted', 'Date;Description;Budget;Amount\n2026-09-20;Cafe;-100;-10\n'],
    ['reordered', 'Date;Amount;Description\n2026-09-20;-10;Cafe\n'],
    ['renamed', 'Date;Description;Budget\n2026-09-20;Cafe;-100\n'],
    ['moved', 'September\nDate;Description;Amount\n2026-09-20;Cafe;-10\n'],
  ])('withholds after the header is %s', async (_name, body) => {
    const d = actualDeps(body);
    expect(await readSheetFeed(approved(), d)).toMatchObject({ ok: false, reason: 'approval_required' });
    expect(d.ingestSightings).not.toHaveBeenCalled();
  });
  it.each([
    ['interpretation', { plan: { ...plan, sign: 'all_in' } }],
    ['account', { accountId: '00000000-0000-4000-8000-000000000072' }],
    ['source', { url: 'https://example.com/different.csv' }],
  ])('withholds after approved %s changes', async (_name, change) => {
    const d = actualDeps();
    expect(await readSheetFeed({ ...approved(), ...change }, d)).toMatchObject({ ok: false, reason: 'approval_required' });
    expect(d.ingestSightings).not.toHaveBeenCalled();
  });
  it('creates approval only on explicit confirmation, not answered questions', () => {
    const rows = parseDelimited(csv);
    expect(createSheetApproval(base, rows)).toBeNull();
    expect(createSheetApproval(base, rows, { confirmed: 'true' })).toBeNull();
    expect(createSheetApproval(base, rows, { confirmed: true })).toMatchObject({ version: 1 });
    const unsigned = parseDelimited('Date;Description;Amount\n2026-09-20;Cafe;10');
    expect(createSheetApproval(base, unsigned, { confirmed: true })).toBeNull();
  });
  it.each([
    ['unchanged', csv, 1],
    ['added rows', `${csv}2026-09-21;Grocer;-25\n`, 2],
    ['reordered rows', 'Date;Description;Amount\n2026-09-21;Grocer;-25\n2026-09-20;Cafe;-10\n', 2],
  ])('accepts approved %s using the real parser and interpretation', async (_label, body, count) => {
    const d = actualDeps(body);
    expect(await readSheetFeed(approved(), d)).toMatchObject({ ok: true, read: count });
    expect(d.ingestSightings.mock.calls[0][0]).toHaveLength(count);
    expect(d.ingestSightings.mock.calls[0][0][0]).toMatchObject({ account_id: base.accountId, direction: 'out', currency: 'EUR' });
  });
  it.each([
    { decimal: ',' }, { dateOrder: 'dmy' }, { currency: 'USD' }, { year: 2025 },
    { index: 1 }, { columns: { date: 0, concept: 2, amount: 1 } },
  ])('requires renewed approval for every parser interpretation change: %j', async change => {
    const d = actualDeps();
    expect(await readSheetFeed({ ...approved(), plan: { ...plan, ...change } }, d)).toMatchObject({ ok: false, reason: 'approval_required' });
    expect(d.fetchText).not.toHaveBeenCalled();
    expect(d.ingestSightings).not.toHaveBeenCalled();
  });
  it('canonicalizes equivalent source URLs and ignores object key order', async () => {
    const feed = { ...base, url: 'https://docs.google.com/spreadsheets/d/abc/edit#gid=7' };
    const approval = createSheetApproval(feed, parseDelimited(csv), { confirmed: true });
    const d = actualDeps();
    expect(await readSheetFeed({ ...feed, approval, url: 'https://docs.google.com/spreadsheets/d/abc/export?gid=7&format=csv', plan: { ...plan, columns: { amount: 2, concept: 1, date: 0 } } }, d)).toMatchObject({ ok: true });
    const other = actualDeps();
    expect(await readSheetFeed({ ...feed, approval, url: 'https://docs.google.com/spreadsheets/d/abc/edit#gid=8' }, other)).toMatchObject({ ok: false, reason: 'approval_required' });
    expect(other.fetchText).not.toHaveBeenCalled();
  });
  it('rejects malformed approval versions without fetching', async () => {
    const d = actualDeps();
    expect(await readSheetFeed({ ...approved(), approval: { ...approved().approval, version: 2 } }, d)).toMatchObject({ ok: false, reason: 'approval_required' });
    expect(d.fetchText).not.toHaveBeenCalled();
  });

  it('withholds if the interpretation changes while the download is in flight', async () => {
    const feed = approved();
    const d = actualDeps();
    d.fetchText.mockImplementation(async () => { feed.plan = { ...plan, sign: 'all_in' }; return csv; });
    expect(await readSheetFeed(feed, d)).toMatchObject({ ok: false, reason: 'approval_required' });
    expect(d.ingestSightings).not.toHaveBeenCalled();
  });

});


describe('source domain boundaries', () => {
  it.each([
    ['https://evilgoogle.com/spreadsheets/d/abc/edit', 'csv'],
    ['https://notdocs.google.com.evil.test/spreadsheets/d/abc/edit', 'csv'],
    ['https://evillive.com/budget.csv', 'csv'],
    ['https://evilsharepoint.com/budget.csv', 'csv'],
    ['https://sheets.google.com/spreadsheets/d/abc/edit', 'google'],
    ['https://tenant.sharepoint.com/budget.csv', 'onedrive'],
    ['https://onedrive.live.com/budget.csv', 'onedrive'],
  ])('classifies only actual provider domains: %s', (url, kind) => {
    expect(sheetKind(url)).toBe(kind);
    if (kind === 'csv') expect(normaliseSheetUrl(url)).toBe(url);
  });
});

describe('approval remains the one reviewed before download', () => {
  const csv = 'Date;Description;Amount\n2026-09-20;Cafe;-10\n';
  const changed = 'Date;Description;Budget\n2026-09-20;Cafe;-100\n';
  const base = { url: 'https://example.com/budget.csv', accountId: '00000000-0000-4000-8000-000000000071', plan: { index: 0, columns: { date: 0, concept: 1, amount: 2 }, dateOrder: 'ymd', decimal: '.', sign: 'signed', currency: 'EUR', year: null, answered: [] } };
  const approved = () => ({ ...base, approval: createSheetApproval(base, parseDelimited(csv), { confirmed: true }) });
  it.each(['replace', 'mutate', 'remove', 'version', 'binding'])('withholds when approval changes during download: %s', async change => {
    const feed = approved();
    const deps = { parseDelimited, toSightings, planQuestions, ingestSightings: vi.fn(), fetchText: async () => {
      const newApproval = createSheetApproval(base, parseDelimited(changed), { confirmed: true });
      if (change === 'replace') feed.approval = newApproval;
      if (change === 'mutate') feed.approval.schema = newApproval.schema;
      if (change === 'remove') delete feed.approval;
      if (change === 'version') feed.approval.version = 2;
      if (change === 'binding') feed.approval.binding = 'different';
      return ['replace', 'mutate', 'remove'].includes(change) ? changed : csv;
    } };
    expect(await readSheetFeed(feed, deps)).toMatchObject({ ok: false, reason: 'approval_required' });
    expect(deps.ingestSightings).not.toHaveBeenCalled();
  });
  it('allows replacement with the same approved fields', async () => {
    const feed = approved();
    const deps = { parseDelimited, toSightings, planQuestions, ingestSightings: vi.fn().mockResolvedValue({created: 1}), fetchText: async () => { feed.approval = { ...feed.approval }; return csv; } };
    expect(await readSheetFeed(feed, deps)).toMatchObject({ ok: true });
  });
});
