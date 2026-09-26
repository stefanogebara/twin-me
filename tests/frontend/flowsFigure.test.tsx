// @vitest-environment jsdom
/**
 * The chat's flows figure (2026-09-26): money in beside money out, a pair of bars a month, in
 * the signal and in ink, the month under each pair, and a key. It draws only what the server
 * computed; with no months it draws nothing.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/i18n', () => ({ useT: () => (s: string, holes: Record<string, unknown> = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(holes[k] ?? `{${k}}`)), useLocale: () => 'en' }));
import { Figure } from '../../src/pages/money/MoneyFigures';
import type { ChatFigure } from '../../src/services/api/moneyAPI';

const figure: ChatFigure = {
  kind: 'flows',
  title: 'Money in and out per month',
  points: [
    { label: 'Aug', money_in: 1750, money_out: 1600 },
    { label: 'Sep', money_in: 875, money_out: 0, current: true },
  ],
};
const draw = (f: ChatFigure) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<Figure figure={f} />);
  return host;
};

it('draws a pair of bars a month, in against out, scaled to the largest', () => {
  const host = draw(figure);
  expect(host.querySelector('figcaption')?.textContent).toBe('Money in and out per month');
  const months = [...host.querySelectorAll('.mc-flow')];
  expect(months.map((m) => m.querySelector('.mc-flow-label')?.textContent)).toEqual(['Aug', 'Sep']);
  const heights = months.map((m) => [m.querySelector('.mc-flow-in') as HTMLElement, m.querySelector('.mc-flow-out') as HTMLElement].map((i) => i.style.height));
  expect(heights).toEqual([['100%', `${(1600 / 1750) * 100}%`], ['50%', '0%']]);
  expect(months[1].className).toContain('is-current');
});

it('says every pair in words for a screen reader, and keys the two colours', () => {
  const host = draw(figure);
  expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')?.replace(/\u00a0/g, ' ')).toBe('Aug: 1750,00 \u20ac in, 1600,00 \u20ac out; Sep: 875,00 \u20ac in, 0,00 \u20ac out');
  expect(host.querySelector('.mc-flows-key')?.textContent).toBe('InOut');
});

it('draws nothing without a month to draw', () => {
  expect(draw({ ...figure, points: [] }).innerHTML).toBe('');
});
