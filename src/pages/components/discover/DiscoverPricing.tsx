import { Check } from 'lucide-react';
import { T } from './discoverTokens';

interface DiscoverPricingProps {
  billingAnnual: boolean;
  onToggleBilling: (annual: boolean) => void;
  onNavigate: (path: string) => void;
}

const PLANS = [
  {
    name: 'Free',
    desc: 'Get started discovering yourself',
    price: { monthly: '$0', annual: '$0' },
    sub: 'Free forever',
    features: ['Up to 3 platforms', '1,000 monthly memories', 'Basic twin chat'],
    cta: 'Get started',
    primary: false,
  },
  {
    name: 'Plus',
    desc: 'For those who want depth',
    price: { monthly: '$20/mo', annual: '$15/mo' },
    sub: { monthly: 'Billed monthly', annual: 'Billed annually ($180/yr)' },
    features: ['All platforms connected', 'Unlimited memories', 'Expert reflections', 'Soul signature portrait', 'Goal tracking & nudges'],
    cta: 'Start with Plus',
    primary: true,
  },
  {
    name: 'Pro',
    desc: 'For power users',
    price: { monthly: '$100/mo', annual: '$75/mo' },
    sub: { monthly: 'Billed monthly', annual: 'Billed annually ($900/yr)' },
    features: ['Everything in Plus', 'Unlimited reflections', 'Personality oracle', 'Priority support', 'Early access'],
    cta: 'Start with Pro',
    primary: false,
  },
];

export default function DiscoverPricing({ billingAnnual, onToggleBilling, onNavigate }: DiscoverPricingProps) {
  return (
    <section id="pricing" className="px-6 md:px-[100px] py-24">
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

        {/* Toggle */}
        <div className="flex items-center gap-3 mb-12">
          {['Monthly', 'Annually'].map(label => {
            const active = label === 'Monthly' ? !billingAnnual : billingAnnual;
            return (
              <button
                key={label}
                onClick={() => onToggleBilling(label === 'Annually')}
                className="px-4 py-2 rounded-full text-sm transition-all duration-200"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                  color: active ? '#F5F5F4' : 'rgba(255,255,255,0.4)',
                  border: active ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Plans — clean rows, no cards */}
        <div className="flex flex-col gap-0">
          {PLANS.map(plan => {
            const price = billingAnnual ? plan.price.annual : plan.price.monthly;
            const sub = typeof plan.sub === 'string' ? plan.sub : (billingAnnual ? plan.sub.annual : plan.sub.monthly);

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
                  <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{price}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>
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
                  onClick={() => onNavigate('/auth')}
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
