// src/components/PaywallModal.tsx
import React, { useState } from 'react';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import { safeRedirect } from '@/lib/safeRedirect';


// `key` is the display name sent to /api/billing/checkout. The server maps
// display names to DB enum values (plus → DB 'pro', pro → DB 'max'). Don't
// switch these to DB keys ('pro'/'max') — the server's mapping is ambiguous
// for 'pro' and would charge a Plus click for the $100 Pro tier.
const PLANS = [
  {
    key: 'plus', name: 'Plus', price: '$20', period: '/mo',
    description: 'The ongoing twin relationship',
    features: [
      '1,500 messages / month',
      '5 platform integrations',
      '90-day memory',
      'Expert reflection personas',
      'Weekly email digest',
    ],
    cta: 'Start with Plus', highlight: false,
  },
  {
    key: 'pro', name: 'Pro', price: '$100', period: '/mo',
    description: 'The deepest mirror',
    features: [
      'Unlimited messages',
      'All integrations',
      'Full memory history',
      'Best AI models',
      'Priority support',
    ],
    cta: 'Go Pro', highlight: true,
  },
];

interface Props { isOpen: boolean; }

/**
 * The paywall, in the register: the page colour with a hairline, a Cosmos section
 * title, two plans as white boxes with a hairline (the highlighted one takes the
 * ink line), and one ink primary. No gold gradient, no glow, no shadow.
 */
const PaywallModal: React.FC<Props> = ({ isOpen }) => {
  const [loading, setLoading] = useState<string | null>(null);

  const upgrade = async (plan: string) => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(plan);
    try {
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) safeRedirect(data.url);
    } finally { setLoading(null); }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgb(var(--rg-ink-rgb) / 0.32)' }}>
      <div
        className="max-w-xl w-full p-6 space-y-6"
        style={{ background: 'var(--rg-page)', border: '1px solid var(--rg-rule)', borderRadius: 'var(--rg-radius-icon)' }}>

        {/* Header */}
        <div className="space-y-1">
          <p className="text-[13px] font-medium" style={{ color: 'var(--rg-ink)' }}>Your twin is ready</p>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--rg-section-title)', fontWeight: 400, lineHeight: 1.08, letterSpacing: 'var(--rg-section-track)', color: 'var(--rg-ink)' }}>
            Keep the conversation going.
          </h2>
          <p className="text-[13px] font-[350]" style={{ color: 'var(--rg-ink-2)' }}>Unlock full access to everything your twin can do.</p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLANS.map(plan => (
            <div key={plan.key} className="p-5 space-y-4"
              style={{
                background: 'var(--rg-white)',
                border: `1px solid ${plan.highlight ? 'var(--rg-ink)' : 'var(--rg-rule)'}`,
                borderRadius: 'var(--rg-radius-icon)',
              }}>

              {/* Plan name */}
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium" style={{ color: 'var(--rg-ink)' }}>{plan.name}</p>
                {plan.highlight && (
                  <span className="text-[13px] font-[350] px-2" style={{ background: 'var(--rg-field)', color: 'var(--rg-ink-2)', borderRadius: 'var(--rg-radius)' }}>
                    Best value
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-1">
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 32, fontWeight: 300, lineHeight: 1, letterSpacing: 'var(--rg-title-track)', color: 'var(--rg-ink)' }}>{plan.price}</span>
                <span className="text-[13px] font-[350]" style={{ color: 'var(--rg-ink-3)' }}>{plan.period}</span>
              </div>

              {/* Description */}
              <p className="text-[13px] font-[350]" style={{ color: 'var(--rg-ink-2)' }}>{plan.description}</p>

              {/* Features */}
              <ul className="space-y-1">
                {plan.features.map(f => (
                  <li key={f} className="text-[13px] flex gap-2 items-start" style={{ color: 'var(--rg-ink)' }}>
                    <span aria-hidden="true" style={{ color: 'var(--rg-ink-2)' }}>&#10003;</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA: the highlighted plan is the one primary; the other is the secondary. */}
              <button onClick={() => upgrade(plan.key)} disabled={loading === plan.key}
                className="w-full h-8 px-4 text-[13px] disabled:opacity-40 transition-opacity hover:opacity-[0.86]"
                style={plan.highlight
                  ? { background: 'var(--rg-ink)', color: 'var(--rg-page)', border: '1px solid var(--rg-ink)', borderRadius: 'var(--rg-radius)', fontWeight: 500 }
                  : { background: 'var(--rg-white)', color: 'var(--rg-ink)', border: '1px solid var(--rg-rule)', borderRadius: 'var(--rg-radius)' }}>
                {loading === plan.key ? 'Loading...' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-[13px] font-[350]" style={{ color: 'var(--rg-ink-3)' }}>
          {/* audit-2026-06-10: monthly billing only — no annual checkout exists */}
          Cancel anytime.
        </p>
      </div>
    </div>
  );
};

export default PaywallModal;
