import { describe, it, expect } from 'vitest';
import { formatRedditActivity } from '../../../../api/services/reddit/formatAnalytics.js';

describe('formatRedditActivity', () => {
  const base = {
    identity: { username: 'stefanog', total_karma: 1832 },
    subscriptions: {
      count: 47,
      list: ['programming', 'webdev', 'startups', 'MachineLearning', 'philosophy', 'AskHistorians', 'soccer', 'brasil'],
    },
    activity_split: { comments: 18, submissions: 3, ratio: 0.17 },
    top_active_subs: [
      { subreddit: 'startups', comments: 8, submissions: 1, total: 9 },
      { subreddit: 'MachineLearning', comments: 5, submissions: 1, total: 6 },
      { subreddit: 'webdev', comments: 3, submissions: 1, total: 4 },
    ],
    karma: {
      top_subs: [
        { subreddit: 'AskHistorians', comment_karma: 245, link_karma: 0 },
        { subreddit: 'startups', comment_karma: 120, link_karma: 35 },
      ],
    },
    posting_cadence: { active_days: 7, window_days: 30, posts_per_day: 0.7 },
  };

  it('returns null for null', () => expect(formatRedditActivity(null)).toBeNull());

  it('renders identity + subscription line', () => {
    const out = formatRedditActivity(base);
    expect(out).toContain('u/stefanog');
    expect(out).toContain('1832 total karma');
    expect(out).toContain('47 subreddits');
    expect(out).toContain('r/programming');
    expect(out).toContain('r/MachineLearning');
  });

  it('classifies the activity style (heavy engager when ratio < 0.1 or commenter-dominant)', () => {
    const out = formatRedditActivity({
      ...base,
      activity_split: { comments: 50, submissions: 1, ratio: 0.02 },
    });
    expect(out).toMatch(/heavy engager|engager/i);
  });

  it('classifies submitter-only when no comments', () => {
    const out = formatRedditActivity({
      ...base,
      activity_split: { comments: 0, submissions: 8, ratio: null },
    });
    expect(out).toContain('submitter only');
  });

  it('classifies commenter-only when no submissions', () => {
    const out = formatRedditActivity({
      ...base,
      activity_split: { comments: 12, submissions: 0, ratio: 0 },
    });
    expect(out).toContain('commenter only');
  });

  it('classifies lurker when no activity at all', () => {
    const out = formatRedditActivity({
      ...base,
      activity_split: { comments: 0, submissions: 0, ratio: null },
      top_active_subs: [],
      karma: { top_subs: [] },
    });
    expect(out).toContain('lurker');
  });

  it('renders top active subs as posts count', () => {
    const out = formatRedditActivity(base);
    expect(out).toContain('r/startups (9 posts)');
    expect(out).toContain('r/MachineLearning (6 posts)');
  });

  it('renders karma line', () => {
    const out = formatRedditActivity(base);
    expect(out).toContain('r/AskHistorians: 245 karma');
    expect(out).toContain('r/startups: 155 karma');
  });

  it('renders cadence line', () => {
    const out = formatRedditActivity(base);
    expect(out).toContain('cadence ~0.7 posts/day');
    expect(out).toContain('7 active days');
  });
});
