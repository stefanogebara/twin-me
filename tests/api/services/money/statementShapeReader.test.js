/**
 * The model says which column is which, and nothing else gets through.
 * Its reply is untrusted input: a column index past the end of a row would read undefined out
 * of every line for the whole file, quietly, and an invented field would be ignored anyway.
 */
import { describe, it, expect, vi } from 'vitest';
import { shapePrompt, planFromReply, readShape, SHAPE_SYSTEM } from '../../../../api/_app/services/money/statements/shapeReader.js';

const sheet = [
  ['Mi presupuesto'],
  ['Día', 'Gasto', 'Cuánto'],
  ['03/04', 'Mercadona', '23,40'],
];
const good = '{"index":1,"columns":{"date":0,"concept":1,"amount":2},"dateOrder":"dmy","decimal":",","sign":"all_out"}';

describe('shapePrompt', () => {
  it('sends the size and the first rows, with every cell numbered', () => {
    const p = shapePrompt(sheet);
    expect(p).toContain('3 rows and 3 columns');
    expect(p).toContain('[0] Día');
    expect(p).toContain('[2] Cuánto');
  });

  it('sends a sample, never the whole file', () => {
    const big = [sheet[1], ...Array.from({ length: 900 }, (_, i) => [`0${(i % 9) + 1}/04`, `Shop ${i}`, '1,00'])];
    const p = shapePrompt(big, { sample: 5 });
    expect(p).toContain('901 rows');
    expect(p).not.toContain('Shop 400');
    expect(p.split('\n')).toHaveLength(6);
  });
});

describe('planFromReply', () => {
  it('reads the object', () => {
    expect(planFromReply(good, sheet)).toMatchObject({ index: 1, columns: { date: 0, concept: 1, amount: 2 }, sign: 'all_out' });
  });

  it('reads it out of a code fence or a sentence, because models add both', () => {
    expect(planFromReply('```json\n' + good + '\n```', sheet)).toMatchObject({ index: 1 });
    expect(planFromReply(`Sure! Here you go:\n${good}\nHope that helps.`, sheet)).toMatchObject({ index: 1 });
  });

  it('is null on anything that is not a plan', () => {
    expect(planFromReply('I cannot help with that.', sheet)).toBeNull();
    expect(planFromReply('{not json}', sheet)).toBeNull();
    expect(planFromReply('', sheet)).toBeNull();
    expect(planFromReply(null, sheet)).toBeNull();
  });

  it('is null when the model says these are not payments', () => {
    expect(planFromReply('{"index":-1,"columns":{}}', sheet)).toBeNull();
  });

  it('drops an index that would read past the end of every row', () => {
    const p = planFromReply('{"index":1,"columns":{"date":0,"amount":2,"currency":7}}', sheet);
    expect(p.columns.currency).toBeUndefined();
  });
});

describe('readShape', () => {
  it('asks once, at temperature zero, and marks the content sensitive', async () => {
    const complete = vi.fn().mockResolvedValue({ content: good });
    const plan = await readShape(sheet, { complete, userId: 'u1' });
    expect(plan).toMatchObject({ index: 1, sign: 'all_out' });
    expect(complete).toHaveBeenCalledTimes(1);
    const args = complete.mock.calls[0][0];
    expect(args.temperature).toBe(0);
    expect(args.sensitiveContent).toBe(true);
    expect(args.system).toBe(SHAPE_SYSTEM);
    expect(args.userId).toBe('u1');
  });

  it('is null when the model is unreachable, rather than throwing into the upload', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('gateway down'));
    await expect(readShape(sheet, { complete })).resolves.toBeNull();
  });

  it('is null with no model wired at all', async () => {
    await expect(readShape(sheet, {})).resolves.toBeNull();
  });
});
