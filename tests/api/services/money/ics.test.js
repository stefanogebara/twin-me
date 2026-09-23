/**
 * A calendar feed read as text: what Canvas and Blackboard emit, reduced to the shape the
 * rest of the calendar lens already reads.
 */
import { describe, it, expect } from 'vitest';
import { parseIcs, feedKind, isFeedUrl, looksLikeIcs } from '../../../../api/_app/services/money/ics.js';

const CANVAS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Instructure//Canvas//EN',
  'BEGIN:VEVENT', 'UID:event-assignment-123', 'DTSTART;VALUE=DATE:20260921', 'SUMMARY:Assignment 3\\, part two [Derecho Mercantil]', 'URL:https://ie.instructure.com/courses/1/assignments/3', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:event-calendar-event-77', 'DTSTART:20260925T160000Z', 'DTEND:20260925T180000Z', 'SUMMARY:Examen parcial', '  de Economia', 'LOCATION:Aula 2.1', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:gone', 'DTSTART:20260926T160000Z', 'SUMMARY:Cancelled thing', 'STATUS:CANCELLED', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const BLACKBOARD = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Blackboard//Learn//EN',
  'BEGIN:VEVENT', 'UID:bb-1', 'DTSTART;TZID=Europe/Madrid:20261002T235900', 'DURATION:PT1M', 'SUMMARY:Due: Essay 1', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:bb-2', 'DTSTART;VALUE=DATE:20261005', 'DTEND;VALUE=DATE:20261008', 'SUMMARY:Viaje de estudios', 'END:VEVENT',
  'END:VCALENDAR',
].join('\n');

describe('parseIcs', () => {
  it('reads a Canvas feed: an all-day deadline, a timed exam with a folded title, and drops the cancelled one', () => {
    const events = parseIcs(CANVAS, { source: 'canvas' });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ id: 'event-assignment-123', title: 'Assignment 3, part two [Derecho Mercantil]', start: '2026-09-21T00:00:00.000Z', end: '2026-09-22T00:00:00.000Z', all_day: true, source: 'canvas', attendees_count: 0 });
    expect(events[1]).toMatchObject({ title: 'Examen parcial de Economia', start: '2026-09-25T16:00:00.000Z', end: '2026-09-25T18:00:00.000Z', all_day: false, location: 'Aula 2.1' });
  });
  it('reads a Blackboard feed: a zoned time with a duration, and a multi-day all-day event', () => {
    const events = parseIcs(BLACKBOARD, { source: 'blackboard' });
    expect(events[0]).toMatchObject({ title: 'Due: Essay 1', start: '2026-10-02T21:59:00.000Z', end: '2026-10-02T22:00:00.000Z', all_day: false });
    expect(events[1]).toMatchObject({ title: 'Viaje de estudios', start: '2026-10-05T00:00:00.000Z', end: '2026-10-08T00:00:00.000Z', all_day: true });
  });
  it('is empty on nothing, and knows what is a calendar', () => {
    expect(parseIcs('')).toEqual([]);
    expect(looksLikeIcs(CANVAS)).toBe(true);
    expect(looksLikeIcs('<html>')).toBe(false);
  });
});

describe('feedKind and isFeedUrl', () => {
  it('names the source from the link', () => {
    expect(feedKind('https://ie.instructure.com/feeds/calendars/user_abc.ics')).toBe('canvas');
    expect(feedKind('https://campus.example.edu/webapps/calendar/calendarFeed/xyz/learn.ics')).toBe('blackboard');
    expect(feedKind('https://example.com/cal.ics')).toBe('ics');
  });
  it('only reads https links to real hosts', () => {
    expect(isFeedUrl('https://ie.instructure.com/feeds/calendars/user_abc.ics')).toBe(true);
    expect(isFeedUrl('http://ie.instructure.com/x.ics')).toBe(false);
    expect(isFeedUrl('https://localhost/x.ics')).toBe(false);
    expect(isFeedUrl('https://10.0.0.1/x.ics')).toBe(false);
    expect(isFeedUrl('webcal://x.y/z')).toBe(false);
    expect(isFeedUrl('nonsense')).toBe(false);
  });
});
