/**
 * The greeting says the hour it is where the person is.
 *
 * Every hour before noon read as morning, so the twin said "Good Morning" at forty minutes
 * past midnight, and an unknown timezone was read as Sao Paulo in a product whose people are
 * in Spain -- four hours out, which moves a greeting across two of its names (2026-09-18).
 * The page has said it correctly all along (ChatEmptyState.getGreeting); this is the same
 * rule on the server.
 */
import { describe, expect, it } from 'vitest';
import { greetingFor, localHourIn } from '../../../api/_app/routes/morning-briefing.js';

describe('the greeting', () => {
  it('names the part of the day the way a person would', () => {
    expect(greetingFor(0)).toBe('Good Night');
    expect(greetingFor(4)).toBe('Good Night');
    expect(greetingFor(5)).toBe('Good Morning');
    expect(greetingFor(11)).toBe('Good Morning');
    expect(greetingFor(12)).toBe('Good Afternoon');
    expect(greetingFor(17)).toBe('Good Afternoon');
    expect(greetingFor(18)).toBe('Good Evening');
    expect(greetingFor(21)).toBe('Good Evening');
    expect(greetingFor(22)).toBe('Good Night');
  });

  it('reads the hour where the person is, and falls back to the ledger own zone', () => {
    const midnightUtc = new Date('2026-09-18T23:30:00Z');
    expect(localHourIn('Europe/Madrid', midnightUtc)).toBe(1);
    expect(localHourIn('America/Sao_Paulo', midnightUtc)).toBe(20);
    /* No timezone stored, and a timezone that is not one: the same answer as Madrid. */
    expect(localHourIn(null, midnightUtc)).toBe(1);
    expect(localHourIn('Not/AZone', midnightUtc)).toBe(1);
  });
});
