import { describe, it, expect } from 'vitest';
import { generateSuggestionChips } from '../../src/components/chat/generateSuggestionChips';

describe('generateSuggestionChips', () => {
  it('falls back to time-of-day chips when no signals are present', () => {
    const chips = generateSuggestionChips({ hour: 9 }); // morning
    expect(chips).toHaveLength(3);
    expect(chips).toContain('Check my emails');
  });

  it('uses different fallback chips per time slot', () => {
    const morning = generateSuggestionChips({ hour: 9 });
    const evening = generateSuggestionChips({ hour: 20 });
    expect(morning).not.toEqual(evening);
  });

  it('promotes a high-urgency recovery insight to the top', () => {
    const chips = generateSuggestionChips({
      hour: 9,
      pendingInsights: [{ urgency: 'high', category: 'recovery', insight: 'You crashed last night' }],
    });
    expect(chips[0]).toBe('Why am I feeling low energy?');
  });

  it('surfaces a calendar-density chip when day is meeting-heavy', () => {
    const chips = generateSuggestionChips({
      hour: 9,
      calendarEvents: new Array(6).fill({ start: '2026-05-14T10:00:00Z' }),
    });
    expect(chips).toContain('How am I spending today?');
  });

  it('surfaces an email triage chip when recent emails are dense', () => {
    const chips = generateSuggestionChips({
      hour: 14,
      recentEmails: new Array(4).fill({ from: 'a@b.com', subject: 'test' }),
    });
    expect(chips).toContain('Any important emails I should reply to?');
  });

  it('prioritizes high-urgency insights ahead of calendar + email signals', () => {
    const chips = generateSuggestionChips({
      hour: 9,
      pendingInsights: [{ urgency: 'high', category: 'finance' }],
      calendarEvents: new Array(8).fill({}),
      recentEmails: new Array(5).fill({}),
    });
    expect(chips[0]).toBe('Walk me through my spending lately');
    expect(chips).toContain('How am I spending today?');
  });

  it('deduplicates if a signal-driven chip matches a fallback chip', () => {
    const chips = generateSuggestionChips({
      hour: 9,
      // Make sure the same chip would otherwise appear twice
      pendingInsights: [
        { urgency: 'high', category: 'music' },
        { urgency: 'high', category: 'music' },
      ],
    });
    const musicChips = chips.filter((c) => c === 'What does my music taste say about me right now?');
    expect(musicChips).toHaveLength(1);
  });

  it('returns at most `max` chips', () => {
    const chips = generateSuggestionChips({
      hour: 9,
      max: 2,
      pendingInsights: [
        { urgency: 'high', category: 'recovery' },
        { urgency: 'high', category: 'mood' },
        { urgency: 'high', category: 'focus' },
      ],
    });
    expect(chips).toHaveLength(2);
  });

  it('handles unknown insight categories with a generic probe', () => {
    const chips = generateSuggestionChips({
      hour: 9,
      pendingInsights: [{ urgency: 'high', category: 'astronomy' }],
    });
    expect(chips[0]).toBe('Tell me about the astronomy pattern you noticed');
  });

  it('still returns 3 chips when given empty arrays (no spurious chips)', () => {
    const chips = generateSuggestionChips({
      hour: 9,
      pendingInsights: [],
      calendarEvents: [],
      recentEmails: [],
    });
    expect(chips).toHaveLength(3);
  });
});
