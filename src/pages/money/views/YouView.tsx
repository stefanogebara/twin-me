/**
 * You: what it worked out, what it knows in your words, and where it reads from.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import Wait from '../../../components/Wait';
import { orbFor } from '../orbFor';
import { Stamp } from '../Carved';
import type { MoneyAccount } from '../useMoneyAccount';
import Noticed from './you/Noticed';
import Knows from './you/Knows';
import Sources from './you/Sources';
import Account from './you/Account';

export default function YouView({ m }: { m: MoneyAccount }) {
  const { t, user, facts, youFailed } = m;
  return (
    <>
          <section className="mv-hero" id="you-title">
            <Stamp mark="rent" />
            <p className="mv-eyebrow">{t('You')}</p>
            <h1>{user?.firstName ? t('{name}.', { name: user.firstName }) : t('You.')}</h1>
            <p className="mv-sub">{t('What it knows in your words, and where it reads from.')}</p>
            {facts === null && !youFailed ? <Wait inline state={orbFor('page')} line="Reading what it knows." /> : null}
          </section>
          {/* What it knows: the person's own words, each one forgettable; then what it still
              wants to ask. The facts are claims the ledger checks, so the grey word under each
              is the ledger's verdict when it has one. */}
          {/* What the ledger worked out itself, beside what the person told it. These patterns
              have been in the twin's own context for months and had never reached a page
              (Stefano, 2026-09-16: "context and learning patterns"). */}
      <Noticed m={m} />
      <Knows m={m} />
          {/* Sources */}
      <Sources m={m} />
          {/* The account: language, sign out, what it keeps, delete (2026-09-21). */}
      <Account m={m} />
    </>
  );
}
