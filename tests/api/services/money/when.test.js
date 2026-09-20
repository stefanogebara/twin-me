/** The days a sentence names, in Madrid days, in three languages; only a trip with days becomes away days. */
import { describe, expect, it } from 'vitest';
import { daysIn, tripDays, isTrip } from '../../../../api/services/money/when.js';

const wed = new Date('2026-09-16T10:00:00Z'); // Wednesday 16 September 2026 in Madrid
const sat = new Date('2026-09-19T10:00:00Z'); // Saturday

describe('daysIn', () => {
  it('reads tomorrow, this weekend and next weekend from midweek', () => {
    expect(daysIn('I am going to Bilbao tomorrow', wed)).toEqual(['2026-09-17']);
    expect(daysIn('this weekend in Toledo', wed)).toEqual(['2026-09-19', '2026-09-20']);
    expect(daysIn('next weekend in Toledo', wed)).toEqual(['2026-09-19', '2026-09-20']);
    expect(daysIn('next weekend in Toledo', sat)).toEqual(['2026-09-26', '2026-09-27']);
  });
  it('reads a span of weekdays and a single weekday', () => {
    expect(daysIn('I am going to Bilbao next Friday to Sunday with two friends', wed)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20']);
    expect(daysIn('voy a Valencia de viernes a domingo', wed)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20']);
    expect(daysIn('vou para o Porto de sexta a domingo', wed)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20']);
    expect(daysIn('dinner on friday', wed)).toEqual(['2026-09-18']);
  });
  it('reads dates with a month, and a day of this month or the next', () => {
    expect(daysIn('conference from 3 to 6 October', wed)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']);
    expect(daysIn('viaje del 3 al 6 de octubre', wed)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']);
    expect(daysIn('exam on the 25th', wed)).toEqual(['2026-09-25']);
    expect(daysIn('el 10 tengo examen', wed)).toEqual(['2026-10-10']);
    expect(daysIn('I spent 25 euros at lidl', wed)).toEqual([]);
  });
  it('names nothing for a sentence without days', () => {
    expect(daysIn('Spotify is my flatmate\'s, it is not mine', wed)).toEqual([]);
  });
});

describe('tripDays', () => {
  it('turns a trip with days into away days with a title the calendar reads', () => {
    expect(tripDays('I am going to Bilbao next Friday to Sunday with two friends', wed)).toEqual({ days: ['2026-09-18', '2026-09-19', '2026-09-20'], title: 'Trip: I am going to Bilbao next Friday to Sunday with two friends' });
    expect(tripDays('vou viajar pra Lisboa no fim de semana que vem', wed).days).toEqual(['2026-09-19', '2026-09-20']);
  });
  it('is null for a trip without days, or days without a trip', () => {
    expect(tripDays('I am going to Bilbao at some point', wed)).toBeNull();
    expect(tripDays('exam on the 25th', wed)).toBeNull();
    expect(isTrip('going to the gym on friday')).toBe(false);
  });
});
