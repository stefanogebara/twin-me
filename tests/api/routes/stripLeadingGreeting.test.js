/**
 * Tests for stripLeadingGreeting (api/routes/cron-morning-briefing.js).
 *
 * audit-2026-06-10: briefing sections sometimes open with their own greeting,
 * doubling up with the prepended one ("Good morning, Stefano. Morning
 * Stefano. ..."). The strip must remove real greetings WITHOUT eating
 * legitimate sentences that merely start with a time-of-day word
 * ("Morning meetings dominate your week.").
 */
import { describe, it, expect } from 'vitest';
import { stripLeadingGreeting } from '../../../api/routes/cron-morning-briefing.js';

describe('stripLeadingGreeting', () => {
  describe('strips real greetings', () => {
    it('no-comma greeting with capitalized name (the observed prod bug)', () => {
      expect(stripLeadingGreeting('Morning Stefano. Your email backlog has grown by five.'))
        .toBe('Your email backlog has grown by five.');
    });

    it('full greeting with comma and name', () => {
      expect(stripLeadingGreeting('Good morning, Stefano. Busy day ahead.'))
        .toBe('Busy day ahead.');
    });

    it('lowercase good-greeting', () => {
      expect(stripLeadingGreeting('good afternoon, stefano. Two meetings left.'))
        .toBe('Two meetings left.');
    });

    it('bare greeting with exclamation', () => {
      expect(stripLeadingGreeting('Evening! Time to wind down.'))
        .toBe('Time to wind down.');
    });

    it('greeting word alone followed by a period', () => {
      expect(stripLeadingGreeting('Morning. Your calendar is clear.'))
        .toBe('Your calendar is clear.');
    });
  });

  describe('preserves legitimate content (reviewer false-positive cases)', () => {
    it('sentence starting with "Morning" as an adjective', () => {
      const s = 'Morning meetings dominate your week.';
      expect(stripLeadingGreeting(s)).toBe(s);
    });

    it('sentence starting with "Afternoon" as a noun phrase', () => {
      const s = 'Afternoon light is your best focus window.';
      expect(stripLeadingGreeting(s)).toBe(s);
    });

    it('sentence starting with "Evening" routine content', () => {
      const s = 'Evening wind-down starts at 10pm.';
      expect(stripLeadingGreeting(s)).toBe(s);
    });

    it('comma form followed by content (not a name then end of clause)', () => {
      const s = 'Morning, your schedule is packed today.';
      expect(stripLeadingGreeting(s)).toBe(s);
    });

    it('content with no greeting word at all', () => {
      const s = 'You have three meetings and 40k unread emails.';
      expect(stripLeadingGreeting(s)).toBe(s);
    });
  });

  describe('input safety', () => {
    it('passes through non-strings untouched', () => {
      expect(stripLeadingGreeting(null)).toBeNull();
      expect(stripLeadingGreeting(undefined)).toBeUndefined();
      expect(stripLeadingGreeting(42)).toBe(42);
    });

    it('empty string stays empty', () => {
      expect(stripLeadingGreeting('')).toBe('');
    });
  });
});
