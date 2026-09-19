/**
 * What her page learns when it asks for the call: the call, a dead link, or a
 * channel that did not answer this time. The last two used to look the same to
 * her ("Este link não está mais ativo") when the voice provider merely timed out.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCallConfig } from '../../src/services/api/presenceAPI';

const reply = (status: number, body: unknown) =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchCallConfig', () => {
  it('returns the call when the channel answers', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true, call: { presence_id: 'p-1', cared_for_name: 'Sofia' } }));
    expect(await fetchCallConfig('tok')).toEqual({ call: { presence_id: 'p-1', cared_for_name: 'Sofia' } });
  });

  it('says the link is gone when the server does not know it', async () => {
    vi.stubGlobal('fetch', reply(404, { success: false, error: 'Not found' }));
    expect(await fetchCallConfig('tok')).toEqual({ error: 'gone' });
  });

  it('says the channel is unavailable, not that the link is dead, when the server fails', async () => {
    vi.stubGlobal('fetch', reply(502, { success: false, error: 'The voice channel did not answer' }));
    expect(await fetchCallConfig('tok')).toEqual({ error: 'unavailable' });
    vi.stubGlobal('fetch', reply(500, { success: false }));
    expect(await fetchCallConfig('tok')).toEqual({ error: 'unavailable' });
    vi.stubGlobal('fetch', reply(503, { success: false }));
    expect(await fetchCallConfig('tok')).toEqual({ error: 'unavailable' });
  });

  it('treats a network failure as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await fetchCallConfig('tok')).toEqual({ error: 'unavailable' });
  });
});
