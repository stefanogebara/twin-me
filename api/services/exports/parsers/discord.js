/**
 * Discord GDPR export parser.
 *
 * Discord exports come as a zip with this top-level structure (Dec 2024 format):
 *
 *   account/
 *     user.json                 user profile
 *   messages/
 *     index.json                map of channel_id -> friendly channel name
 *     c{channel_id}/
 *       channel.json            { id, type, recipients?, guild? }
 *       messages.csv            ID,Timestamp,Contents,Attachments
 *   servers/
 *     index.json                map of guild_id -> guild name
 *     {guild_id}/
 *       guild.json
 *   activity/  (large, mostly analytics events — we skip)
 *
 * We extract per-server message volume (the strongest community-engagement
 * signal), channel-type distribution (DM vs guild vs group), hourly
 * histogram (chronotype), total messages, active days, and top 10 most-
 * active channels.
 *
 * Privacy: we NEVER read or surface message Contents. Only timestamps and
 * counts cross the boundary.
 */

import { findEntry, listEntriesUnder, readEntryJson, bump, topN, safeDate } from '../zipHelpers.js';

export async function detectDiscordExport(zip) {
  // Strong signal: account/user.json + messages/index.json both present.
  return Boolean(
    findEntry(zip, (n) => n === 'account/user.json' || n.endsWith('/account/user.json')) &&
      findEntry(zip, (n) => n === 'messages/index.json' || n.endsWith('/messages/index.json'))
  );
}

// CSV is tiny per-channel (one line per message). A naive split-by-newline
// parser would break on multi-line Contents fields — but we only want the
// Timestamp column (col index 1), so we can grab it line-by-line with a
// regex that matches a leading "id,ISO-timestamp," prefix.
const TIMESTAMP_RE = /^(\d+),"?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+\d{2}:\d{2})"?,/;

function parseMessagesCsv(csvText) {
  const timestamps = [];
  // Skip the header row.
  const lines = csvText.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const m = TIMESTAMP_RE.exec(lines[i]);
    if (m) timestamps.push(m[2]);
  }
  return timestamps;
}

