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

export default function MoneyV2Page(props: { view?: MoneyView } = {}) {
  const { user } = useAuth();
  return <MoneyForAccount key={user?.id || 'signed-out'} {...props} userId={user?.id || null} />;
}

function MoneyForAccount({ view = 'today', userId }: { view?: MoneyView; userId: string | null }) {
  const m = useMoneyAccount(view, userId);
  const { t, note } = m;
  /* The tab said "Discover Your Soul Signature" over a page of euros, which is the front
     door's old promise showing through the new product. */
  useDocumentTitle(view === 'today' ? t('Money') : view === 'month' ? t('Money, the month') : t('Money, you'));
  return (
    <main className="mv">
      <div className="mv-shell">
        <MoneyNav links={MONEY_NAV(view)} />
        <div className="mv-col">
          {view === 'today' ? <TodayView m={m} /> : view === 'month' ? <MonthView m={m} /> : <YouView m={m} />}
          {/* What a press just did or failed to do, on whichever page the press was made. */}
          {note ? <p className="mv-note" role="status">{note}</p> : null}

          <footer className="mv-foot">
            <Link to="/privacy-policy">{t('Privacy')}</Link>
            <Link to="/terms">{t('Terms')}</Link>
            {/* The one door back to the rest of TwinMe, so Money is not a room without an exit. */}
            <Link to="/today">{t('Your twin')}</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
