/**
 * The calendar keeps everything it learned in two fact rows the lens hides from the page:
 * event_spend and event_spend_meta. Two readers need them anyway, because what they build
 * from them is the diary itself: Ask's prompt lines and the twin's money block. Read through
 * the ordinary filter, both were empty on every account with a calendar connected, and the
 * product looked like it was doing nothing with Google (2026-09-16).
 *
 * This reads the source because the bug was in the call, not in anything the call returns:
 * every pure piece downstream was already correct and already tested.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = (name) => readFileSync(join(here, '../../../../api/services/money', name), 'utf8');

/** The listFacts call in a function, with whatever options it passes. */
function factCallIn(text, fnName) {
  const start = text.indexOf(fnName);
  expect(start, `${fnName} is gone`).toBeGreaterThan(-1);
  const window = text.slice(start, start + 4000);
  const call = window.match(/listFacts\(userId[^)]*\)/);
  expect(call, `${fnName} no longer reads the facts`).toBeTruthy();
  return call[0];
}

describe('the calendar reaches the readers that speak for it', () => {
  it('Ask gathers the calendar rows, not only the ones a person is shown', () => {
    const chat = source('chat.js');
    expect(chat).toContain('calendarLines(ctx.facts');
    expect(factCallIn(chat, 'export async function gather')).toContain('includeInternal: true');
  });

  it("the twin's money block gathers them too", () => {
    const store = source('store.js');
    expect(store).toContain('calendarFromFacts(facts');
    expect(factCallIn(store, 'export async function moneyContext')).toContain('includeInternal: true');
  });

  it('the lens still keeps them off the page', () => {
    const store = source('store.js');
    expect(store).toMatch(/INTERNAL_FACT_KINDS[^\n]*event_spend/);
    expect(store).toMatch(/includeInternal \? rows : rows\.filter/);
  });
});
