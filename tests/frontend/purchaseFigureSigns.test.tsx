// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/i18n', () => ({ useT: () => (s: string) => s, useLocale: () => 'en' }));
import { Figure } from '../../src/pages/money/MoneyFigures';

// Current issuance clamps daily allowance to zero, but valid typed saved figures
// may carry a negative estimate. The renderer must not reverse its meaning.
it.each([
  ['EUR', /[-−]4,00\s*€/],
  ['USD', /[-−]\$4\.00/],
] as const)('preserves a negative saved estimate in %s', (currency, signedAmount) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<Figure figure={{ kind: 'purchase', cost: 25, allowance: -4, difference: 29, currency }} />);
  expect(host.textContent).toMatch(signedAmount);
});
