/**
 * Chat-side glue for Discord GDPR export. Detects "what discord servers
 * am I in", "discord activity", "top discord communities" etc., formats
 * the persisted aggregates as a single directive line, and writes a
 * reflection memory per day.
 */

import { makeExportRun, makeExportLearn } from '../chatAdapter.js';

const NOUNS = [/\bdiscord\b/i, /\bserver(s)?\b/i, /\bguild(s)?\b/i, /\bDMs?\b/i];

const PHRASES = [
  /\b(my )?(discord) (activity|history|usage|stats?|breakdown|patterns?|servers?|communities?)\b/i,
  /\b(top|most active) (discord )?(servers?|guilds?|communities)\b/i,
  /\bwhat (discord )?(servers?|guilds?|communities) (am I in|do I (use|chat in))\b/i,
  /\bam I (a )?(discord )?(lurker|chatter|active)\b/i,
  /\bhow many (discord )?(messages|servers)/i,
  /\b(my )?(discord )?(chronotype|when I chat|when do I message)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

export function detectDiscordExportIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };
  if (any(PHRASES, text) && any(NOUNS, text)) return { kind: 'export' };
  if (any(PHRASES, text)) return { kind: 'export' };
  return { kind: null };
}

export function formatDiscordExport(a) {
  if (!a || !a.totals) return null;
  const t = a.totals;
  const parts = [];

  if (t.messages > 0) {
    parts.push(
      `Discord activity from data export: ${t.messages} total messages across ${t.guilds_with_activity} servers, ${t.channels_with_activity} channels, ${t.active_days} active days. Predominantly ${a.dominant_period} hours.`
    );
  }

  if ((a.top_servers ?? []).length > 0) {
    const named = a.top_servers
      .slice(0, 5)
      .map((s) => `${s.server} (${s.messages})`)
      .join(', ');
    parts.push(`Top servers by messages: ${named}.`);
  }

  if (a.channel_type_breakdown) {
    const dms = (a.channel_type_breakdown.DM ?? 0) + (a.channel_type_breakdown.GroupDM ?? 0);
    const guilds = a.channel_type_breakdown.Guild ?? 0;
    if (dms + guilds > 0) {
      parts.push(`${dms} DM, ${guilds} server-channel messages.`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

export const discordExportRun = makeExportRun({
  platform: 'discord_export',
  formatAggregates: formatDiscordExport,
});

export const discordExportLearn = makeExportLearn({
  platform: 'discord_export',
  sourceKey: 'discord_export',
});
