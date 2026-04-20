// src/components/PaywallModal.tsx
import React, { useState } from 'react';
import { getAccessToken } from '@/services/api/apiBase';
import { safeRedirect } from '@/lib/safeRedirect';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

const PLANS = [
  {
    key: 'pro', name: 'Plus', price: '$20', period: '/mo',
    description: 'The ongoing twin relationship',
    features: [
      '500 messages / month',
      '5 platform integrations',
      '90-day memory',
      'Expert reflection personas',
      'Weekly email digest',
    ],
    cta: 'Start with Plus', highlight: false,
  },
  {
    key: 'max', name: 'Pro', price: '$100', period: '/mo',
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
      style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div
        className="max-w-xl w-full rounded-3xl p-8 space-y-8"
        style={{ background: 'var(--background)', border: '1px solid var(--border-glass)', boxShadow: '0 24px 80px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Your twin is ready</p>
          <h2 className="text-4xl font-normal tracking-tight" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>Keep the conversation going.</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Unlock full access to everything your twin can do.</p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLANS.map(plan => (
            <div key={plan.key} className="rounded-2xl p-6 space-y-4"
              style={plan.highlight
                ? { background: 'rgba(196,162,101,0.06)', border: '1px solid rgba(196,162,101,0.3)' }
                : { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)' }}>

              {/* Plan name */}
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-widest"
                  style={{ color: plan.highlight ? 'var(--accent-vibrant)' : 'rgba(255,255,255,0.4)' }}>
                  {plan.name}
                </p>
                {plan.highlight && (
                  <span className="text-xs rounded-full px-2 py-0.5"
                    style={{ background: 'rgba(196,162,101,0.12)', color: '#C4A265' }}>
                    Best value
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-normal" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>{plan.price}</span>
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{plan.period}</span>
              </div>

              {/* Description */}
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{plan.description}</p>

              {/* Features */}
              <ul className="space-y-1.5">
                {plan.features.map(f => (
                  <li key={f} className="text-sm flex gap-2 items-start">
                    <span style={{ color: plan.highlight ? 'var(--accent-vibrant)' : 'rgba(255,255,255,0.4)' }}>&#10003;</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {plan.highlight ? (
                <button onClick={() => upgrade(plan.key)} disabled={loading === plan.key}
                  className="w-full py-3 rounded-xl font-medium text-white disabled:opacity-50 transition-opacity"
                  style={{ background: 'linear-gradient(135deg, #C4A265, #B39255)', boxShadow: '0 4px 20px rgba(196,162,101,0.25)' }}>
                  {loading === plan.key ? 'Loading...' : plan.cta}
                </button>
              ) : (
                <button onClick={() => upgrade(plan.key)} disabled={loading === plan.key}
                  className="w-full py-3 rounded-xl font-medium disabled:opacity-50"
                  style={{ backgroundColor: '#10b77f', color: '#0a0f0a' }}>
                  {loading === plan.key ? 'Loading...' : plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Cancel anytime. Annual plans available — 2 months free.
        </p>
      </div>
    </div>
  );
};

export default PaywallModal;
