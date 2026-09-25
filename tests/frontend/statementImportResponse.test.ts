// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const changed = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/api/moneyChanges', () => ({ moneyChanged: changed }));
import { moneyAPI } from '../../src/services/api/moneyAPI';

const file = new File(['When;What;How much\n2026-09-20;Dinner;25'], 'budget.csv');
const needs = { plan: { index: 0, columns: { date: 0, amount: 2 } }, questions: [{ id: 'sign', asks: 'Which direction?', choices: [{ value: 'all_out', label: 'Money out' }] }], preview: [], read: 1, skipped: 0, reviewRequired: true };
function response(data: unknown) { return new Response(JSON.stringify({ success: true, data }), { status: 200 }); }
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('returns clarification without broadcasting a ledger change', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ needs })));
  const result = await moneyAPI.importStatement(file, 'acc');
  expect(result).toMatchObject({ kind: 'needs', needs });
  expect(changed).not.toHaveBeenCalled();
});

it('resubmits the same file/account with explicit answers and only then reports an import', async () => {
  const fetch = vi.fn(async () => response({ read: 1, created: 1, attached: 0, skipped: 0 }));
  vi.stubGlobal('fetch', fetch);
  const result = await moneyAPI.importStatement(file, 'acc', { plan: needs.plan, answers: { sign: 'all_out' }, confirm: true });
  const form = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
  expect(form.get('file')).toBe(file); expect(form.get('accountId')).toBe('acc');
  expect(JSON.parse(form.get('plan') as string)).toEqual(needs.plan);
  expect(JSON.parse(form.get('answers') as string)).toEqual({ sign: 'all_out' });
  expect(form.get('confirm')).toBe('true');
  expect(result).toMatchObject({ kind: 'imported', read: 1 });
  expect(changed).toHaveBeenCalledOnce();
});

it.each([{}, { needs: {} }, { needs: null, read: 1, created: 1, attached: 0, skipped: 0 }, { needs: { ...needs, questions: [{ id: 'unknown', choices: [] }] } }, { read: 1, created: -1, attached: 0, skipped: 0 }])('does not report malformed success as an import: %j', async data => {
  vi.stubGlobal('fetch', vi.fn(async () => response(data)));
  await expect(moneyAPI.importStatement(file, 'acc')).rejects.toThrow();
  expect(changed).not.toHaveBeenCalled();
});
