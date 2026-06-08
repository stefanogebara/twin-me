import { describe, it, expect } from 'vitest';
import { detectDiscordIntent } from '../../../../api/services/discord/detectIntent.js';

describe('detectDiscordIntent', () => {
  it('returns null for empty / unrelated', () => {
    expect(detectDiscordIntent('').kind).toBeNull();
    expect(detectDiscordIntent('what did i eat for lunch').kind).toBeNull();
  });

  it('detects activity on top-servers question', () => {
    expect(detectDiscordIntent('what are my top discord servers').kind).toBe('activity');
    expect(detectDiscordIntent('most active discord communities lately').kind).toBe('activity');
  });

  it('detects activity on lurker / chatter question', () => {
    expect(detectDiscordIntent('am I a discord lurker').kind).toBe('activity');
    expect(detectDiscordIntent('am I a chatter on discord').kind).toBe('activity');
  });

  it('detects activity on message-count + chronotype questions', () => {
    expect(detectDiscordIntent('how many discord messages did I send').kind).toBe('activity');
    expect(detectDiscordIntent('my discord chronotype').kind).toBe('activity');
  });

  it('falls back to snapshot when a noun matches but no activity phrase', () => {
    expect(detectDiscordIntent('what server is poker now').kind).toBe('snapshot');
    expect(detectDiscordIntent('list my discord guilds').kind).toBe('snapshot');
  });
});
