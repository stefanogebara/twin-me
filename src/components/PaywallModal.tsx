// src/components/PaywallModal.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

const PLANS = [
  {
    key: 'pro', name: 'Pro', price: '$19', period: '/mo',
    description: 'The ongoing twin relationship',
    features: ['Unlimited twin chat', '3 platform integrations', '30-day rolling memory', 'Expert personas', 'Weekly email digest'],
    cta: 'Start with Pro', highlight: false,
  },
  {
    key: 'max', name: 'Max', price: '$50', period: '/mo',
    description: 'The deepest mirror',
    features: ['Everything in Pro', 'All integrations', 'Full memory history', 'Best models', 'Health + wearables + location'],
    cta: 'Go Max', highlight: true,
  },
];

interface Props { isOpen: boolean; }

const PaywallModal: React.FC<Props> = ({ isOpen }) => {
  const [loading, setLoading] = useState<string | null>(null);

  const upgrade = async (plan: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    setLoading(plan);
    try {
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally { setLoading(null); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}>
          <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
            className="max-w-xl w-full rounded-3xl p-8 space-y-8"
            style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 24px 80px rgba(0,0,0,0.15)' }}>

            {/* Header */}
            <div className="text-center space-y-2">
              <p className="text-xs uppercase tracking-widest" style={{ color: '#8A857D' }}>Your twin is ready</p>
              <h2 className="heading-serif text-4xl font-normal tracking-tight">Keep the conversation going.</h2>
              <p className="text-sm" style={{ color: '#8A857D' }}>Unlock full access to everything your twin can do.</p>
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PLANS.map(plan => (
                <div key={plan.key} className="rounded-2xl p-6 space-y-4"
                  style={plan.highlight
                    ? { background: 'rgba(196,162,101,0.06)', border: '1px solid rgba(196,162,101,0.3)' }
                    : { background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.08)' }}>

                  {/* Plan name */}
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium uppercase tracking-widest"
                      style={{ color: plan.highlight ? '#C4A265' : '#8A857D' }}>
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
                    <span className="heading-serif text-4xl font-normal">{plan.price}</span>
                    <span className="text-sm" style={{ color: '#8A857D' }}>{plan.period}</span>
                  </div>

                  {/* Description */}
                  <p className="text-sm" style={{ color: '#8A857D' }}>{plan.description}</p>

                  {/* Features */}
                  <ul className="space-y-1.5">
                    {plan.features.map(f => (
                      <li key={f} className="text-sm flex gap-2 items-start">
                        <span style={{ color: plan.highlight ? '#C4A265' : '#8A857D' }}>✓</span>
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
                      className="btn-cta w-full disabled:opacity-50">
                      {loading === plan.key ? 'Loading...' : plan.cta}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <p className="text-xs text-center" style={{ color: '#8A857D' }}>
              Cancel anytime. Annual plans available — 2 months free.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PaywallModal;
