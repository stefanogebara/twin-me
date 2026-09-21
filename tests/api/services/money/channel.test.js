import { describe, it, expect } from 'vitest';
import { isMoneyChannelUser, moneyChannelUserIds, plainForChannel, cutAtSentence, renderReply, muteIntent, channelSay, CHANNEL_MAX_CHARS } from '../../../../api/services/money/channel.js';

describe('who is on the channel', () => {
  it('reads a comma-separated list and nothing else', () => {
    expect(moneyChannelUserIds(' a , b ,, ')).toEqual(['a', 'b']);
    expect(isMoneyChannelUser('a', 'a,b')).toBe(true);
    expect(isMoneyChannelUser('c', 'a,b')).toBe(false);
    expect(isMoneyChannelUser('a', '')).toBe(false);
    expect(isMoneyChannelUser('', 'a')).toBe(false);
  });
});

describe('a reply as a message', () => {
  it('drops markdown marks and keeps the words', () => {
    expect(plainForChannel('**Groceries** took `120,40 €`.\n\n\n\n# Next')).toBe('Groceries took 120,40 €.\n\nNext');
    expect(plainForChannel('See [the page](https://twinme.me/money).')).toBe('See the page.');
  });
  it('cuts at a sentence end, never mid-sentence when one is near', () => {
    const long = `${'One sentence here. '.repeat(100)}`;
    const cut = cutAtSentence(long, 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut.endsWith('.')).toBe(true);
    expect(cutAtSentence('Short.', 100)).toBe('Short.');
  });
  it('links to the page only when a figure was drawn', () => {
    expect(renderReply({ text: 'Hello.', figures: [] }, { appUrl: 'https://x.test/' })).toEqual({ text: 'Hello.', link: null });
    expect(renderReply({ text: 'Hello.', figures: [{ kind: 'months' }] }, { appUrl: 'https://x.test/' })).toEqual({ text: 'Hello.', link: 'https://x.test/money' });
    expect(renderReply({ text: 'x'.repeat(5000) }).text.length).toBeLessThanOrEqual(CHANNEL_MAX_CHARS);
  });
});

describe('stop and start', () => {
  it('reads a whole-message stop or start in three languages', () => {
    for (const w of ['stop', 'Stop.', 'PARA', 'parar', 'basta!']) expect(muteIntent(w)).toBe('mute');
    for (const w of ['start', 'volver', 'Voltar']) expect(muteIntent(w)).toBe('unmute');
    expect(muteIntent('para que sirve esto')).toBe(null);
    expect(muteIntent('how do I stop Netflix')).toBe(null);
  });
  it('says its few sentences in the person\'s language, English when unknown', () => {
    expect(channelSay('es', 'The morning line is off. Say start to bring it back.')).toMatch(/volver/);
    expect(channelSay('xx', 'That was already done.')).toBe('That was already done.');
  });
});
