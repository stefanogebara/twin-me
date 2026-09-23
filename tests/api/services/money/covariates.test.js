/**
 * The calendar as a covariate: days away stop a silence clock, and the week gets the
 * calendar's word for it.
 */
import { describe, it, expect } from 'vitest';
import { awayWindows, awayDaysBetween, awayAt, weekWord } from '../../../../api/_app/services/money/covariates.js';

const NOW = new Date('2026-09-14T12:00:00Z');
const ev = (title, start, end, all_day = false) => ({ id: title, title, start, end, all_day });
const lisbon = ev('Viaje a Lisboa', '2026-09-04T00:00:00Z', '2026-09-08T00:00:00Z', true);
const exams = ev('Examen parcial de Derecho', '2026-09-11T09:00:00Z', '2026-09-11T11:00:00Z');
const lecture = ev('Lecture', '2026-09-10T09:00:00Z', '2026-09-10T11:00:00Z');
const flight = ev('Flight to Milan', '2026-08-20T07:00:00Z', '2026-08-20T09:30:00Z');

describe('awayWindows', () => {
  it('reads multi-day all-day events and trip titles as windows, merged when they touch', () => {
    expect(awayWindows([lisbon, exams, lecture])).toEqual([{ from: '2026-09-04', to: '2026-09-08', title: 'Viaje a Lisboa' }]);
    expect(awayWindows([flight])).toEqual([{ from: '2026-08-20', to: '2026-08-21', title: 'Flight to Milan' }]);
    const touching = [lisbon, ev('Weekend away', '2026-09-08T00:00:00Z', '2026-09-10T00:00:00Z', true)];
    expect(awayWindows(touching)).toEqual([{ from: '2026-09-04', to: '2026-09-10', title: 'Viaje a Lisboa' }]);
    expect(awayWindows([ev('Birthday', '2026-09-20T00:00:00Z', '2026-09-21T00:00:00Z', true)])).toEqual([]);
    /* A public-holiday calendar's day off is not a trip, however it is worded. */
    expect(awayWindows([ev('Spain: La Merce (Regional Holiday)', '2026-09-24T00:00:00Z', '2026-09-25T00:00:00Z', true)])).toEqual([]);
    expect(awayWindows([ev('Holiday party', '2026-12-18T20:00:00Z', '2026-12-18T23:00:00Z')])).toEqual([]);
  });
  it('counts the days inside a window between two moments', () => {
    const w = awayWindows([lisbon]);
    expect(awayDaysBetween(w, new Date('2026-09-01T12:00:00Z').getTime(), NOW.getTime())).toBe(4);
    expect(awayDaysBetween(w, new Date('2026-09-06T00:00:00Z').getTime(), NOW.getTime())).toBe(2);
    expect(awayDaysBetween(w, new Date('2026-09-09T00:00:00Z').getTime(), NOW.getTime())).toBe(0);
    expect(awayAt(w, new Date('2026-09-05T12:00:00Z').getTime()).title).toBe('Viaje a Lisboa');
    expect(awayAt(w, NOW.getTime())).toBeNull();
  });
});

describe('weekWord', () => {
  it('names an exam week over a week away, and nothing for an ordinary week', () => {
    expect(weekWord([exams, lisbon], NOW)).toBe('an exam week');
    expect(weekWord([lisbon, lecture], new Date('2026-09-10T12:00:00Z'))).toBe('a week away');
    expect(weekWord([lecture], NOW)).toBeNull();
    expect(weekWord([ev('Spain: National Day of Catalonia (Regional Holiday)', '2026-09-11T00:00:00Z', '2026-09-12T00:00:00Z', true)], NOW)).toBeNull();
    expect(weekWord([exams], new Date('2026-09-25T12:00:00Z'))).toBeNull();
  });
  it('calls a week with two things due a deadline week, below an exam week', () => {
    const due = [ev('Assignment 3 [Derecho]', '2026-09-10T00:00:00Z', '2026-09-11T00:00:00Z', true), ev('Due: Essay 1', '2026-09-12T22:00:00Z', '2026-09-12T22:01:00Z')];
    expect(weekWord(due, NOW)).toBe('a deadline week');
    expect(weekWord(due.slice(0, 1), NOW)).toBeNull();
    expect(weekWord([...due, exams], NOW)).toBe('an exam week');
    /* What IE's Blackboard actually writes. */
    const ie = [ev('Final Exam \u2013 Mock Test (Technical Check with SMOWL)', '2026-09-12T09:00:00Z', '2026-09-12T10:00:00Z')];
    expect(weekWord(ie, NOW)).toBe('an exam week');
    const ieDue = [ev('Final report: Deliverable 1', '2026-09-10T22:00:00Z', '2026-09-10T22:01:00Z'), ev('Ch 8 Quiz', '2026-09-13T22:00:00Z', '2026-09-13T22:01:00Z')];
    expect(weekWord(ieDue, NOW)).toBe('a deadline week');
    expect(weekWord([ev('CORPORATE FINANCE (Ses. 4) Live in-person', '2026-09-11T09:00:00Z', '2026-09-11T11:00:00Z')], NOW)).toBeNull();
  });
});
