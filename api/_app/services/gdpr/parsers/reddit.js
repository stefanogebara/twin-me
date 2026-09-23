/**
 * GDPR parser: Reddit.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

// ---------------------------------------------------------------------------
// Reddit parser
// ---------------------------------------------------------------------------

function parseReddit(buffer) {
  let raw;
  try {
    raw = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Invalid Reddit JSON export');
  }

  // Reddit exports can be flat or nested under a top-level key
  const data = raw.data || raw;

  const comments = Array.isArray(data.comments) ? data.comments : [];
  const posts = Array.isArray(data.posts) ? data.posts : [];
  const saved = Array.isArray(data.saved_posts) ? data.saved_posts
    : Array.isArray(data.saved) ? data.saved : [];

  const subredditCounts = {};

  const countSub = (item) => {
    const sub = item.subreddit || item.data?.subreddit;
    if (sub) {
      const s = String(sub).replace(/^r\//, '').slice(0, 40);
      subredditCounts[s] = (subredditCounts[s] || 0) + 1;
    }
  };

  for (const c of comments) countSub(c);
  for (const p of posts) countSub(p);

  const summaryObs = [];

  const topSubs = Object.entries(subredditCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (topSubs.length > 0) {
    const topList = topSubs.slice(0, 4).map(([s, c]) => `r/${s} (${c})`).join(', ');
    summaryObs.push(`Most active Reddit communities: ${topList}`);
  }

  if (comments.length > 0) {
    summaryObs.push(`Made ${comments.length.toLocaleString()} Reddit comments across history`);
  }

  if (posts.length > 0) {
    summaryObs.push(`Submitted ${posts.length.toLocaleString()} Reddit posts`);
  }

  if (saved.length > 0) {
    summaryObs.push(`Saved ${saved.length.toLocaleString()} Reddit posts`);
  }

  // Topic inference from top subs
  const techSubs = ['programming', 'webdev', 'javascript', 'python', 'learnprogramming',
    'MachineLearning', 'technology', 'cscareerquestions', 'compsci', 'devops'];
  const techCount = topSubs.filter(([s]) => techSubs.some(t => t.toLowerCase() === s.toLowerCase())).length;
  if (techCount >= 2) {
    summaryObs.push('Strong Reddit presence in technology and programming communities');
  }

  return summaryObs;
}

export { parseReddit };
