// src/components/PaywallModal.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';

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
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
            className="bg-gray-950 border border-gray-800 rounded-3xl p-8 max-w-2xl w-full space-y-8">
            <div className="text-center space-y-2">
              <p className="text-gray-400 text-sm">Want to keep talking?</p>
              <h2 className="text-3xl font-bold text-white">Your twin is ready.</h2>
              <p className="text-gray-400">Continue the conversation and unlock full access.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PLANS.map(plan => (
                <div key={plan.key} className={`rounded-2xl p-6 space-y-4 border ${plan.highlight ? 'bg-indigo-950 border-indigo-500' : 'bg-gray-900 border-gray-700'}`}>
                  <div>
                    <p className="text-white font-bold text-lg">{plan.name}</p>
                    <p className="text-gray-400 text-sm">{plan.description}</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-gray-500">{plan.period}</span>
                  </div>
                  <ul className="space-y-1">
                    {plan.features.map(f => <li key={f} className="text-sm text-gray-300 flex gap-2"><span className="text-indigo-400">✓</span>{f}</li>)}
                  </ul>
                  <button onClick={() => upgrade(plan.key)} disabled={loading === plan.key}
                    className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${plan.highlight ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
                    {loading === plan.key ? 'Loading...' : plan.cta}
                    {plan.highlight && <Zap size={16} />}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-center text-gray-600 text-xs">Cancel anytime. Annual plans available — 2 months free.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PaywallModal;
