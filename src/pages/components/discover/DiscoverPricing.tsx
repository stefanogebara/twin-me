import { Check } from 'lucide-react';
import { T } from './discoverTokens';

interface DiscoverPricingProps {
  onNavigate: (path: string) => void;
}

// Feature claims mirror the enforced PLAN_LIMITS in
// api/services/subscriptionService.js — free: 100 msgs / 2 platforms / 7-day
// memory; pro ("Plus"): 1500 msgs / 5 platforms / 90-day memory; max ("Pro"):
// unlimited. Monthly billing only — no annual checkout exists (audit-2026-06-10).
const PLANS = [
  {
    name: 'Free',
    desc: 'Get started discovering yourself',
    price: '$0',
    sub: 'Free forever',
    features: ['100 chat messages / month', '2 platform connections', '7-day memory window'],
    cta: 'Get started',
    primary: false,
  },
  {
    name: 'Plus',
    desc: 'For those who want depth',
    price: '$20/mo',
    sub: 'Billed monthly',
    features: ['1,500 chat messages / month', '5 platform connections', '90-day memory window', 'Expert reflections', 'Morning briefings'],
    cta: 'Start with Plus',
    primary: true,
  },
  {
    name: 'Pro',
    desc: 'For power users',
    price: '$100/mo',
    sub: 'Billed monthly',
    features: ['Unlimited messages', 'All platform connections', 'Full memory history', 'Best AI models', 'Priority support'],
    cta: 'Start with Pro',
    primary: false,
  },
];

export default function DiscoverPricing({ onNavigate }: DiscoverPricingProps) {
  return (
    <section id="pricing" className="px-6 md:px-[100px] py-20">
      <div className="max-w-[800px] mx-auto">

        <p
          className="text-[11px] font-medium tracking-[2px] uppercase mb-6"
          style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
        >
          Pricing
        </p>

        <h2
          className="mb-4"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '42px', lineHeight: 1.15,
            letterSpacing: '-0.84px', color: T.FG,
          }}
        >
          Simple, transparent pricing.
        </h2>

        <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
          Start free. Upgrade when you want more depth.
        </p>

        {/* Plans — clean rows, no cards */}
        <div className="flex flex-col gap-0">
          {PLANS.map(plan => {
            return (
              <div
                key={plan.name}
                className="flex flex-col md:flex-row md:items-center gap-6 py-8"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                {/* Name + Price */}
                <div className="md:w-[200px] flex-shrink-0">
                  <p className="text-lg font-medium" style={{ color: '#F5F5F4', fontFamily: "'Geist', 'Inter', sans-serif" }}>
                    {plan.name}
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{plan.price}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{plan.sub}</p>
                </div>

                {/* Features */}
                <div className="flex-1 flex flex-wrap gap-x-6 gap-y-2">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>{f}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => onNavigate(`/auth?plan=${plan.name.toLowerCase()}`)}
                  className="flex-shrink-0 px-5 py-2 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    background: plan.primary ? '#F5F5F4' : 'rgba(255,255,255,0.08)',
                    color: plan.primary ? '#110f0f' : '#F5F5F4',
                    border: plan.primary ? 'none' : '1px solid rgba(255,255,255,0.10)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {plan.cta}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
