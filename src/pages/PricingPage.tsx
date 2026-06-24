import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAccessToken, API_URL } from '@/services/api/apiBase';
import { safeRedirect } from '@/lib/safeRedirect';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSubscription } from '@/hooks/useSubscription';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Get to know your twin',
    features: [
      '100 chat messages / month',
      '2 platform connections',
      'Basic soul signature',
      '7-day memory window',
    ],
    cta: 'Free plan',
    highlight: false,
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '$20',
    period: '/ month',
    description: 'Go deeper into who you are',
    features: [
      '1,500 chat messages / month',
      '5 platform connections',
      'Full soul signature',
      '90-day memory window',
      'Morning briefings',
      'Proactive insights',
    ],
    cta: 'Upgrade to Plus',
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$100',
    period: '/ month',
    description: 'The complete soul signature experience',
    // audit-2026-06-10 follow-up: 'WhatsApp twin access' and 'Twin goals +
    // auto-tracking' removed — neither is plan-gated anywhere (no whatsapp/goals
    // keys in subscriptionService PLAN_LIMITS, no requirePlan on those routes),
    // so a paid tier must not claim them as exclusives.
    features: [
      'Unlimited messages',
      'All platform connections',
      'Advanced personality oracle',
      'Priority support',
    ],
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
    } catch {
      toast.error('Could not open the billing page. Please check your connection and try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen px-4 py-12 flex flex-col items-center" style={{ background: 'transparent' }}>
      <div className="w-full max-w-4xl">
        <div className="mb-10 text-center">
          <h1
            className="mb-3"
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: '40px',
              fontWeight: 400,
              letterSpacing: '-0.8px',
              color: '#F5F5F4',
            }}
          >
            Choose your depth
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(245,245,244,0.5)' }}>
            Your twin grows with you. Start free, upgrade when you're ready.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = !planLoading && plan.id === currentPlanId;
            // While the subscription is loading every CTA is disabled so a
            // subscriber cannot open a checkout based on stale plan state.
            const ctaDisabled = planLoading || isCurrent || plan.id === 'free';
            const ctaLabel = isCurrent
              ? 'Current plan'
              : plan.id !== 'free' && onPaidPlan
                ? 'Change plan'
                : plan.cta;
            return (
            <div
              key={plan.id}
              style={{
                background: plan.highlight
                  ? 'rgba(196,162,101,0.08)'
                  : 'rgba(255,255,255,0.06)',
                border: plan.highlight
                  ? '1px solid rgba(196,162,101,0.25)'
                  : '1px solid rgba(255,255,255,0.10)',
                borderRadius: '20px',
                padding: '28px 24px',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                position: 'relative',
              }}
            >
              {plan.highlight && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-11px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(196,162,101,0.9)',
                    color: '#110f0f',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '3px 12px',
                    borderRadius: '100px',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Most popular
                </div>
              )}

              <div>
                <p style={{ fontSize: '12px', color: 'rgba(245,245,244,0.4)', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {plan.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 600, color: '#F5F5F4', letterSpacing: '-1px' }}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span style={{ fontSize: '14px', color: 'rgba(245,245,244,0.4)' }}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '13px', color: 'rgba(245,245,244,0.5)', marginTop: '6px' }}>
                  {plan.description}
                </p>
              </div>

              <ul style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                {plan.features.map((feature) => (
                  <li key={feature} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <Check
                      size={14}
                      style={{
                        color: plan.highlight ? '#C4A265' : 'rgba(245,245,244,0.4)',
                        marginTop: '2px',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '13px', color: 'rgba(245,245,244,0.7)' }}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                disabled={ctaDisabled || loading === plan.id}
                onClick={() => { if (!ctaDisabled) handleUpgrade(plan.id); }}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  borderRadius: '100px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: ctaDisabled ? 'default' : 'pointer',
                  transition: 'opacity 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  ...(ctaDisabled
                    ? {
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(245,245,244,0.3)',
                      }
                    : plan.highlight
                    ? {
                        background: '#F5F5F4',
                        border: 'none',
                        color: '#110f0f',
                      }
                    : {
                        background: 'rgba(196,162,101,0.15)',
                        border: '1px solid rgba(196,162,101,0.25)',
                        color: '#C4A265',
                      }),
                }}
              >
                {loading === plan.id && <Loader2 size={14} className="animate-spin" />}
                {loading === plan.id
                  ? (onPaidPlan ? 'Opening billing portal...' : 'Opening checkout...')
                  : ctaLabel}
              </button>
            </div>
            );
          })}
        </div>

        <div className="text-center mt-8">
          <button
            type="button"
            className="cursor-pointer hover:opacity-80 bg-transparent border-0 p-0"
            style={{ fontSize: '13px', color: 'rgba(245,245,244,0.3)' }}
            onClick={() => navigate('/settings')}
          >
            Back to settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
