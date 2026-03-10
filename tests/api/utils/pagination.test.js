/**
 * Tests for api/utils/pagination.js
 * Pure utility — no DB or LLM dependencies.
 */
import { describe, it, expect } from 'vitest';
import { parsePagination, buildPaginationMeta, applySupabaseRange } from '../../../api/utils/pagination.js';

describe('parsePagination', () => {
  function makeReq(query = {}) {
    return { query };
  }

  it('returns defaults when no query params provided', () => {
    const result = parsePagination(makeReq());
    expect(result).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('parses valid page and limit', () => {
    const result = parsePagination(makeReq({ page: '3', limit: '10' }));
    expect(result).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('clamps page to minimum 1', () => {
    const result = parsePagination(makeReq({ page: '0' }));
    expect(result.page).toBe(1);

    const result2 = parsePagination(makeReq({ page: '-5' }));
    expect(result2.page).toBe(1);
  });

  it('clamps limit to minimum 1 (or falls back to default for falsy)', () => {
    // parseInt('0') = 0, which is falsy → falls through to defaultLimit
    const result = parsePagination(makeReq({ limit: '0' }));
    expect(result.limit).toBe(20); // defaults because 0 || defaultLimit = defaultLimit

    // parseInt('-3') = -3, which is truthy → Math.max(1, -3) = 1
    const result2 = parsePagination(makeReq({ limit: '-3' }));
    expect(result2.limit).toBe(1);
  });

  it('clamps limit to maxLimit', () => {
    const result = parsePagination(makeReq({ limit: '100' }));
    expect(result.limit).toBe(50); // default maxLimit is 50
  });

  it('uses custom defaultLimit', () => {
    const result = parsePagination(makeReq(), { defaultLimit: 10 });
    expect(result.limit).toBe(10);
  });

  it('uses custom maxLimit', () => {
    const result = parsePagination(makeReq({ limit: '200' }), { maxLimit: 100 });
    expect(result.limit).toBe(100);
  });

  it('calculates offset correctly for various pages', () => {
    expect(parsePagination(makeReq({ page: '1', limit: '10' })).offset).toBe(0);
    expect(parsePagination(makeReq({ page: '2', limit: '10' })).offset).toBe(10);
    expect(parsePagination(makeReq({ page: '5', limit: '20' })).offset).toBe(80);
  });

  it('handles non-numeric strings gracefully', () => {
    const result = parsePagination(makeReq({ page: 'abc', limit: 'xyz' }));
    expect(result).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('handles float strings by truncating', () => {
    const result = parsePagination(makeReq({ page: '2.7', limit: '15.9' }));
    expect(result.page).toBe(2);
    expect(result.limit).toBe(15);
  });
});

describe('buildPaginationMeta', () => {
  it('builds correct metadata', () => {
    const meta = buildPaginationMeta(1, 20, 100);
    expect(meta).toEqual({ page: 1, limit: 20, total: 100, totalPages: 5 });
  });

  it('rounds up totalPages', () => {
    const meta = buildPaginationMeta(1, 20, 101);
    expect(meta.totalPages).toBe(6);
  });

  it('handles zero total', () => {
    const meta = buildPaginationMeta(1, 20, 0);
    expect(meta.totalPages).toBe(0);
  });

  it('handles single-page results', () => {
    const meta = buildPaginationMeta(1, 20, 5);
    expect(meta.totalPages).toBe(1);
  });

  it('preserves page and limit values exactly', () => {
    const meta = buildPaginationMeta(3, 15, 42);
    expect(meta.page).toBe(3);
    expect(meta.limit).toBe(15);
    expect(meta.total).toBe(42);
    expect(meta.totalPages).toBe(3);
  });
});

describe('applySupabaseRange', () => {
  it('calls .range() with correct from/to', () => {
    const rangeSpy = vi.fn().mockReturnValue('ranged-query');
    const query = { range: rangeSpy };
    const result = applySupabaseRange(query, { offset: 0, limit: 20 });
    expect(rangeSpy).toHaveBeenCalledWith(0, 19);
    expect(result).toBe('ranged-query');
  });

  it('handles offset correctly', () => {
    const rangeSpy = vi.fn().mockReturnValue('q');
    applySupabaseRange({ range: rangeSpy }, { offset: 40, limit: 20 });
    expect(rangeSpy).toHaveBeenCalledWith(40, 59);
  });

  it('handles limit of 1', () => {
    const rangeSpy = vi.fn().mockReturnValue('q');
    applySupabaseRange({ range: rangeSpy }, { offset: 0, limit: 1 });
    expect(rangeSpy).toHaveBeenCalledWith(0, 0);
  });
});
