/**
 * Tests for whoop/pagination.js — ported from
 * shashankswe2020-ux/whoop-mcp tests/api/pagination.test.ts (MIT).
 *
 * Error-propagation tests use a plain Error subclass instead of the
 * upstream WhoopApiError — we don't ship that wrapper, errors come from
 * whatever transport the caller plugs in.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAllPages } from '../../../../api/services/whoop/pagination.js';

function createMockClient(responses) {
  const getMock = vi.fn();
  responses.forEach((response) => {
    getMock.mockResolvedValueOnce(response);
  });
  return { client: { get: getMock }, getMock };
}

function makeRecords(start, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: start + i,
    value: `record-${start + i}`,
  }));
}

class FakeApiError extends Error {
  constructor(status) {
    super(`api error ${status}`);
    this.name = 'FakeApiError';
    this.status = status;
  }
}

describe('fetchAllPages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns records from a single page with no next_token', async () => {
    const records = makeRecords(1, 5);
    const { client } = createMockClient([{ records }]);
    const result = await fetchAllPages(client, '/v2/recovery');
    expect(result.records).toEqual(records);
    expect(result.truncated).toBe(false);
  });

  it('returns empty result for empty first page', async () => {
    const { client } = createMockClient([{ records: [] }]);
    const result = await fetchAllPages(client, '/v2/recovery');
    expect(result.records).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('follows next_token across multiple pages', async () => {
    const page1 = makeRecords(1, 5);
    const page2 = makeRecords(6, 5);
    const page3 = makeRecords(11, 3);
    const { client, getMock } = createMockClient([
      { records: page1, next_token: 'token_2' },
      { records: page2, next_token: 'token_3' },
      { records: page3 },
    ]);
    const result = await fetchAllPages(client, '/v2/recovery', { interPageDelayMs: 0 });
    expect(result.records).toEqual([...page1, ...page2, ...page3]);
    expect(result.truncated).toBe(false);
    expect(getMock).toHaveBeenCalledTimes(3);
  });

  it('passes next_token as query parameter', async () => {
    const { client, getMock } = createMockClient([
      { records: makeRecords(1, 5), next_token: 'abc123' },
      { records: makeRecords(6, 3) },
    ]);
    await fetchAllPages(client, '/v2/recovery', { interPageDelayMs: 0 });
    expect(getMock).toHaveBeenCalledWith('/v2/recovery?nextToken=abc123');
  });

  it('preserves existing query parameters when appending nextToken', async () => {
    const { client, getMock } = createMockClient([
      { records: makeRecords(1, 5), next_token: 'abc123' },
      { records: makeRecords(6, 3) },
    ]);
    await fetchAllPages(client, '/v2/recovery?start=2026-01-01&limit=25', {
      interPageDelayMs: 0,
    });
    expect(getMock).toHaveBeenNthCalledWith(1, '/v2/recovery?start=2026-01-01&limit=25');
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      '/v2/recovery?start=2026-01-01&limit=25&nextToken=abc123',
    );
  });

  it('stops when maxRecords is reached and returns truncated=true', async () => {
    const { client, getMock } = createMockClient([
      { records: makeRecords(1, 10), next_token: 'token_2' },
      { records: makeRecords(11, 10), next_token: 'token_3' },
    ]);
    const result = await fetchAllPages(client, '/v2/recovery', {
      maxRecords: 15,
      interPageDelayMs: 0,
    });
    expect(result.records).toHaveLength(15);
    expect(result.truncated).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('stops fetching more pages once maxRecords reached from first page', async () => {
    const { client, getMock } = createMockClient([
      { records: makeRecords(1, 20), next_token: 'token_2' },
    ]);
    const result = await fetchAllPages(client, '/v2/recovery', {
      maxRecords: 10,
      interPageDelayMs: 0,
    });
    expect(result.records).toHaveLength(10);
    expect(result.truncated).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('defaults maxRecords to 100', async () => {
    const responses = [];
    for (let i = 0; i < 11; i++) {
      responses.push({
        records: makeRecords(i * 10 + 1, 10),
        next_token: i < 10 ? `token_${i + 2}` : undefined,
      });
    }
    const { client } = createMockClient(responses);
    const result = await fetchAllPages(client, '/v2/recovery', { interPageDelayMs: 0 });
    expect(result.records).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  it('caps maxRecords at ABSOLUTE_MAX_RECORDS (500)', async () => {
    const responses = [];
    for (let i = 0; i < 21; i++) {
      responses.push({
        records: makeRecords(i * 25 + 1, 25),
        next_token: i < 20 ? `token_${i + 2}` : undefined,
      });
    }
    const { client } = createMockClient(responses);
    const result = await fetchAllPages(client, '/v2/recovery', {
      maxRecords: 1000,
      interPageDelayMs: 0,
    });
    expect(result.records.length).toBeLessThanOrEqual(500);
    expect(result.truncated).toBe(true);
  });

  it('stops after maxPages and returns truncated=true', async () => {
    const responses = [];
    for (let i = 0; i < 5; i++) {
      responses.push({ records: makeRecords(i * 5 + 1, 5), next_token: `token_${i + 2}` });
    }
    const { client, getMock } = createMockClient(responses);
    const result = await fetchAllPages(client, '/v2/recovery', {
      maxPages: 3,
      maxRecords: 500,
      interPageDelayMs: 0,
    });
    expect(getMock).toHaveBeenCalledTimes(3);
    expect(result.records).toHaveLength(15);
    expect(result.truncated).toBe(true);
  });

  it('defaults maxPages to 20', async () => {
    const responses = [];
    for (let i = 0; i < 25; i++) {
      responses.push({ records: makeRecords(i * 3 + 1, 3), next_token: `token_${i + 2}` });
    }
    const { client, getMock } = createMockClient(responses);
    const result = await fetchAllPages(client, '/v2/recovery', {
      maxRecords: 500,
      interPageDelayMs: 0,
    });
    expect(getMock).toHaveBeenCalledTimes(20);
    expect(result.truncated).toBe(true);
  });

  it('inserts inter-page delay between fetches', async () => {
    const { client, getMock } = createMockClient([
      { records: makeRecords(1, 5), next_token: 'token_2' },
      { records: makeRecords(6, 5) },
    ]);
    const promise = fetchAllPages(client, '/v2/recovery', { interPageDelayMs: 200 });
    await vi.advanceTimersByTimeAsync(0);
    expect(getMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(getMock).toHaveBeenCalledTimes(2);
    const result = await promise;
    expect(result.records).toHaveLength(10);
  });

  it('defaults interPageDelayMs to 200', async () => {
    const { client, getMock } = createMockClient([
      { records: makeRecords(1, 5), next_token: 'token_2' },
      { records: makeRecords(6, 5) },
    ]);
    const promise = fetchAllPages(client, '/v2/recovery');
    await vi.advanceTimersByTimeAsync(0);
    expect(getMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(199);
    expect(getMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getMock).toHaveBeenCalledTimes(2);
    await promise;
  });

  it('stops mid-pagination when AbortSignal is aborted', async () => {
    const controller = new AbortController();
    const getMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        controller.abort();
        return { records: makeRecords(1, 5), next_token: 'token_2' };
      })
      .mockResolvedValueOnce({ records: makeRecords(6, 5), next_token: 'token_3' })
      .mockResolvedValueOnce({ records: makeRecords(11, 5) });
    const client = { get: getMock };
    const result = await fetchAllPages(client, '/v2/recovery', {
      signal: controller.signal,
      interPageDelayMs: 0,
    });
    expect(result.records).toHaveLength(5);
    expect(result.truncated).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('returns truncated=true when aborted before all pages fetched', async () => {
    const controller = new AbortController();
    controller.abort();
    const { client, getMock } = createMockClient([
      { records: makeRecords(1, 5), next_token: 'token_2' },
    ]);
    const result = await fetchAllPages(client, '/v2/recovery', {
      signal: controller.signal,
      interPageDelayMs: 0,
    });
    expect(result.records).toHaveLength(5);
    expect(result.truncated).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('propagates client errors', async () => {
    const getMock = vi.fn().mockRejectedValue(new FakeApiError(500));
    const client = { get: getMock };
    await expect(fetchAllPages(client, '/v2/recovery')).rejects.toThrow(FakeApiError);
  });

  it('propagates errors from mid-pagination failures', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ records: makeRecords(1, 5), next_token: 'token_2' })
      .mockRejectedValueOnce(new FakeApiError(500));
    const client = { get: getMock };
    await expect(
      fetchAllPages(client, '/v2/recovery', { interPageDelayMs: 0 }),
    ).rejects.toThrow(FakeApiError);
  });

  it.each([
    ['/v2/activity/sleep'],
    ['/v2/activity/workout'],
    ['/v2/cycle'],
  ])('works with %s endpoint path', async (endpoint) => {
    const { client, getMock } = createMockClient([{ records: makeRecords(1, 3) }]);
    await fetchAllPages(client, endpoint);
    expect(getMock).toHaveBeenCalledWith(endpoint);
  });
});