export async function parseDiscordExport(zip) {
  const user = readEntryJson(zip, (n) => n.endsWith('account/user.json'));
  const messagesIndex = readEntryJson(zip, (n) => n.endsWith('messages/index.json')) ?? {};
  const serversIndex = readEntryJson(zip, (n) => n.endsWith('servers/index.json')) ?? {};

  const channelEntries = listEntriesUnder(zip, 'messages/');
  // Group by channel: each channel has channel.json + messages.csv living
  // alongside each other in messages/c{channel_id}/.
  const byChannel = new Map();
  for (const entry of channelEntries) {
    const m = /messages\/(c[0-9]+)\/(channel\.json|messages\.csv)$/.exec(entry.entryName);
    if (!m) continue;
    const cid = m[1];
    if (!byChannel.has(cid)) byChannel.set(cid, {});
    if (m[2] === 'channel.json') {
      try {
        byChannel.get(cid).meta = JSON.parse(zip.readAsText(entry, 'utf8'));
      } catch {
        byChannel.get(cid).meta = null;
      }
    } else {
      byChannel.get(cid).csv = zip.readAsText(entry, 'utf8');
    }
  }

  let totalMessages = 0;
  const hourlyHistogram = new Array(24).fill(0);
  const channelTypes = {};       // 'DM' | 'GroupDM' | 'Guild' | 'Unknown'
  const messagesPerGuild = {};   // guild_id -> count
  const messagesPerChannel = {}; // channel display name -> count
  const activeDays = new Set();

  for (const [cid, channel] of byChannel.entries()) {
    if (!channel.csv) continue;
    const timestamps = parseMessagesCsv(channel.csv);
    if (timestamps.length === 0) continue;

    totalMessages += timestamps.length;

    const meta = channel.meta ?? {};
    // Discord channel type: 0=GuildText, 1=DM, 3=GroupDM, others
    const t = meta.type;
    let label = 'Unknown';
    if (t === 1) label = 'DM';
    else if (t === 3) label = 'GroupDM';
    else if (t === 0 || t === 2 || t === 5) label = 'Guild';
    bump(channelTypes, label, timestamps.length);

    const guildId = meta.guild?.id;
    if (guildId) bump(messagesPerGuild, guildId, timestamps.length);

    const channelDisplayName =
      messagesIndex[cid.slice(1)] ?? meta.name ?? cid;
    bump(messagesPerChannel, channelDisplayName, timestamps.length);

    for (const ts of timestamps) {
      const d = safeDate(ts);
      if (!d) continue;
      hourlyHistogram[d.getUTCHours()] += 1;
      activeDays.add(d.toISOString().slice(0, 10));
    }
  }

  const guildEntries = listEntriesUnder(zip, 'servers/');
  const guildNames = {};
  for (const entry of guildEntries) {
    const m = /servers\/(\d+)\/guild\.json$/.exec(entry.entryName);
    if (!m) continue;
    try {
      const g = JSON.parse(zip.readAsText(entry, 'utf8'));
      if (g?.name) guildNames[m[1]] = g.name;
    } catch {
      // ignore malformed
    }
  }
  // Names also live in servers/index.json — prefer that if richer.
  for (const [gid, name] of Object.entries(serversIndex)) {
    if (!guildNames[gid] && typeof name === 'string') guildNames[gid] = name;
  }

  const topServers = topN(messagesPerGuild, 10, 'guild_id').map((r) => ({
    server: guildNames[r.guild_id] ?? r.guild_id,
    messages: r.count,
  }));

  const topChannels = topN(messagesPerChannel, 10, 'channel').map((r) => ({
    channel: r.channel,
    messages: r.count,
  }));

  // Hourly histogram -> dominant period.
  const periodTotals = { night: 0, morning: 0, afternoon: 0, evening: 0 };
  for (let h = 0; h < 24; h++) {
    const n = hourlyHistogram[h];
    if (h < 6) periodTotals.night += n;
    else if (h < 12) periodTotals.morning += n;
    else if (h < 18) periodTotals.afternoon += n;
    else periodTotals.evening += n;
  }
  const dominantPeriod = Object.entries(periodTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';

  const aggregates = {
    identity: {
      username: user?.username ?? null,
      discriminator: user?.discriminator ?? null,
      created_at: user?.created_at ?? null,
    },
    totals: {
      messages: totalMessages,
      channels_with_activity: Array.from(byChannel.values()).filter(
        (c) => c.csv && parseMessagesCsv(c.csv).length > 0
      ).length,
      guilds_with_activity: Object.keys(messagesPerGuild).length,
      active_days: activeDays.size,
    },
    channel_type_breakdown: channelTypes,
    top_servers: topServers,
    top_channels: topChannels,
    hourly_histogram: hourlyHistogram,
    dominant_period: dominantPeriod,
  };

  const observations = buildDiscordObservations(aggregates);

  return { aggregates, observations };
}

function buildDiscordObservations(a) {
  const out = [];
  if (a.totals.messages > 0) {
    out.push(
      `Discord history: ${a.totals.messages} messages across ${a.totals.guilds_with_activity} servers and ${a.totals.channels_with_activity} channels (${a.totals.active_days} active days). Communication style: predominantly ${a.dominant_period}.`
    );
  }
  if (a.top_servers.length > 0) {
    const named = a.top_servers
      .slice(0, 5)
      .map((s) => `${s.server} (${s.messages})`)
      .join(', ');
    out.push(`Most active Discord communities: ${named}.`);
  }
  if (a.channel_type_breakdown) {
    const ct = a.channel_type_breakdown;
    const dms = (ct.DM ?? 0) + (ct.GroupDM ?? 0);
    const guilds = ct.Guild ?? 0;
    if (dms + guilds > 0) {
      const ratio = dms / Math.max(1, dms + guilds);
      const style =
        ratio > 0.6 ? 'one-on-one and group DMs' : ratio < 0.2 ? 'public server channels' : 'mixed DMs and servers';
      out.push(`Discord behavior: leans toward ${style} (${dms} DM, ${guilds} server messages).`);
    }
  }
  return out;
}
