/**
 * Reddit one-line formatter — same directive shape as the others.
 */

function describeActivityStyle(activity) {
  const c = activity?.comments ?? 0;
  const s = activity?.submissions ?? 0;
  const total = c + s;
  if (total === 0) return 'lurker (no recent posts or comments)';
  if (s === 0) return 'commenter only (no submissions)';
  if (c === 0) return 'submitter only (no comments)';
  if (activity.ratio != null && activity.ratio < 0.1) return 'heavy engager (mostly comments)';
  if (activity.ratio != null && activity.ratio > 1) return 'mostly poster';
  return 'mixed contributor';
}

export function formatRedditActivity(activity) {
  if (!activity) return null;
  const { identity, subscriptions, activity_split, top_active_subs, karma, posting_cadence } = activity;

  const subsLine = subscriptions?.count
    ? `subscribed to ${subscriptions.count} subreddits including ${(subscriptions.list ?? [])
        .slice(0, 8)
        .map((s) => `r/${s}`)
        .join(', ')}`
    : 'no subscribed subreddits';

  const splitLine = `${activity_split?.comments ?? 0} comments + ${activity_split?.submissions ?? 0} submissions in the recent window (${describeActivityStyle(activity_split)})`;

  const topActiveLine = (top_active_subs ?? [])
    .slice(0, 6)
    .map((s) => `r/${s.subreddit} (${s.total} ${s.total === 1 ? 'post' : 'posts'})`)
    .join(', ');

  const karmaLine = (karma?.top_subs ?? [])
    .slice(0, 4)
    .map((k) => `r/${k.subreddit}: ${k.comment_karma + k.link_karma} karma`)
    .join(', ');

  const cadenceLine =
    posting_cadence?.posts_per_day != null
      ? `cadence ~${posting_cadence.posts_per_day} posts/day across ${posting_cadence.active_days} active days`
      : null;

  const parts = [
    `Reddit (u/${identity?.username ?? '?'}, ${identity?.total_karma ?? '?'} total karma): ${subsLine}.`,
    `Activity: ${splitLine}.`,
    topActiveLine && `Most active in: ${topActiveLine}.`,
    karmaLine && `Top karma earned in: ${karmaLine}.`,
    cadenceLine && `Posting ${cadenceLine}.`,
  ].filter(Boolean);

  return parts.join(' ');
}
