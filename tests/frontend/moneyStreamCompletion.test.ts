import { expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../../src/services/api/apiBase', () => ({ authFetch: f.fetch, getAuthHeaders: () => ({}), getAccessToken: () => 'tok', sessionExpected: () => false, accessTokenReady: async () => 'tok', API_URL: '/api' }));
import { moneyChat } from '../../src/services/api/moneyAPI';

it.each([
  ['data: {"phase":"text","delta":"Half an answer"}\n\n', false],
  ['data: {"phase":"failed","detail":"Unavailable"}\n\n', false],
  ['data: {"phase":"text","delta":"Ready"}\n\ndata: {"phase":"done"}\n\n', true],
])('requires an explicit done event, rather than a closed HTTP 200 response', async (body, expected) => {
  f.fetch.mockResolvedValue(new Response(body));
  const ok = await new Promise(resolve => moneyChat.stream('hello', [], { onEvent: () => {}, onEnd: resolve }));
  expect(ok).toBe(expected);
});
