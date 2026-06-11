/**
 * P1 wire-the-loop — morning-briefing detail screen smoke
 * (desktop/www/index.html).
 *
 * Loads the bundled onboarding page into JSDOM with its inline script
 * executing, then drives the briefing card through the browser-verification
 * hook ('twinme:test-show-briefing' — registered only when HAS_TAURI is
 * false, so it is inert in the real desktop app). In production the same
 * showBriefing path is reached via sync.rs: native toast -> win.eval
 * CustomEvent 'twinme:briefing-ready' -> invoke('get_latest_briefing').
 *
 * Render contract under test:
 *   - greeting + schedule_summary in the header slots
 *   - at most 3 insight glass cards
 *   - rest/music collapsibles OMITTED entirely when null
 *   - suggestion rendered prominent
 *   - all LLM-derived strings HTML-escaped
 *   - dismiss (button + Escape) restores the stepper screen
 */
import { describe, it, expect, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(
  path.resolve(__dirname, '../../desktop/www/index.html'),
  'utf8'
);

const BRIEFING = {
  greeting: 'Good Morning, Stefano',
  schedule_summary: 'Two meetings this morning, then a clear afternoon.',
  insights: [
    'Your best focus blocks this week happened before 11am.',
    'You picked Slack back up after midnight twice this week.',
    'Three days since your last commit on twin-ai-learn.',
  ],
  rest: 'Slept 7h12 - recovery is back over 70%.',
  music: null,
  suggestion: 'Block 9 to 11 for the proposal.',
};

let dom;

function loadPage() {
  dom = new JSDOM(HTML, {
    // http origin so localStorage works; matches the Windows bundled-page
    // origin shape (http://tauri.localhost).
    url: 'http://tauri.localhost/',
    runScripts: 'dangerously',
    // requestAnimationFrame for the page's ambient gradient drift loop.
    pretendToBeVisual: true,
  });
  return dom.window;
}

function showBriefing(window, briefing) {
  window.dispatchEvent(
    new window.CustomEvent('twinme:test-show-briefing', { detail: briefing })
  );
}

afterEach(() => {
  // Stop the page's requestAnimationFrame loop between tests.
  if (dom) dom.window.close();
  dom = undefined;
});

describe('briefing-detail screen (desktop onboarding page)', () => {
  it('is present but never activated by the stepper', () => {
    const window = loadPage();
    const doc = window.document;
    const screen = doc.getElementById('briefing-screen');
    expect(screen).toBeTruthy();
    expect(screen.classList.contains('active')).toBe(false);
    // The stepper's own screen 0 is the active one on load.
    expect(doc.querySelector('.screen[data-step="0"]').classList.contains('active')).toBe(true);
  });

  it('renders greeting, schedule summary, 3 insight cards, rest fold, no music fold, and the suggestion', () => {
    const window = loadPage();
    const doc = window.document;
    showBriefing(window, BRIEFING);

    expect(doc.getElementById('briefing-screen').classList.contains('active')).toBe(true);
    expect(doc.body.classList.contains('briefing-open')).toBe(true);
    expect(doc.getElementById('briefing-greeting').textContent).toBe('Good Morning, Stefano');
    expect(doc.getElementById('briefing-schedule').textContent).toContain('Two meetings');

    const cards = doc.querySelectorAll('#briefing-host .briefing-card');
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain('focus blocks');

    // rest present -> one fold; music null -> no second fold at all.
    const folds = doc.querySelectorAll('#briefing-host details.briefing-fold');
    expect(folds.length).toBe(1);
    expect(folds[0].textContent).toContain('Rest & recovery');

    const suggestion = doc.querySelector('#briefing-host .briefing-suggestion');
    expect(suggestion).toBeTruthy();
    expect(suggestion.textContent).toContain('Block 9 to 11');
  });

  it('caps insights at 3 and tolerates the no-data fallback briefing shape', () => {
    const window = loadPage();
    const doc = window.document;
    showBriefing(window, {
      greeting: 'Good Morning, Stefano',
      // schedule_summary missing on the backend's no-data fallback briefing
      insights: ['one', 'two', 'three', 'four', 'five'],
      rest: null,
      music: null,
      suggestion: 'Connect a platform like Spotify or Google Calendar.',
    });

    expect(doc.querySelectorAll('#briefing-host .briefing-card').length).toBe(3);
    expect(doc.querySelectorAll('#briefing-host details.briefing-fold').length).toBe(0);
    // Missing schedule_summary degrades to the generic line, never blank.
    expect(doc.getElementById('briefing-schedule').textContent.length).toBeGreaterThan(0);
  });

  it('HTML-escapes LLM-derived strings (no markup injection)', () => {
    const window = loadPage();
    const doc = window.document;
    showBriefing(window, {
      greeting: 'Good Morning',
      schedule_summary: 'ok',
      insights: ['<img src=x onerror="window.__pwned=1">'],
      rest: null,
      music: null,
      suggestion: '<script>window.__pwned=2</script>',
    });

    expect(doc.querySelector('#briefing-host img')).toBeNull();
    expect(doc.querySelector('#briefing-host script')).toBeNull();
    expect(window.__pwned).toBeUndefined();
    expect(doc.querySelector('#briefing-host .briefing-card').textContent).toContain('<img');
  });

  it('dismiss button returns to the stepper screen', () => {
    const window = loadPage();
    const doc = window.document;
    showBriefing(window, BRIEFING);

    doc.getElementById('briefing-dismiss').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );

    expect(doc.getElementById('briefing-screen').classList.contains('active')).toBe(false);
    expect(doc.body.classList.contains('briefing-open')).toBe(false);
    expect(doc.querySelector('.screen[data-step="0"]').classList.contains('active')).toBe(true);
  });

  it('Escape dismisses; other keys do not drive the stepper underneath', () => {
    const window = loadPage();
    const doc = window.document;
    showBriefing(window, BRIEFING);

    // ArrowRight while the overlay is up must NOT advance the stepper.
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(doc.getElementById('briefing-screen').classList.contains('active')).toBe(true);
    expect(doc.querySelector('.screen[data-step="1"]').classList.contains('active')).toBe(false);

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(doc.getElementById('briefing-screen').classList.contains('active')).toBe(false);
    expect(doc.body.classList.contains('briefing-open')).toBe(false);
    expect(doc.querySelector('.screen[data-step="0"]').classList.contains('active')).toBe(true);
  });
});
