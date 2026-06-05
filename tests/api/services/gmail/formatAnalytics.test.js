import { describe, it, expect } from 'vitest';
import { formatEmailBehavior } from '../../../../api/services/gmail/formatAnalytics.js';

describe('formatEmailBehavior', () => {
  const base = {
    period: { days: 30 },
    volume: { sent: 84, received: 312, sent_to_received_ratio: 0.27, active_days_sending: 25 },
    chronotype: {
      night_owl_pct: 35,
      early_bird_pct: 8,
      top_hours_utc: [
        { hour: 23, count: 14 },
        { hour: 1, count: 11 },
        { hour: 22, count: 9 },
      ],
    },
    top_recipients: [
      { email: 'jane@google.com', count: 18 },
      { email: 'team@startup.io', count: 9 },
    ],
    top_senders: [
      { email: 'larissa@x.com', count: 22 },
      { email: 'ben@x.com', count: 12 },
    ],
    labels: {
      custom_label_count: 4,
      top_labels: [{ name: 'Work', total: 412 }, { name: 'TwinMe', total: 89 }],
    },
  };

  it('returns null for null', () => expect(formatEmailBehavior(null)).toBeNull());
  it('handles 0-sent 0-received empty state', () =>
    expect(formatEmailBehavior({ period: { days: 7 }, volume: { sent: 0, received: 0 } })).toContain('0 sent, 0 received'));
  it('renders the volume + ratio line', () => {
    const out = formatEmailBehavior(base);
    expect(out).toContain('84 sent');
    expect(out).toContain('312 received');
    expect(out).toContain('ratio 0.27');
    expect(out).toContain('active 25/30 days');
  });
  it('renders chronotype + top hours', () => {
    const out = formatEmailBehavior(base);
    expect(out).toContain('Top send hours');
    expect(out).toContain('23:00×14');
    expect(out).toContain('night-owl: 35%');
  });
  it('renders top recipients + senders', () => {
    const out = formatEmailBehavior(base);
    expect(out).toContain('jane@google.com ×18');
    expect(out).toContain('larissa@x.com ×22');
  });
  it('renders the custom labels line', () => {
    const out = formatEmailBehavior(base);
    expect(out).toContain('Custom labels: 4');
    expect(out).toContain('Work, TwinMe');
  });
  it('renders inbox-is-unstructured note when zero custom labels', () => {
    const out = formatEmailBehavior({
      ...base,
      labels: { custom_label_count: 0, top_labels: [] },
    });
    expect(out).toContain('No custom labels — inbox is unstructured');
  });
});
