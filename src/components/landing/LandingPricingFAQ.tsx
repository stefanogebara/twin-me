import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/* Pricing + FAQ for the single front door (2026-08 hero inversion — ported
 * from the retired /discover landing, restyled onto Claura). */

// Feature claims mirror the enforced PLAN_LIMITS in
// api/services/subscriptionService.js — free: 100 msgs / 2 platforms / 7-day
// memory; pro ("Plus"): 1500 msgs / 5 platforms / 90-day memory; max ("Pro"):
// unlimited. Monthly billing only — no annual checkout exists (audit-2026-06-10).
const PLANS = [
  {
    name: 'Free',
    price: '$0',
    sub: 'Free forever',
    features: ['100 chat messages / month', '2 platform connections', '7-day memory window'],
    cta: 'Get started',
    primary: false,
  },
  {
    name: 'Plus',
    price: '$20/mo',
    sub: 'Billed monthly',
    features: ['1,500 chat messages / month', '5 platform connections', '90-day memory window', 'Expert reflections', 'Morning briefings'],
    cta: 'Start with Plus',
    primary: true,
  },
  {
    name: 'Pro',
    price: '$100/mo',
    sub: 'Billed monthly',
    features: ['Unlimited messages', 'All platform connections', 'Full memory history', 'Best AI models', 'Priority support'],
    cta: 'Start with Pro',
    primary: false,
  },
];

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: 'What is a soul signature?',
    a: 'Your soul signature is a living AI portrait of your authentic self — patterns, preferences, and personality traits derived from how you actually behave across platforms.',
  },
  {
    q: 'How is my data used?',
    a: 'Your data never leaves our secure infrastructure and is never used to train AI models. You own your soul signature completely.',
  },
  {
    q: 'What platforms can I connect?',
    a: 'Spotify, Google Calendar, YouTube, Gmail, GitHub, and Whoop. Plus a browser extension and desktop app that capture your real activity as it happens.',
  },
  {
    q: 'How accurate is the twin?',
    a: 'Twin accuracy improves over time as memories accumulate. Most users notice meaningful personality alignment within a few days of connecting platforms.',
  },
  {
    q: 'Can I delete my data?',
    a: 'Yes. You can delete any memory, any platform connection, or your entire soul signature at any time from Settings.',
  },
  {
    q: 'Does TwinMe train AI on my data?',
    a: 'Never. Your memories are yours alone. They are used only to power your personal twin, nothing else.',
  },
  {
    q: 'How long until my twin feels like me?',
    a: 'Connect 2–3 platforms and chat for a day — most users feel the difference immediately. The twin deepens over weeks.',
  },
];

interface SectionProps {
  onNavigate: (path: string) => void;
}

export function LandingPricing({ onNavigate }: SectionProps) {
  return (
    <section id="pricing" className="px-6 lg:px-16 py-24 relative">
      <div className="max-w-[880px] mx-auto relative z-10">
        <span className="font-sans bg-white/[0.04] border border-white/[0.08] rounded-lg py-1.5 px-3.5 text-xs font-normal text-[var(--text-secondary)] inline-block mb-5">Pricing</span>
        <h2 className="text-[36px] md:text-[56px] font-heading font-normal tracking-[-0.02em] mb-4">
          Simple, transparent <span className="font-heading font-normal italic">pricing.</span>
        </h2>
        <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65] mb-10">
          Start free. Upgrade when you want more depth.
        </p>

        {/* Plans — clean rows, no cards */}
        <div className="flex flex-col">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="flex flex-col md:flex-row md:items-center gap-6 py-8 border-b border-[var(--border-glass)]"
            >
              <div className="md:w-[180px] shrink-0">
                <p className="font-sans text-lg font-medium text-[var(--text-primary)]">{plan.name}</p>
                <p className="font-sans text-sm text-[var(--text-secondary)] mt-1">{plan.price}</p>
                <p className="font-sans text-xs text-[var(--text-muted)] mt-0.5">{plan.sub}</p>
              </div>

              <div className="flex-1 flex flex-wrap gap-x-6 gap-y-2">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span className="font-sans text-sm text-[var(--text-secondary)]">{f}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onNavigate(`/auth?plan=${plan.name.toLowerCase()}`)}
                className={plan.primary ? 'claura-btn-primary shrink-0' : 'claura-btn-glass shrink-0'}
                style={{ padding: '10px 18px', fontSize: 13 }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingFAQ({ onNavigate }: SectionProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section id="faq" className="px-6 lg:px-16 py-24 relative">
      <div className="max-w-[880px] mx-auto relative z-10 flex flex-col md:flex-row gap-12 md:gap-16">
        {/* Left — heading + CTA */}
        <div className="flex-1 flex flex-col items-start gap-4">
          <span className="font-sans bg-white/[0.04] border border-white/[0.08] rounded-lg py-1.5 px-3.5 text-xs font-normal text-[var(--text-secondary)] inline-block">FAQ</span>
          <h2 className="text-[36px] md:text-[48px] font-heading font-normal tracking-[-0.02em]">
            Common questions
          </h2>
          <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65] mb-2">
            Everything you need to know about TwinMe.
          </p>
          <button
            onClick={() => onNavigate('/auth')}
            className="claura-btn-primary"
            style={{ padding: '10px 18px', fontSize: 13 }}
          >
            Get your Soul Signature
          </button>
        </div>

        {/* Right — accordion, borders only */}
        <div className="flex-1 flex flex-col">
          {FAQ_ITEMS.map(({ q, a }, i) => {
            const isOpen = openFaq === i;
            return (
              <div key={q} className="border-b border-[var(--border-glass)]">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  className="flex items-center justify-between py-5 gap-4 w-full text-left cursor-pointer"
                >
                  <span className="font-sans text-[15px] font-normal text-[var(--text-primary)]">{q}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="w-4 h-4 shrink-0 transition-transform duration-200 text-[var(--text-muted)]"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>
                {isOpen && (
                  <p id={`faq-answer-${i}`} role="region" className="pb-5 font-sans text-sm leading-relaxed text-[var(--text-muted)]">
                    {a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
