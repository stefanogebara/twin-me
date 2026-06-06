import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { detectDiscordExport, parseDiscordExport } from '../../../../api/services/exports/parsers/discord.js';
import { buildDiscordZip } from './fixtures.js';
import { detectDiscordExportIntent, formatDiscordExport } from '../../../../api/services/exports/chat/discord.js';

describe('discord export parser', () => {
  const zip = new AdmZip(buildDiscordZip());

  it('detects discord zip', async () => {
    expect(await detectDiscordExport(zip)).toBe(true);
  });

  it('parses message counts and channel types', async () => {
    const { aggregates } = await parseDiscordExport(zip);
    expect(aggregates.identity.username).toBe('stefano');
    expect(aggregates.totals.messages).toBe(6); // 3 + 1 + 2
    expect(aggregates.totals.guilds_with_activity).toBe(1);
    expect(aggregates.totals.channels_with_activity).toBe(3);
    expect(aggregates.channel_type_breakdown.Guild).toBe(4);
    expect(aggregates.channel_type_breakdown.DM).toBe(2);
  });

  it('ranks servers by message volume', async () => {
    const { aggregates } = await parseDiscordExport(zip);
    expect(aggregates.top_servers[0].server).toBe('Best Server');
    expect(aggregates.top_servers[0].messages).toBe(4);
  });

  it('produces natural-language observations', async () => {
    const { observations } = await parseDiscordExport(zip);
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.join(' ')).toMatch(/Discord/);
    expect(observations.join(' ')).toMatch(/Best Server/);
  });
});

describe('discord export chat glue', () => {
  it('detects intent on common phrasings', () => {
    expect(detectDiscordExportIntent('what are my top discord servers').kind).toBe('export');
    expect(detectDiscordExportIntent('my discord activity').kind).toBe('export');
    expect(detectDiscordExportIntent('am I a discord lurker').kind).toBe('export');
    expect(detectDiscordExportIntent('what did I eat for lunch').kind).toBe(null);
  });

  it('formats aggregates into a directive line', () => {
    const aggregates = {
      identity: { username: 'x' },
      totals: { messages: 100, guilds_with_activity: 3, channels_with_activity: 10, active_days: 30 },
      channel_type_breakdown: { DM: 10, Guild: 90 },
      top_servers: [{ server: 'Foo', messages: 50 }, { server: 'Bar', messages: 30 }],
      dominant_period: 'evening',
    };
    const out = formatDiscordExport(aggregates);
    expect(out).toContain('100 total messages');
    expect(out).toContain('Foo (50)');
    expect(out).toContain('evening');
  });

  it('returns null on empty aggregates', () => {
    expect(formatDiscordExport(null)).toBeNull();
    expect(formatDiscordExport({})).toBeNull();
  });
});
