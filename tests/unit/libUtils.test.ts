import { describe, it, expect } from 'vitest';
import { cn, toSecondPerson } from '../../src/lib/utils';
import {
  TWIN_WHATSAPP_DISPLAY,
  TWIN_WHATSAPP_DIGITS,
  TWIN_WHATSAPP_LINK,
} from '../../src/lib/whatsappConstants';

/**
 * Characterization tests for small pure lib helpers.
 *
 * - toSecondPerson: a non-trivial ordered chain of regex replacements that
 *   rewrites third-person reflection text to second-person. Ordering is
 *   load-bearing (possessives before subjects; verb de-pluralization last), so
 *   these tests PIN that ordering + the known edge behaviors (audit-2026-07-04).
 * - whatsappConstants: assert the derived wa.me link stays consistent with the
 *   digits, and the display/digits agree (catches a future typo in one but not
 *   the other).
 * - cn: the shadcn class-merge wrapper — a couple of sanity assertions only.
 */

describe('toSecondPerson', () => {
  it('rewrites "This person" subject to "You"', () => {
    // NB: "loves" is deliberately NOT in the enumerated verb-fix list (see the
    // "incomplete verb list" characterization below), so it stays "You loves".
    // Use an enumerated verb to show the clean subject rewrite.
    expect(toSecondPerson('This person likes music.')).toBe('You like music.');
  });

  it('CHARACTERIZATION (known rough edge): verb-fix list is incomplete — un-listed verbs keep the third-person "s"', () => {
    // "loves" is not among the ~60 enumerated verbs, so the subject rewrite
    // ("This person" → "You") is applied but the trailing "s" is NOT stripped,
    // producing the mildly ungrammatical "You loves music." This is CURRENT
    // behavior (audit-2026-07-04), pinned intentionally — not fixed here.
    expect(toSecondPerson('This person loves music.')).toBe('You loves music.');
  });

  it('CHARACTERIZATION: handles possessive "This person\'s" BEFORE the subject form', () => {
    // If the subject rule ran first, "This person's" would become "You's".
    // Possessive-first ordering yields "Your".
    expect(toSecondPerson("This person's taste is eclectic.")).toBe('Your taste is eclectic.');
    expect(toSecondPerson("this person's routine")).toBe('your routine');
  });

  it('rewrites they-contractions to you-contractions', () => {
    expect(toSecondPerson("They've grown a lot.")).toBe("You've grown a lot.");
    expect(toSecondPerson("They're curious.")).toBe("You're curious.");
    expect(toSecondPerson("They'll adapt.")).toBe("You'll adapt.");
    expect(toSecondPerson("They'd rather explore.")).toBe("You'd rather explore.");
  });

  it('rewrites bare They/their/them/themselves', () => {
    expect(toSecondPerson('They value depth.')).toBe('You value depth.');
    expect(toSecondPerson('Their focus is sharp.')).toBe('Your focus is sharp.');
    expect(toSecondPerson('It suits them well.')).toBe('It suits you well.');
    expect(toSecondPerson('They push themselves.')).toBe('You push yourself.');
  });

  it('rewrites gendered reflexives himself/herself to yourself', () => {
    expect(toSecondPerson('He pushes himself.')).toBe('He pushes yourself.');
    expect(toSecondPerson('She trusts herself.')).toBe('She trusts yourself.');
  });

  it('CHARACTERIZATION: de-pluralizes third-person verbs after a rewritten "You"', () => {
    // "They enjoy" is already correct, but "This person enjoys" → "You enjoys"
    // via subject rule, then the verb-fix strips the trailing s → "You enjoy".
    expect(toSecondPerson('This person enjoys jazz.')).toBe('You enjoy jazz.');
    expect(toSecondPerson('This person values honesty.')).toBe('You value honesty.');
    expect(toSecondPerson('This person tends to plan ahead.')).toBe('You tend to plan ahead.');
  });

  it('CHARACTERIZATION: only the enumerated verbs are de-pluralized; others keep the s', () => {
    // "runs" IS in the list → de-pluralized. A verb NOT in the list (e.g.
    // "sprints") would keep its s. Pin both.
    expect(toSecondPerson('This person runs daily.')).toBe('You run daily.');
    // "sprints" is not enumerated → stays "You sprints".
    expect(toSecondPerson('This person sprints daily.')).toBe('You sprints daily.');
  });

  it('CHARACTERIZATION: word-boundary anchored — does not corrupt substrings', () => {
    // "therapist" contains "the" but not the whole word "they"/"their"; the \b
    // anchors prevent partial rewrites.
    expect(toSecondPerson('The therapist noticed a pattern.')).toBe('The therapist noticed a pattern.');
  });

  it('leaves already-second-person text unchanged', () => {
    expect(toSecondPerson('You value depth and honesty.')).toBe('You value depth and honesty.');
  });

  it('handles multiple substitutions in one sentence', () => {
    expect(toSecondPerson("This person's mind races; they enjoy solving problems for themselves."))
      .toBe('Your mind races; you enjoy solving problems for yourself.');
  });

  it('returns the input unchanged when there is nothing to rewrite', () => {
    expect(toSecondPerson('Music is a constant companion.')).toBe('Music is a constant companion.');
  });
});

describe('cn (class merge)', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('CHARACTERIZATION: tailwind-merge resolves conflicting utilities (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('supports conditional object syntax (clsx)', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });
});

describe('whatsappConstants', () => {
  it('exposes the display number in human format', () => {
    expect(TWIN_WHATSAPP_DISPLAY).toBe('+1 762-994-3997');
  });

  it('exposes digits-only variant', () => {
    expect(TWIN_WHATSAPP_DIGITS).toBe('17629943997');
  });

  it('CHARACTERIZATION: the wa.me link is derived from the digits', () => {
    expect(TWIN_WHATSAPP_LINK).toBe(`https://wa.me/${TWIN_WHATSAPP_DIGITS}`);
    expect(TWIN_WHATSAPP_LINK).toBe('https://wa.me/17629943997');
  });

  it('digits and display agree (stripping non-digits from display equals digits)', () => {
    // Guards against a future edit that changes one number but not the other.
    expect(TWIN_WHATSAPP_DISPLAY.replace(/\D/g, '')).toBe(TWIN_WHATSAPP_DIGITS);
  });
});
