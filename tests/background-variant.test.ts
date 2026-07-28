import { describe, it, expect } from 'vitest';
import { pickBackgroundVariant } from '../src/lib/backgroundVariant';

// Claura port Phase 3 — which full-viewport background paints behind the app.
// The DayNight photo set carries night scrims tuned for light-on-dark text,
// so the light appearance must always resolve to the ambient canvas.

describe('pickBackgroundVariant', () => {
  it('dark theme keeps the user\'s background mode choice', () => {
    expect(pickBackgroundVariant('natural', 'dark')).toBe('daynight');
    expect(pickBackgroundVariant('dark', 'dark')).toBe('ambient');
  });

  it('light theme always paints the ambient paper canvas', () => {
    expect(pickBackgroundVariant('natural', 'light')).toBe('ambient');
    expect(pickBackgroundVariant('dark', 'light')).toBe('ambient');
  });
});
