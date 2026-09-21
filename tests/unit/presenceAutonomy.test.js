/**
 * Autonomy calibration: the two decisions the presence makes on its own, and
 * the family sets. One value each, on the presence row; an unknown or missing
 * value is the shipped default, because a call must never fail over a setting.
 */
import { describe, it, expect } from 'vitest';
import {
  ESCALATION, INITIATIVE, autonomyOf, escalationInstruction, initiativeSection,
} from '../../api/services/presenceAutonomy.js';

describe('autonomyOf', () => {
  it('reads both dials off the presence row', () => {
    expect(autonomyOf({ autonomy_escalation: 'everything', autonomy_initiative: 'ask' }))
      .toEqual({ escalation: 'everything', initiative: 'ask' });
  });

  it('falls back to what shipped before the dials existed', () => {
    expect(autonomyOf({})).toEqual({ escalation: 'when_it_matters', initiative: 'wait' });
    expect(autonomyOf(null)).toEqual({ escalation: 'when_it_matters', initiative: 'wait' });
  });

  it('refuses a value it does not know, rather than passing it to a prompt', () => {
    expect(autonomyOf({ autonomy_escalation: 'ignore her', autonomy_initiative: 42 }))
      .toEqual({ escalation: 'when_it_matters', initiative: 'wait' });
  });

  it('names its values once, for the migration, the route and the page to share', () => {
    expect(ESCALATION).toEqual(['everything', 'when_it_matters', 'only_urgent']);
    expect(INITIATIVE).toEqual(['ask', 'wait']);
  });
});

describe('escalationInstruction', () => {
  it('asks for everything, including the quiet, when the family wants everything', () => {
    const text = escalationInstruction('everything');
    expect(text).toMatch(/emotional withdrawal/i);
    expect(text).toMatch(/even when nothing was explicitly asked/i);
  });

  it('holds the bar at what a person would act on by default', () => {
    const text = escalationInstruction('when_it_matters');
    expect(text).toMatch(/emotional withdrawal/i);
    expect(text).toMatch(/small talk|ordinary|nothing to act on/i);
  });

  it('keeps only what needs a person today when the family asked for that', () => {
    const text = escalationInstruction('only_urgent');
    expect(text).toMatch(/pain, a fall, confusion|asked for help/i);
    expect(text).toMatch(/empty/i);
    // The bar moved, but her own words about being unwell never stop counting.
    expect(text).not.toMatch(/never report/i);
  });
});

describe('initiativeSection', () => {
  it('lets the presence ask once, gently, when the family chose that', () => {
    const text = initiativeSection('ask', 'Sofia');
    expect(text).toMatch(/ask ONCE|once, gently/i);
    // Headings in the brief are uppercase, as every other section's is.
    expect(text).toContain('SOFIA');
    // The hard rule is never softened by a setting.
    expect(text).toMatch(/never.*(died|death|loss)/i);
  });

  it('waits for her to bring it up, by default', () => {
    const text = initiativeSection('wait', 'Sofia');
    expect(text).toMatch(/wait|do not raise/i);
    expect(text).toMatch(/never.*(died|death|loss)/i);
  });
});
