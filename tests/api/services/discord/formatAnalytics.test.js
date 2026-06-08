import { describe, it, expect } from 'vitest';
import { formatDiscordSnapshot } from '../../../../api/services/discord/formatAnalytics.js';

describe('formatDiscordSnapshot', () => {
  const baseExtension = {
    totals: { messages_sent: 18, channel_visits: 30, dwell_seconds: 60 * 47 },
    top_servers: [
      { server_id: 'g1', name: 'Pog', dwell_minutes: 30, messages_sent: 12, score: 90 },
      { server_id: 'g2', name: 'Midjourney', dwell_minutes: 12, messages_sent: 4, score: 32 },
    ],
  };

  it('returns null on empty snapshot', () => {
    expect(formatDiscordSnapshot(null)).toBeNull();
    expect(formatDiscordSnapshot({})).toBeNull();
  });

  it('renders identity + guild count + names when OAuth data exists', () => {
    const out = formatDiscordSnapshot({
      identity: { username: 'sra.bencao' },
      guilds: [
        { guild_id: 'g1', name: 'Pog' },
        { guild_id: 'g2', name: 'Midjourney' },
        { guild_id: 'g3', name: 'Poker Now' },
      ],
      extension: { totals: { messages_sent: 0, channel_visits: 0, dwell_seconds: 0 }, top_servers: [] },
      window_days: 14,
    });
    expect(out).toContain('u/sra.bencao');
    expect(out).toContain('3 servers');
    expect(out).toContain('Pog');
    expect(out).toContain('Midjourney');
  });

  it('renders the behavior style line from extension activity', () => {
    const out = formatDiscordSnapshot({
      identity: { username: 'x' },
      guilds: [],
      extension: baseExtension,
      window_days: 14,
    });
    expect(out).toMatch(/light chatter|active participant/);
    expect(out).toContain('18 messages');
  });

  it('renders top active servers with their counts', () => {
    const out = formatDiscordSnapshot({
      identity: null,
      guilds: [],
      extension: baseExtension,
      window_days: 14,
    });
    expect(out).toContain('Pog (30m, 12 msgs)');
    expect(out).toContain('Midjourney (12m, 4 msgs)');
  });

  it('uses "pure lurker" classification when sends are 0 but dwell is non-zero', () => {
    const out = formatDiscordSnapshot({
      identity: { username: 'x' },
      guilds: [],
      extension: {
        totals: { messages_sent: 0, channel_visits: 5, dwell_seconds: 600 },
        top_servers: [],
      },
      window_days: 14,
    });
    expect(out).toContain('pure lurker');
  });
});
