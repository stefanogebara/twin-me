import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Get to know your twin',
    features: [
      '50 chat messages / month',
      '3 platform connections',
      'Basic soul signature',
      '10 reflections / month',
    ],
    cta: 'Current plan',
    ctaDisabled: true,
    highlight: false,
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '$20',
    period: '/ month',
    description: 'Go deeper into who you are',
    features: [
      '500 chat messages / month',
      'All platform connections',
      'Full soul signature',
      'Unlimited reflections',
      'Morning briefings',
      'Proactive insights',
    ],
    cta: 'Upgrade to Plus',
    ctaDisabled: false,
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$100',
    period: '/ month',
    description: 'The complete soul signature experience',
    features: [
      'Unlimited messages',
      'All platform connections',
      'Advanced personality oracle',
      'Twin goals + auto-tracking',
      'WhatsApp twin access',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    ctaDisabled: false,
    highlight: false,
  },
];

const PricingPage: React.FC = () => {
  const navigate = useNavigate();

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
          {PLANS.map((plan) => (
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
                disabled={plan.ctaDisabled}
                onClick={() => {
                  if (!plan.ctaDisabled) {
                    // Stripe checkout goes here when billing is wired
                    navigate('/settings');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  borderRadius: '100px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: plan.ctaDisabled ? 'default' : 'pointer',
                  transition: 'opacity 0.15s',
                  ...(plan.ctaDisabled
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
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p
          className="text-center mt-8 cursor-pointer hover:opacity-80"
          style={{ fontSize: '13px', color: 'rgba(245,245,244,0.3)' }}
          onClick={() => navigate(-1)}
        >
          Back to settings
        </p>
      </div>
    </div>
  );
};

export default PricingPage;
