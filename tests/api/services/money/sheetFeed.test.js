/**
 * A sheet somebody keeps updating.
 * ================================
 * Enable Banking is not open yet, and plenty of people already keep every cost and every
 * payday in a spreadsheet they touch most days. Uploading it once is the wrong shape for
 * that: the file is alive. A link, re-read on a schedule, is the right one, and it is the
 * shape the calendar already uses for a pasted Canvas or Blackboard address.
 *
 * Two things make it cheap. The statement importer's source_ref is content-addressed on the
 * day, the amount and the text, so re-reading the whole sheet every hour writes nothing for
 * a row that has not changed and one row for a row that has. And shape.js already knows how
 * to read a sheet nobody designed for us, so the plan is settled once and reused.
 *
 * A URL a server will fetch on a schedule is the dangerous part. These pin the guard.
 */
import { describe, it, expect, vi } from 'vitest';
import { isSheetUrl, normaliseSheetUrl, sheetKind, readSheetFeed, MAX_SHEET_BYTES } from '../../../../api/_app/services/money/statements/sheetFeed.js';

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

/**
 * Re-reading it. Nothing here diffs: every row goes through the ledger every time, and the
 * content-addressed source_ref means an unchanged row writes nothing while a row added since
 * opens one. That is the whole reason this can run on a schedule and cost nothing.
 */
describe('readSheetFeed', () => {
  const plan = { index: 0, columns: { date: 0, concept: 1, amount: 2 }, dateOrder: 'dmy', decimal: ',', sign: 'all_out', currency: 'EUR', year: 2026, answered: ['sign', 'year', 'currency', 'dateOrder'] };
  const feed = { url: 'https://docs.google.com/spreadsheets/d/abc/edit#gid=0', plan, accountId: 'acc-1' };
  const csv = 'Fecha;Gasto;Importe\n03/04;Mercadona;23,40\n';

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

  it('caps what it will download, because a budget is not four megabytes', async () => {
    const d = deps();
    await readSheetFeed(feed, d);
    expect(d.fetchText.mock.calls[0][1]).toMatchObject({ maxBytes: MAX_SHEET_BYTES });
  });
});
