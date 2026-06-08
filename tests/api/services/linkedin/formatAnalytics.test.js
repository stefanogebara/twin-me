import { describe, it, expect } from 'vitest';
import { formatLinkedInSnapshot } from '../../../../api/services/linkedin/formatAnalytics.js';

describe('formatLinkedInSnapshot', () => {
  const baseExtension = {
    totals: {
      feed_dwell_seconds: 60 * 47,
      profile_dwell_seconds: 60 * 8,
      profile_views: 12,
      searches: 4,
      reactions: 9,
      connect_clicks: 2,
      share_clicks: 0,
    },
    top_searches: [
      { query: 'machine learning engineer', count: 2 },
      { query: 'embedded systems', count: 1 },
    ],
    reaction_breakdown: { like: 7, celebrate: 2 },
  };

  it('returns null on empty', () => {
    expect(formatLinkedInSnapshot(null)).toBeNull();
    expect(formatLinkedInSnapshot({})).toBeNull();
  });

  it('renders profile identity when present', () => {
    const out = formatLinkedInSnapshot({
      profile: { name: 'Stefano Gebara', headline: 'Builder', industry: 'Tech' },
      extension: null,
      window_days: 14,
    });
    expect(out).toContain('Stefano Gebara');
    expect(out).toContain('"Builder"');
    expect(out).toContain('Tech');
  });

  it('renders engagement totals and searches', () => {
    const out = formatLinkedInSnapshot({
      profile: { headline: 'Builder' },
      extension: baseExtension,
      window_days: 14,
    });
    expect(out).toContain('47m on feed');
    expect(out).toContain('12 profile views');
    expect(out).toContain('9 reactions');
    expect(out).toContain('"machine learning engineer"');
    expect(out).toContain('like 7');
  });

  it('omits sections cleanly when extension is empty', () => {
    const out = formatLinkedInSnapshot({
      profile: { headline: 'Builder' },
      extension: {
        totals: {
          feed_dwell_seconds: 0,
          profile_dwell_seconds: 0,
          profile_views: 0,
          searches: 0,
          reactions: 0,
          connect_clicks: 0,
          share_clicks: 0,
        },
        top_searches: [],
        reaction_breakdown: {},
      },
      window_days: 14,
    });
    expect(out).toContain('"Builder"');
    expect(out).not.toContain('on feed');
    expect(out).not.toContain('reactions');
  });
});
