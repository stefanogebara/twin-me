/** A course as a person says it, not as a registrar writes it (2026-09-22). */
import { describe, expect, it } from 'vitest';
import { eventName } from '../../src/pages/money/eventName';

describe('eventName', () => {
  it('stops a registrar title from shouting, and drops the timetable\'s own business', () => {
    expect(eventName('STRATEGIES FOR COMPETING IN INDUSTRIES AND MARKETS (Ses. 8) Live in-person'))
      .toBe('Strategies for competing in industries and…');
    expect(eventName('HUMAN CAPITAL MANAGEMENT (Ses. 5) Asynchronous')).toBe('Human capital management');
    /* IE is a school, not a shouted word: an acronym keeps its capitals. */
    expect(eventName('IE-CHALLENGE (Ses. 6-7) Live in-person')).toBe('IE-challenge');
    expect(eventName('DATA ANALYSIS FOR ECONOMICS (Ses. 9) Live in-person')).toBe('Data analysis for economics');
    expect(eventName('MBA STRATEGY (Ses. 2)')).toBe('MBA strategy');
  });

  it('leaves a name a person wrote exactly as they wrote it', () => {
    expect(eventName('Murilo Personal')).toBe('Murilo Personal');
    expect(eventName('Álvaro psicólogo')).toBe('Álvaro psicólogo');
    expect(eventName("Christian Mauad Gebara's birthday")).toBe("Christian Mauad Gebara's birthday");
    expect(eventName('Consulta Stefano- aplicación de microinyección')).toBe('Consulta Stefano- aplicación de microinyección');
    expect(eventName('S5: Recruitment & Selection Fieldwork form')).toBe('S5: Recruitment & Selection Fieldwork form');
  });

  it('says nothing about nothing', () => {
    expect(eventName('')).toBe('');
    expect(eventName(null)).toBe('');
    expect(eventName(undefined)).toBe('');
  });

  it('never returns an empty name for a title that was only a session number', () => {
    expect(eventName('(Ses. 3)')).toBe('(Ses. 3)');
  });
});
