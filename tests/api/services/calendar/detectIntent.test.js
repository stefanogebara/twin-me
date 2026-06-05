import { describe, it, expect } from 'vitest';
import { detectCalendarIntent } from '../../../../api/services/calendar/detectIntent.js';

describe('detectCalendarIntent', () => {
  it('returns null for empty', () => expect(detectCalendarIntent('').kind).toBeNull());
  it('matches "how many meetings this week" → breakdown', () =>
    expect(detectCalendarIntent('how many meetings this week').kind).toBe('breakdown'));
  it('matches "my schedule this week" → breakdown', () =>
    expect(detectCalendarIntent('what does my schedule this week look like').kind).toBe('breakdown'));
  it('matches "busiest day" → breakdown', () =>
    expect(detectCalendarIntent('what was my busiest day').kind).toBe('breakdown'));
  it('matches "meeting density" → breakdown', () =>
    expect(detectCalendarIntent('meeting density this week').kind).toBe('breakdown'));
  it('matches plain "calendar" → snapshot', () =>
    expect(detectCalendarIntent('check my calendar').kind).toBe('snapshot'));
  it('null for non-calendar question', () =>
    expect(detectCalendarIntent('what color is the sky').kind).toBeNull());
  it('is case insensitive', () =>
    expect(detectCalendarIntent('HOW MANY MEETINGS THIS WEEK').kind).toBe('breakdown'));
});
