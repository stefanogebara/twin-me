import { beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => vi.resetModules());
const line = (text: string) => ({ id: text, text, who: 'twin' as const });

it('clears both conversations and derived figures when a session ends', async () => {
  const chat = await import('../src/screens/chatStore');
  const session = await import('../src/services/sessionEpoch');
  chat.setLines('ask', [line('A private payment')]);
  chat.setLines('onboarding', [line('A income')]);
  chat.rememberLikely(123);
  session.invalidateSession();
  expect(chat.readLines('ask')).toEqual([]);
  expect(chat.readLines('onboarding')).toEqual([]);
  expect(chat.recallLikely()).toBeNull();
});

it('rejects delayed writes and history reads belonging to the old session', async () => {
  const chat = await import('../src/screens/chatStore');
  const session = await import('../src/services/sessionEpoch');
  const oldEpoch = session.currentSessionEpoch();
  const old = chat.readLines('ask');
  session.invalidateSession();
  chat.setLines('ask', [line('B payment')]);
  chat.setLines('ask', [line('late A payment')], oldEpoch);
  chat.replaceUnchangedHistory(old, [line('A history')], oldEpoch);
  expect(chat.readLines('ask')).toEqual([line('B payment')]);
});

it('refreshes unchanged history but never overwrites an in-flight reply', async () => {
  const chat = await import('../src/screens/chatStore');
  const { currentSessionEpoch } = await import('../src/services/sessionEpoch');
  const epoch = currentSessionEpoch();
  const initial = chat.readLines('ask');
  chat.replaceUnchangedHistory(initial, [line('from web')], epoch);
  expect(chat.readLines('ask')).toEqual([line('from web')]);
  const beforeFetch = chat.readLines('ask');
  chat.setLines('ask', [...beforeFetch, { ...line('streaming'), pending: true }]);
  chat.replaceUnchangedHistory(beforeFetch, [line('stale history')], epoch);
  expect(chat.readLines('ask').at(-1)?.pending).toBe(true);
});
