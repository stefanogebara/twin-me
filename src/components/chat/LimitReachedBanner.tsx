import { Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ChatUsage {
  used: number;
  // Audit bug C2 (2026-05-12): max-tier returns limit=null from /api/chat/usage.
  // Banner must skip the denominator display when there's no numeric cap.
  limit: number | null;
  remaining: number | null;
  tier: string;
  unlimited?: boolean;
}

interface LimitReachedBannerProps {
  chatUsage: ChatUsage | null;
}

/* The register: one row under an ink rule (a 32px icon, the title, one grey
   line) and the one ink primary. No glass card, no shadow. */
export const LimitReachedBanner: React.FC<LimitReachedBannerProps> = ({ chatUsage }) => (
  <div className="px-3 sm:px-6 py-6 max-w-3xl mx-auto w-full" role="alert">
    <ul className="rg-list">
      <li className="rg-row">
        <span className="rg-row-icon" aria-hidden="true"><Clock /></span>
        <span className="rg-row-text">
          <span className="rg-row-title">You've reached this month's limit</span>
          <span className="rg-row-line" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {/* Audit bug C2: guard against null limit (unlimited tiers). */}
            {chatUsage
              ? typeof chatUsage.limit === 'number'
                ? `${chatUsage.used} of ${chatUsage.limit} messages used. Upgrade for more.`
                : `${chatUsage.used} messages used. Upgrade for more.`
              : 'Upgrade your plan for more conversations with your twin.'}
          </span>
        </span>
        <span className="rg-row-action">
          <Link to="/pricing" className="n-btn n-btn--primary">Upgrade plan</Link>
        </span>
      </li>
    </ul>
  </div>
);
