/**
 * The money pages' links, one list shared by every page so the current one is underlined
 * wherever the person stands. Kept apart from the nav component so fast refresh keeps working.
 */
import type { MoneyNavLink } from './MoneyNav';

/* Three pages and Ask, the shape the phone already has. The month page was one scroll of
   eight sections and a thousand words; the sidebar pretended to be pages. Now it is. */
export type MoneyView = 'today' | 'month' | 'you' | 'account';
/* The plan came fourth (2026-09-15): the month as a calendar, what each day cost and what the coming ones carry. */
export const MONEY_NAV = (current: string): MoneyNavLink[] => [
  { to: '/money', label: 'Today', current: current === 'today' },
  { to: '/money/month', label: 'Month', current: current === 'month' },
  { to: '/money/plan', label: 'Plan', current: current === 'plan' },
  { to: '/money/you', label: 'You', current: current === 'you' },
  { to: '/money/chat', label: 'Ask', current: current === 'ask' },
  /* Where it reads from and the account, apart from the four pages (2026-09-21): You is what it
     knows about the person; the sources and the settings are not that. */
  { to: '/money/account', label: 'Account', current: current === 'account', apart: true },
];
