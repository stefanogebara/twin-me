/**
 * Tests for whoop/client.js. The client is a thin axios wrapper — we
 * verify the contract callers depend on (headers, base URL, timeout,
 * response unwrap) using a mocked axios.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

import axios from 'axios';
import { createWhoopClient } from '../../../../api/services/whoop/client.js';

describe('createWhoopClient', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  it('throws when accessToken is missing', () => {
    expect(() => createWhoopClient({})).toThrow(/accessToken is required/);
    expect(() => createWhoopClient({ accessToken: '' })).toThrow(/accessToken is required/);
  });

  it('issues a GET to the Whoop v2 base URL with bearer token + timeout', async () => {
    axios.get.mockResolvedValueOnce({ data: { records: [{ id: 1 }] } });
    const client = createWhoopClient({ accessToken: 'tok-123' });

    const result = await client.get('/v2/recovery?limit=5');

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.prod.whoop.com/developer/v2/recovery?limit=5',
      {
        headers: { Authorization: 'Bearer tok-123' },
        timeout: 8000,
      },
    );
    expect(result).toEqual({ records: [{ id: 1 }] });
  });

  it('honours a custom timeout', async () => {
    axios.get.mockResolvedValueOnce({ data: {} });
    const client = createWhoopClient({ accessToken: 'tok', timeoutMs: 1500 });
    await client.get('/v2/cycle');
    expect(axios.get.mock.calls[0][1].timeout).toBe(1500);
  });

  it('honours a custom baseUrl (for tests / proxies)', async () => {
    axios.get.mockResolvedValueOnce({ data: {} });
    const client = createWhoopClient({ accessToken: 'tok', baseUrl: 'http://mock.local' });
    await client.get('/v2/recovery');
    expect(axios.get.mock.calls[0][0]).toBe('http://mock.local/v2/recovery');
  });

  it('propagates axios errors', async () => {
    axios.get.mockRejectedValueOnce(new Error('boom'));
    const client = createWhoopClient({ accessToken: 'tok' });
    await expect(client.get('/v2/recovery')).rejects.toThrow('boom');
  });
});
