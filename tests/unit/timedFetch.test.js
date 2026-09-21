/** Every Supabase request has a deadline: a call that gets no answer fails in seconds. */
import { describe, expect, it } from 'vitest';
import { timedFetch, supabaseTimeoutMs, DEFAULT_SUPABASE_TIMEOUT_MS } from '../../api/config/timedFetch.js';

const hangs = (input, init) => new Promise((_, reject) => { init.signal.addEventListener('abort', () => reject(init.signal.reason)); });
const answers = async () => new Response('ok');

describe('timedFetch', () => {
  it('rejects a call that never answers once the deadline passes', async () => {
    await expect(timedFetch(30, hangs)('https://db.example/rest/v1/x')).rejects.toMatchObject({ name: 'TimeoutError' });
  });
  it('lets an answered call through and honours the caller\'s own signal', async () => {
    expect(await (await timedFetch(1000, answers)('https://db.example/x')).text()).toBe('ok');
    const own = new AbortController();
    const p = timedFetch(10_000, hangs)('https://db.example/x', { signal: own.signal });
    own.abort(new Error('mine'));
    await expect(p).rejects.toMatchObject({ message: 'mine' });
  });
  it('reads the deadline from the environment, 25 s by default', () => {
    expect(supabaseTimeoutMs({})).toBe(DEFAULT_SUPABASE_TIMEOUT_MS);
    expect(supabaseTimeoutMs({ SUPABASE_REQUEST_TIMEOUT_MS: '8000' })).toBe(8000);
    expect(supabaseTimeoutMs({ SUPABASE_REQUEST_TIMEOUT_MS: 'no' })).toBe(DEFAULT_SUPABASE_TIMEOUT_MS);
  });
});
