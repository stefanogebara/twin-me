/**
 * The temporal spine — OptMem's telescoping cover, in time units.
 *
 * Phase 2 established that staleness is a CANDIDATE-SELECTION problem: retrieval
 * picks its pool by vector distance alone, so for "what have I been doing this
 * week?" it returned 30 conversations none younger than 49 days while 889
 * platform rows from the last 7 days sat unretrieved. No ranking weight can fix
 * that. The spine is the answer: context selected by TIME, never by similarity.
 *
 * The load-bearing property is that the context stays constant-sized however
 * long the history gets — detail fades with age instead of the prompt growing.
 *
 * Adaptation from OptMem: it addresses blocks by log position (#0, #1, ...),
 * which is only sound for a strictly append-only log. Ours is mutable — the
 * forgetting cron archives, supersession retires, the Phase 0 backfill deleted
 * 4,626 rows — and every such change would renumber every block. Blocks are
 * therefore addressed by ALIGNED POWER-OF-2 DAY RANGES in absolute day-index
 * space, so a node's identity never shifts no matter what happens to the rows
 * inside it.
 */
import { describe, it, expect } from 'vitest';
import {
  dayIndex,
  dayIndexToMs,
  coverBlocks,
  blockLabel,
  DEFAULT_SPINE_BUDGET,
} from '../../../api/services/memoryTimelineService.js';

const DAY = 86_400_000;

describe('dayIndex', () => {
  it('maps a timestamp to a stable absolute day number', () => {
    expect(dayIndex(0)).toBe(0);
    expect(dayIndex(DAY)).toBe(1);
    expect(dayIndex(DAY * 3 + 1000)).toBe(3);
  });

  it('accepts Date and ISO string', () => {
    const iso = '2026-07-28T12:00:00.000Z';
    expect(dayIndex(iso)).toBe(dayIndex(new Date(iso)));
  });
});

describe('coverBlocks — the telescoping tiling', () => {
  const now = 20_000; // arbitrary day index

  it('gives the most recent days at full daily detail', () => {
    const blocks = coverBlocks(now, now - 60, 16);
    const newest = blocks[blocks.length - 1];
    expect(newest.size).toBe(1);
    expect(newest.end).toBeGreaterThan(now - 1);
  });

  it('coarsens monotonically as it goes back in time', () => {
    const blocks = coverBlocks(now, now - 2000, 16);
    // Walking oldest -> newest, block size must never increase.
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].size).toBeLessThanOrEqual(blocks[i - 1].size);
    }
    expect(blocks[0].size).toBeGreaterThan(blocks[blocks.length - 1].size);
  });

  it('stays within the line budget no matter how long the history is', () => {
    // This is the whole point: 20,000 memories cost the same context as 500.
    for (const days of [10, 100, 1_000, 10_000, 100_000]) {
      const blocks = coverBlocks(now, now - days, 16);
      expect(blocks.length).toBeLessThanOrEqual(16);
    }
  });

  it('produces contiguous, non-overlapping blocks', () => {
    const blocks = coverBlocks(now, now - 500, 16);
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].start).toBe(blocks[i - 1].end);
    }
  });

  it('covers the whole requested range', () => {
    const oldest = now - 500;
    const blocks = coverBlocks(now, oldest, 16);
    expect(blocks[0].start).toBeLessThanOrEqual(oldest);
    expect(blocks[blocks.length - 1].end).toBeGreaterThan(now);
  });

  it('uses only aligned power-of-2 blocks, so node identity never shifts', () => {
    // Alignment is what makes a node addressable forever: block (size=8,
    // start=2467816) always denotes the same 8 calendar days, whatever happens
    // to the memories inside it.
    const blocks = coverBlocks(now, now - 3000, 16);
    for (const b of blocks) {
      expect(Number.isInteger(Math.log2(b.size))).toBe(true);
      expect(b.start % b.size).toBe(0);
      expect(b.end - b.start).toBe(b.size);
    }
  });

  it('is stable under history growth for the recent end', () => {
    // Extending the past must not disturb how today is represented, otherwise
    // every node would need rebuilding as history accumulates.
    const short = coverBlocks(now, now - 100, 16);
    const long = coverBlocks(now, now - 5000, 16);
    expect(short[short.length - 1]).toEqual(long[long.length - 1]);
  });

  it('handles a single-day history', () => {
    const blocks = coverBlocks(now, now, 16);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(blocks.length).toBeLessThanOrEqual(16);
    expect(blocks[blocks.length - 1].end).toBeGreaterThan(now);
  });

  it('handles a budget of 1', () => {
    const blocks = coverBlocks(now, now - 1000, 1);
    expect(blocks.length).toBe(1);
  });

  it('returns empty when the range is inverted rather than looping forever', () => {
    expect(coverBlocks(now, now + 10, 16)).toEqual([]);
  });

  it('exposes a sane default budget', () => {
    expect(DEFAULT_SPINE_BUDGET).toBeGreaterThan(4);
    expect(DEFAULT_SPINE_BUDGET).toBeLessThanOrEqual(32);
  });
});

