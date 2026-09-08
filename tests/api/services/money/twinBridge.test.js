/**
 * The bridge turns a finding into something the twin can retrieve, and never invents
 * a number of its own.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const addMemory = vi.fn();
vi.mock('../../../../api/services/memoryStreamService.js', () => ({ addMemory: (...a) => addMemory(...a) }));
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {} }) }));

const { memoryFor, tellTwin, IMPORTANCE } = await import('../../../../api/services/money/twinBridge.js');

const finding = {
  kind: 'subscriptions',
  month: null,
  sentence: '5 charges come back every month, 114,12 € together.',
  detail: 'Higgsfield, Elevenlabs.io, Fly.io and 2 more.',
  numbers: { count: 5, monthly_total: 114.12 },
  receipts: [{ id: 'a', merchant_raw: 'Spotify' }, { id: 'b', merchant_raw: 'Fly.io' }],
  evidence_count: 15,
};

describe('memoryFor', () => {
  it('writes the sentence, the detail and the payments behind it', () => {
    const m = memoryFor(finding);
    expect(m.content).toBe('Money: 5 charges come back every month, 114,12 € together. Higgsfield, Elevenlabs.io, Fly.io and 2 more. The payments behind it: Spotify, Fly.io.');
    expect(m.memoryType).toBe('fact');
    expect(m.importance).toBe(IMPORTANCE.subscriptions);
    expect(m.metadata).toMatchObject({ source: 'money', domain: 'money', finding_kind: 'subscriptions', receipt_ids: ['a', 'b'], evidence_count: 15 });
  });

  it('carries the numbers so a claim can be checked, not re-derived', () => {
    expect(memoryFor(finding).metadata.numbers).toEqual({ count: 5, monthly_total: 114.12 });
  });

  it('holds nothing without a sentence', () => {
    expect(memoryFor({ kind: 'x' })).toBe(null);
    expect(memoryFor(null)).toBe(null);
  });

  it('reads without receipts when a finding has none', () => {
    const m = memoryFor({ ...finding, receipts: [] });
    expect(m.content.endsWith('and 2 more.')).toBe(true);
  });
});

describe('tellTwin', () => {
  beforeEach(() => { addMemory.mockReset(); addMemory.mockResolvedValue({ id: 'm1' }); });

  it('writes one memory per finding, with importance given and never rated', async () => {
    const result = await tellTwin('user-1', [finding, { ...finding, kind: 'month_pace', sentence: 'By the 8th you had spent 414,64 €.' }]);
    expect(result.written).toBe(2);
    expect(addMemory).toHaveBeenCalledTimes(2);
    const [, content, type, metadata, options] = addMemory.mock.calls[0];
    expect(content.startsWith('Money: ')).toBe(true);
    expect(type).toBe('fact');
    expect(metadata.domain).toBe('money');
    expect(options).toEqual({ skipImportance: true, importanceScore: IMPORTANCE.subscriptions });
  });

  it('keeps going when one write fails', async () => {
    addMemory.mockRejectedValueOnce(new Error('embedding down')).mockResolvedValue({ id: 'm2' });
    const result = await tellTwin('user-1', [finding, { ...finding, kind: 'biggest_line' }]);
    expect(result.written).toBe(1);
  });

  it('writes nothing without a user or findings', async () => {
    expect(await tellTwin(null, [finding])).toEqual({ written: 0 });
    expect(await tellTwin('user-1', [])).toEqual({ written: 0 });
    expect(addMemory).not.toHaveBeenCalled();
  });
});
