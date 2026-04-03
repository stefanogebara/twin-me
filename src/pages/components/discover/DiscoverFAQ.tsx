import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { T, FAQ_ITEMS, FAQ_ANSWERS } from './discoverTokens';

interface DiscoverFAQProps {
  onNavigate: (path: string) => void;
}

export default function DiscoverFAQ({ onNavigate }: DiscoverFAQProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section id="faq" className="px-6 md:px-[100px] py-24">
      <div className="max-w-[800px] mx-auto">

        <div className="flex flex-col md:flex-row gap-16">

          {/* Left — CTA */}
          <div className="flex-1 flex flex-col gap-4">
            <p
              className="text-[11px] font-medium tracking-[2px] uppercase mb-2"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
            >
              FAQ
            </p>
            <h2
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '36px', lineHeight: 1.15,
                letterSpacing: '-0.72px', color: T.FG,
              }}
            >
              Common questions
            </h2>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
              Everything you need to know about TwinMe
            </p>
            <button
              onClick={() => onNavigate('/auth')}
              className="flex items-center justify-center h-10 px-5 rounded-[100px] text-sm font-medium w-fit transition-opacity hover:opacity-90"
              style={{ background: '#F5F5F4', color: '#110f0f', fontFamily: "'Inter', sans-serif" }}
            >
              Get started
            </button>
          </div>

          {/* Right — FAQ accordion (no cards, just borders) */}
          <div className="flex-1 flex flex-col">
            {FAQ_ITEMS.map(({ q }, i) => (
              <div
                key={q}
                className="cursor-pointer"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <div className="flex items-center justify-between py-5 gap-4">
                  <p style={{
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    fontSize: '15px', fontWeight: 400, color: T.FG,
                  }}>
                    {q}
                  </p>
                  <ChevronDown
                    className="w-4 h-4 shrink-0 transition-transform duration-200"
                    style={{
                      color: 'rgba(255,255,255,0.3)',
                      transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </div>
                {openFaq === i && FAQ_ANSWERS[q] && (
                  <p className="pb-5 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {FAQ_ANSWERS[q]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
