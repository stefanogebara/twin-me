/**
 * Money, in the Instinct app register with Cosmos headings: a warm page, rows under an ink
 * rule instead of cards, 13px type with weight for hierarchy, and little text. This month
 * with a band; what the ledger says; where it went; every euro with its receipts and a
 * verdict; what comes back on its own; the two sources (Santander through Enable Banking,
 * and the phone).
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 * Register: .claude/plans/2026-09-11-instinct-register/README.md
 */
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/contexts/AuthContext';
import '../../styles/money-v2.css';
import MoneyNav from './MoneyNav';
import { MONEY_NAV, type MoneyView } from './navLinks';
import { useMoneyAccount } from './useMoneyAccount';
import TodayView from './views/TodayView';
import MonthView from './views/MonthView';
import YouView from './views/YouView';
import AccountView from './views/AccountView';

export default function MoneyV2Page(props: { view?: MoneyView }) {
  const { user } = useAuth();
  return <MoneyForAccount key={user?.id || 'signed-out'} {...props} userId={user?.id || null} />;
}

function MoneyForAccount({ view = 'today', userId }: { view?: MoneyView; userId: string | null }) {
  /* The account page reads what You reads: the accounts, the facts, the inbox, the capabilities. */
  const m = useMoneyAccount(view === 'account' ? 'you' : view, userId);
  const { t, note } = m;
  /* The tab said "Discover Your Soul Signature" over a page of euros, which is the front
     door's old promise showing through the new product. */
  useDocumentTitle(view === 'today' ? t('Money') : view === 'month' ? t('Money, the month') : view === 'account' ? t('Money, your account') : t('Money, you'));
  return (
    <main className="mv">
      <div className="mv-shell">
        {/* The onboarding decides its step from the accounts, the facts and the capabilities; the
            page has just read them, so it hands them over instead of letting it read them again. */}
        <MoneyNav links={MONEY_NAV(view)} onboarding={{ given: m.loaded ? { accounts: m.failedParts.has('accounts') ? null : m.accounts, facts: m.failedParts.has('facts') ? null : m.facts, capabilities: m.failedParts.has('capabilities') ? null : m.capabilities } : null, reread: m.load }} />
        <div className="mv-col">
          {view === 'today' ? <TodayView m={m} /> : view === 'month' ? <MonthView m={m} /> : view === 'account' ? <AccountView m={m} /> : <YouView m={m} />}
          {/* What a press just did or failed to do, on whichever page the press was made. */}
          {note ? <p className="mv-note" role="status">{note}</p> : null}

          <footer className="mv-foot">
            <Link to="/privacy-policy">{t('Privacy')}</Link>
            <Link to="/terms">{t('Terms')}</Link>
            {/* "Your twin" led to /today, a page of the retired product that now answers with a
                parked line. Money is the product; there is no other room (2026-09-22). */}
          </footer>
        </div>
      </div>
    </main>
  );
}
