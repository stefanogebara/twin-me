import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
const status=vi.hoisted(()=>vi.fn(async()=>({state:'clear',unresolvedCount:0,revision:1,financialRevision:1})));
vi.mock('../../../../api/_app/services/money/reconciliationService.js',()=>({getReconciliationStatus:status}));

vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: {} }));
vi.mock('../../../../api/_app/services/money/store.js', async (importOriginal) => {
  const { categoryOfPayment } = await importOriginal();
  return { categoryOfPayment, listOwnTransactions: vi.fn(), listPlaces: vi.fn(), userLanguage: vi.fn(), personProfileCached: vi.fn(), listFacts: vi.fn(async () => []) };
});

const { sheetRows, sheetFile, monthOf, monthSheet } = await import('../../../../api/_app/services/money/sheet.js');

const tx = [
  { id: 't1', occurred_at: '2026-09-07T10:00:00Z', amount: -116.76, currency: 'EUR', merchant_key: 'el corte ingles', merchant_raw: 'El Corte Ingles', channel: 'card' },
  { id: 't2', occurred_at: '2026-09-04T09:00:00Z', amount: -11.99, currency: 'EUR', merchant_key: 'spotify', merchant_raw: 'Spotify', channel: 'card' },
  { id: 't3', occurred_at: '2026-08-31T23:30:00Z', amount: -5, currency: 'EUR', merchant_key: 'late bar', merchant_raw: 'Late Bar', channel: 'card' },
  { id: 't4', occurred_at: '2026-09-02T13:00:00Z', amount: 15.15, currency: 'EUR', merchant_key: 'ana lopez', merchant_raw: 'Ana Lopez', channel: 'bizum' },
  { id: 't5', occurred_at: '2026-09-09T13:00:00Z', amount: -40, currency: 'USD', merchant_key: 'openai', merchant_raw: 'OpenAI', channel: 'card' },
];
const places = [{ merchant_key: 'el corte ingles', name: 'El Corte Ingles', category: 'clothing' }, { merchant_key: 'spotify', name: 'Spotify', category: 'software' }];
const recurring = [{ merchant_key: 'spotify' }];

describe('sheetRows', () => {
  it.each(['place', 'merchant_raw', 'merchant_key'])('masks card identifiers in the exported %s without changing stored data', (source) => {
    const label = 'Cafe TARJETA 4111111111111111';
    const row = Object.freeze({ ...tx[0], merchant_key: source === 'merchant_key' ? label : 'cafe', merchant_raw: source === 'merchant_raw' ? label : null });
    const namedPlaces = source === 'place' ? Object.freeze([Object.freeze({ merchant_key: 'cafe', name: label })]) : [];
    const table = sheetRows(Object.freeze([row]), { month: '2026-09', places: namedPlaces, zone: 'UTC' });
    const workbook = XLSX.read(sheetFile(table, '2026-09'), { type: 'buffer' });
    const cells = XLSX.utils.sheet_to_json(workbook.Sheets['2026-09'], { header: 1 });
    expect(cells[1][1]).toBe('Cafe TARJETA ****1111');
    expect(cells[1][3]).toBe(-116.76);
    expect(source === 'place' ? namedPlaces[0].name : row[source]).toBe(label);
  });

  it('is a row per payment of the month, oldest first, with the place, the kind, the channel and what comes back', () => {
    const { header, rows } = sheetRows(tx, { month: '2026-09', places, recurring, language: 'en', zone: 'Europe/Madrid' });
    expect(header).toEqual(['Day', 'Place', 'Kind', 'Amount', 'Currency', 'Channel', 'Comes back']);
    expect(rows.map((r) => r[0])).toEqual(['2026-09-01', '2026-09-02', '2026-09-04', '2026-09-07', '2026-09-09']);
    expect(rows[2]).toEqual(['2026-09-04', 'Spotify', 'software', -11.99, 'EUR', 'card', 'yes']);
    expect(rows[3]).toEqual(['2026-09-07', 'El Corte Ingles', 'clothing', -116.76, 'EUR', 'card', '']);
    expect(rows[1][2]).toBe('transfers');
    expect(rows[4][4]).toBe('USD');
  });
  it('places a late payment on the day where the person is, and leaves other months out', () => {
    const madrid = sheetRows(tx, { month: '2026-09', zone: 'Europe/Madrid' });
    expect(madrid.rows[0][1]).toBe('Late Bar');
    const utc = sheetRows(tx, { month: '2026-09', zone: 'UTC' });
    expect(utc.rows.map((r) => r[1])).not.toContain('Late Bar');
    expect(sheetRows(tx, { month: '2026-08', zone: 'UTC' }).rows.map((r) => r[1])).toEqual(['Late Bar']);
  });
  it('speaks the language of the account', () => {
    const { header, rows } = sheetRows(tx, { month: '2026-09', places, recurring, language: 'es', zone: 'UTC' });
    expect(header[0]).toBe('D\u00eda');
    expect(rows.find((r) => r[1] === 'Spotify').slice(2)).toEqual(['software', -11.99, 'EUR', 'tarjeta', 's\u00ed']);
    expect(rows.find((r) => r[1] === 'OpenAI')[2]).toBe('sin leer todav\u00eda');
  });
});

describe('sheetFile and monthOf', () => {
  it('writes a workbook whose one sheet is the month and whose cells are the rows', () => {
    const buffer = sheetFile(sheetRows(tx, { month: '2026-09', places, zone: 'UTC' }), '2026-09');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['2026-09']);
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets['2026-09'], { header: 1 });
    expect(aoa[0][0]).toBe('Day');
    expect(aoa.length).toBe(5);
  });
  it('takes a month named as YYYY-MM and otherwise the current one where the person is', () => {
    expect(monthOf('2026-08')).toBe('2026-08');
    expect(monthOf('August')).toBe(monthOf(null));
    expect(monthOf(null, new Date('2026-09-30T23:30:00Z'), 'Europe/Madrid')).toBe('2026-10');
  });
});

describe('monthSheet', () => {
  it('reads once and names the file after the month', async () => {
    const deps = {
      personProfileCached: async () => ({ timezone: 'Europe/Madrid' }),
      listOwnTransactions: async () => tx, listPlaces: async () => places, userLanguage: async () => 'pt-BR', recurringFor: async () => recurring, listFacts: async () => [],
    };
    const out = await monthSheet('u1', { month: '2026-09', deps });
    expect(out).toMatchObject({ month: '2026-09', rows: 5, filename: 'twinme-2026-09.xlsx' });
    const wb = XLSX.read(out.buffer, { type: 'buffer' });
    expect(XLSX.utils.sheet_to_json(wb.Sheets['2026-09'], { header: 1 })[0][0]).toBe('Dia');
  });
});

it('does not export a seemingly complete month while payment evidence is pending',async()=>{
 status.mockResolvedValueOnce({state:'pending',unresolvedCount:1,revision:1});
 const deps={personProfileCached:async()=>({timezone:'UTC'}),listOwnTransactions:async()=>tx,listPlaces:async()=>[],userLanguage:async()=> 'en',listFacts:async()=>[]};
 await expect(monthSheet('u1',{month:'2026-09',deps})).rejects.toMatchObject({code:'PAYMENT_REVIEW_REQUIRED'});
});
