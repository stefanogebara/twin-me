/**
 * Format a Discord snapshot into a single directive line.
 *
 * Pattern matches reddit/formatAnalytics.js: one-line summary with the
 * key counts the LLM should quote verbatim ("use these exact numbers
 * when answering").
 *
 * Three sections, joined with newlines: identity + guild list, top
 * active servers, behavior style. Sections are omitted when their
 * source is empty so the directive stays terse for low-data users.
 */

function describeStyle(extension) {
  if (!extension) return null;
  const sent = extension.totals.messages_sent;
  const dwell = extension.totals.dwell_seconds;
  if (sent === 0 && dwell === 0) return null;
  const dwellMin = Math.round(dwell / 60);
  if (sent === 0) return `pure lurker (${dwellMin}m of viewing, 0 messages sent)`;
  if (sent < 5) return `mostly lurker (${sent} messages, ${dwellMin}m of viewing)`;
  if (sent < 20) return `light chatter (${sent} messages, ${dwellMin}m of viewing)`;
  return `active participant (${sent} messages, ${dwellMin}m of viewing)`;
}

export function formatDiscordSnapshot(snapshot) {
  if (!snapshot) return null;
  const lines = [];

  if (snapshot.identity?.username || (snapshot.guilds?.length ?? 0) > 0) {
    const u = snapshot.identity?.username
      ? `u/${snapshot.identity.username}`
      : 'discord user';
    const guildCount = snapshot.guilds?.length ?? 0;
    const namedList = (snapshot.guilds ?? [])
      .slice(0, 8)
      .map((g) => g.name)
      .filter(Boolean)
      .join(', ');
    if (guildCount > 0) {
      lines.push(
        `Discord (${u}): in ${guildCount} servers${namedList ? ` — ${namedList}${guildCount > 8 ? '…' : ''}` : ''}.`
      );
    } else {
      lines.push(`Discord (${u}).`);
    }
  }

  const style = describeStyle(snapshot.extension);
  if (style) {
    lines.push(`Last ${snapshot.window_days}d behavior: ${style}.`);
  }

  if ((snapshot.extension?.top_servers ?? []).length > 0) {
    const named = snapshot.extension.top_servers
      .slice(0, 5)
      .map((s) => {
        const label = s.name ?? `server ${s.server_id}`;
        const parts = [];
        if (s.dwell_minutes > 0) parts.push(`${s.dwell_minutes}m`);
        if (s.messages_sent > 0) parts.push(`${s.messages_sent} msgs`);
        return `${label} (${parts.join(', ')})`;
      })
      .join('; ');
    lines.push(`Most active servers: ${named}.`);
  }

  if (lines.length === 0) return null;
  return lines.join(' ');
}
