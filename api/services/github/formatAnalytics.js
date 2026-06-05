/**
 * One-line formatter for GitHub recent activity. Directive framing
 * matches Whoop / Spotify / Calendar.
 */

/**
 * @param {object} activity  Output of analytics/getRecentActivity.js
 * @returns {string|null}
 */
export function formatRecentActivity(activity) {
  if (!activity || !activity.totals) return null;
  const days = activity.period?.days ?? '?';
  const t = activity.totals;
  if (t.events === 0) {
    return `GitHub over the last ${days} days: 0 public events.`;
  }

  const typeLine = (activity.by_type ?? [])
    .map((b) => `${b.type} ×${b.count}`)
    .join(', ');
  const repoLine = (activity.top_repos ?? [])
    .map((r) => `${r.repo} (${r.events} events, ${r.commits} commits)`)
    .join(', ');
  const langLine = (activity.top_languages ?? [])
    .map((l) => `${l.language} (${l.count} repo${l.count === 1 ? '' : 's'})`)
    .join(', ');
  const dayLine = (activity.by_day ?? [])
    .map((d) => `${d.day} ${d.count}`)
    .join(', ');

  const parts = [
    `GitHub over the last ${days} days: ${t.events} public events across ${t.repos_touched} repos, ${t.commits} commits.`,
    typeLine && `Event types: ${typeLine}.`,
    repoLine && `Top repos: ${repoLine}.`,
    langLine && `Top languages: ${langLine}.`,
    dayLine && `By day: ${dayLine}.`,
  ].filter(Boolean);

  return parts.join(' ');
}
