/**
 * One-line formatter for YouTube recent watching.
 */

export function formatRecentWatching(watching) {
  if (!watching || !watching.totals) return null;
  const { totals, top_channels, top_topics, list } = watching;
  if (totals.liked_videos === 0) {
    return 'YouTube recent: 0 liked videos in your library.';
  }
  const channelLine = (top_channels ?? [])
    .map((c) => `${c.channel} ×${c.count}`)
    .join(', ');
  const topicLine = (top_topics ?? [])
    .map((t) => t.topic)
    .join(', ');
  const recentList = (list ?? [])
    .slice(0, 5)
    .map((v) => `"${v.title}" (${v.channel})`)
    .join(' | ');

  const parts = [
    `YouTube recent: ${totals.liked_videos} liked videos across ${totals.unique_channels} channels.`,
    channelLine && `Top channels: ${channelLine}.`,
    topicLine && `Topics: ${topicLine}.`,
    recentList && `Most recently liked: ${recentList}.`,
  ].filter(Boolean);
  return parts.join(' ');
}
