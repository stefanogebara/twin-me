import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAccessToken, API_URL } from '@/services/api/apiBase';
import { safeRedirect } from '@/lib/safeRedirect';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSubscription } from '@/hooks/useSubscription';
import { Page, PageHead, List, Row } from '@/components/register';
import '@/styles/register-public.css';

/**
 * /pricing, in the register's page kit: a title and one grey line, then one row
 * per plan under the list's ink rule. Each row is the plan and its price, one
 * grey line of what it holds, and one action. The billing logic is unchanged.
 */

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '',
    summary: '100 messages a month, 2 connections, 7 days of memory',
    cta: 'Free plan',
    highlight: false,
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '$20',
    period: 'a month',
    summary: '1,500 messages, 5 connections, 90 days, morning briefings',
    cta: 'Upgrade to Plus',
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$100',
    period: 'a month',
    // audit-2026-06-10 follow-up: 'WhatsApp twin access' and 'Twin goals +
    // auto-tracking' removed — neither is plan-gated anywhere (no whatsapp/goals
    // keys in subscriptionService PLAN_LIMITS, no requirePlan on those routes),
    // so a paid tier must not claim them as exclusives.
    summary: 'Unlimited messages, every connection, priority support',
    cta: 'Upgrade to Pro',
    highlight: false,
  },
];

// DB plan keys -> pricing card ids. Mirrors PLAN_DISPLAY_TO_DB in
// api/routes/billing.js: DB 'pro' is the $20 Plus tier, DB 'max' is the
// $100 Pro tier (audit-2026-06-10).
const DB_PLAN_TO_PAGE_ID: Record<string, string> = { free: 'free', pro: 'plus', max: 'pro' };

const PricingPage: React.FC = () => {
  useDocumentTitle('Pricing');
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const { plan: dbPlan, loading: planLoading } = useSubscription();
  const currentPlanId = DB_PLAN_TO_PAGE_ID[dbPlan] ?? 'free';
  const onPaidPlan = currentPlanId !== 'free';

  const handleUpgrade = async (planId: string) => {
    const token = getAccessToken();
    if (!token) { navigate('/auth'); return; }
    setLoading(planId);
    try {
      // audit-2026-06-10: existing subscribers must change plans via the Stripe
      // billing portal — /billing/checkout always creates a NEW subscription,
      // which would double-charge anyone already on a paid plan.
      const endpoint = onPaidPlan ? 'portal' : 'checkout';
      const res = await fetch(`${API_URL}/billing/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(endpoint === 'checkout' ? { plan: planId } : {}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url || !safeRedirect(data.url)) {
        toast.error(
          typeof data?.error === 'string' && data.error
            ? data.error
            : 'Could not open the billing page. Please try again.',
        );
      }
    } catch (err) {
      // Only network-level failures land here (HTTP errors are handled above);
      // log the raw error so billing issues are debuggable (audit-2026-07-03).
      console.error('Billing endpoint unreachable:', err);
      toast.error('Could not open the billing page. Please check your connection and try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <Page>
      <PageHead title="Plans" line="Start free. Upgrade when you are ready." />

      <List label="Plans" className="pb-stack rg-figures">
        {PLANS.map((plan) => {
          const isCurrent = !planLoading && plan.id === currentPlanId;
          // While the subscription is loading every CTA is disabled so a
          // subscriber cannot open a checkout based on stale plan state.
          const ctaDisabled = planLoading || isCurrent || plan.id === 'free';
          const ctaLabel = plan.id !== 'free' && onPaidPlan ? 'Change plan' : plan.cta;
          // One action per plan: the current one says so in quiet text, the
          // highlighted plan is the screen's one primary, the rest secondary.
          const action = isCurrent ? (
            <span className="rg-row-line" style={{ color: 'var(--rg-ink-3)' }}>Current plan</span>
          ) : (
            <button
              type="button"
              className={`n-btn ${plan.highlight && !ctaDisabled ? 'n-btn--primary' : 'n-btn--ghost'}`}
              disabled={ctaDisabled || loading === plan.id}
              onClick={() => { if (!ctaDisabled) handleUpgrade(plan.id); }}
            >
              {loading === plan.id && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {loading === plan.id
                ? (onPaidPlan ? 'Opening billing portal...' : 'Opening checkout...')
                : ctaLabel}
            </button>
          );
          return (
            <Row
              key={plan.id}
              title={`${plan.name}, ${plan.price}${plan.period ? ` ${plan.period}` : ''}`}
              line={plan.summary}
              action={action}
            />
          );
        })}
      </List>

      <div style={{ marginTop: 32 }}>
        <button type="button" className="n-btn n-btn--ghost" onClick={() => navigate('/settings')}>
          Back to settings
        </button>
      </div>
    </Page>
  );
};

export default PricingPage;
