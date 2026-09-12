/**
 * Each kind of calendar event as a signature hue (register.css): marks on the
 * day's line and parts of the week's mix, never text. Social events are
 * orchid, work that needs focus is ember, the body is periwinkle, learning is
 * verdigris; anything else is the register's mark grey. Every one is 3.3:1 on
 * the page, and ink on each is 4.7:1.
 */
const EVENT_HUES: Record<string, string> = {
  meeting: 'var(--rg-orchid)',
  interview: 'var(--rg-orchid)',
  focus: 'var(--rg-ember)',
  presentation: 'var(--rg-iris)',
  workout: 'var(--rg-periwinkle)',
  personal: 'var(--rg-signal)',
  learning: 'var(--rg-verdigris)',
};

export const eventHue = (type?: string) => EVENT_HUES[(type || '').toLowerCase()] ?? 'var(--rg-mark)';