describe('blockLabel — how a block is described to the model', () => {
  const now = 20_000;

  it('labels a single recent day relatively', () => {
    expect(blockLabel({ start: now, end: now + 1, size: 1 }, now)).toBe('today');
    expect(blockLabel({ start: now - 1, end: now, size: 1 }, now)).toBe('yesterday');
  });

  it('labels a multi-day block with its span and age', () => {
    const label = blockLabel({ start: now - 8, end: now - 4, size: 4 }, now);
    expect(label).toMatch(/4 days/);
    expect(label).toMatch(/ago/);
  });

  it('scales the unit for long spans', () => {
    expect(blockLabel({ start: now - 512, end: now - 256, size: 256 }, now)).toMatch(/months|years/);
  });
});

describe('timezone — day boundaries follow the user, not UTC', () => {
  // The spine labels blocks "today" / "yesterday". With UTC day boundaries a
  // user at UTC-3 has their whole evening labelled "yesterday" from 21:00 local
  // onward, because 21:00 in Sao Paulo is already 00:00 UTC the next day. For a
  // feature whose entire purpose is that an old line cannot read as current,
  // getting "today" wrong for three hours out of every twenty-four undercuts it,
  // and it splits one evening's memories across two leaves.
  const SP = 'America/Sao_Paulo';

  it('keeps a late Sao Paulo evening on the same local day', () => {
    // 2026-07-28 22:00 in Sao Paulo == 2026-07-29 01:00 UTC.
    const evening = Date.UTC(2026, 6, 29, 1, 0);
    const noon = Date.UTC(2026, 6, 28, 15, 0);   // same local day, 12:00 local
    expect(dayIndex(evening, SP)).toBe(dayIndex(noon, SP));
    // Without the timezone they land on different days — the bug.
    expect(dayIndex(evening)).not.toBe(dayIndex(noon));
  });

  it('still separates genuinely different local days', () => {
    const lateMon = Date.UTC(2026, 6, 29, 1, 0);    // Tue 28th 22:00 local
    const earlyTue = Date.UTC(2026, 6, 29, 12, 0);  // Wed 29th 09:00 local
    expect(dayIndex(earlyTue, SP) - dayIndex(lateMon, SP)).toBe(1);
  });

  it('round-trips a day index back to the local midnight that starts it', () => {
    const d = dayIndex(Date.UTC(2026, 6, 29, 1, 0), SP);
    const startMs = dayIndexToMs(d, SP);
    // That instant must still be the same local day, and be local midnight.
    expect(dayIndex(startMs, SP)).toBe(d);
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: SP, hour: 'numeric', hour12: false })
      .format(new Date(startMs));
    expect(parseInt(hour, 10)).toBe(0);
  });

  it('handles a zone ahead of UTC', () => {
    const tokyo = 'Asia/Tokyo';                      // UTC+9
    // 2026-07-28 08:00 Tokyo == 2026-07-27 23:00 UTC — UTC says the 27th.
    const morning = Date.UTC(2026, 6, 27, 23, 0);
    const evening = Date.UTC(2026, 6, 28, 11, 0);    // 20:00 same local day
    expect(dayIndex(morning, tokyo)).toBe(dayIndex(evening, tokyo));
  });

  it('falls back to UTC for a missing or invalid zone rather than throwing', () => {
    const ms = Date.UTC(2026, 6, 29, 1, 0);
    expect(dayIndex(ms, undefined)).toBe(Math.floor(ms / 86_400_000));
    expect(dayIndex(ms, 'Not/AZone')).toBe(Math.floor(ms / 86_400_000));
    expect(() => dayIndexToMs(20_000, 'Not/AZone')).not.toThrow();
  });
});
