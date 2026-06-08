/**
 * Format a LinkedIn snapshot into a single directive line.
 *
 * Three sections: profile identity, engagement totals, search topics.
 * Sections omitted when their source is empty so the directive stays
 * terse for low-data users.
 */

export function formatLinkedInSnapshot(snapshot) {
  if (!snapshot) return null;
  const lines = [];

  const p = snapshot.profile;
  if (p && (p.headline || p.name)) {
    const bits = [];
    if (p.name) bits.push(p.name);
    if (p.headline) bits.push(`"${p.headline}"`);
    if (p.industry) bits.push(p.industry);
    lines.push(`LinkedIn profile: ${bits.join(' — ')}.`);
  }

  const ext = snapshot.extension;
  if (ext) {
    const t = ext.totals;
    const feedMin = Math.round(t.feed_dwell_seconds / 60);
    const profileMin = Math.round(t.profile_dwell_seconds / 60);
    const parts = [];
    if (feedMin > 0) parts.push(`${feedMin}m on feed`);
    if (profileMin > 0) parts.push(`${profileMin}m on profiles`);
    if (t.profile_views > 0) parts.push(`${t.profile_views} profile views`);
    if (t.reactions > 0) parts.push(`${t.reactions} reactions`);
    if (t.connect_clicks > 0) parts.push(`${t.connect_clicks} connection requests`);
    if (t.share_clicks > 0) parts.push(`${t.share_clicks} posts/shares started`);
    if (parts.length > 0) {
      lines.push(`Last ${snapshot.window_days}d on LinkedIn: ${parts.join(', ')}.`);
    }

    if ((ext.top_searches ?? []).length > 0) {
      const named = ext.top_searches.map((s) => `"${s.query}"`).join(', ');
      lines.push(`Top searches: ${named}.`);
    }

    const reactionEntries = Object.entries(ext.reaction_breakdown ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (reactionEntries.length > 0) {
      const named = reactionEntries.map(([k, v]) => `${k} ${v}`).join(', ');
      lines.push(`Reaction mix: ${named}.`);
    }
  }

  if (lines.length === 0) return null;
  return lines.join(' ');
}
