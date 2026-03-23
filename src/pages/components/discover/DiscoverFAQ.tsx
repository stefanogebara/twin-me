import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { T, FAQ_ITEMS, FAQ_ANSWERS } from './discoverTokens';

interface DiscoverFAQProps {
  onNavigate: (path: string) => void;
}

export default function DiscoverFAQ({ onNavigate }: DiscoverFAQProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const glassStyle = {
    background: T.CARD_BG,
    border: `1px solid ${T.CARD_BDR}`,
  };
  const bentoStyle = {
    background: T.BENTO_BG,
    border: `1px solid ${T.CARD_BDR}`,
  };

  return (
    <section id="faq" className="px-6 md:px-[100px] mt-[120px] mb-[120px]">
      <div className="max-w-[1312px] mx-auto flex flex-col items-center gap-14">

        <div
          className="inline-flex items-center justify-center px-9 py-5 rounded-[32px] text-sm"
          style={{ ...glassStyle, color: T.FG, fontFamily: "'Inter', sans-serif" }}
        >
          FAQ
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-start w-full">

          {/* Left — CTA */}
          <div className="flex-1 flex flex-col gap-4 px-4 md:px-[60px] py-[10px] relative">
            <div
              className="absolute pointer-events-none"
              style={{
                width: '280px', height: '48px',
                top: '16px', left: '60px',
                background: 'radial-gradient(ellipse at 40% 50%, rgba(232,224,212,0.35) 0%, transparent 70%)',
                filter: 'blur(20px)',
                opacity: 1,
              }}
            />
            <h2
              className="relative"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '48px', lineHeight: 1.1,
                letterSpacing: '-0.96px', color: T.FG,
              }}
            >
              Ready to get started?
            </h2>
            <p className="text-sm" style={{ color: T.TEXT_SEC, lineHeight: 1.25 }}>
              We'll be here once you're ready
            </p>
            <button
              onClick={() => onNavigate('/auth')}
              className="flex items-center justify-center h-10 px-4 rounded-[100px] text-sm font-medium w-fit transition-opacity hover:opacity-90"
              style={{ background: T.CTA_BG, color: T.CTA_FG, fontFamily: "'Inter', sans-serif" }}
            >
              Start creating
            </button>
          </div>

          {/* Right — FAQ accordion */}
          <div className="flex-1 flex flex-col" style={{ marginBottom: '-1px' }}>
            {FAQ_ITEMS.map(({ q }, i) => (
              <div
                key={q}
                className="cursor-pointer"
                style={{ ...bentoStyle, marginBottom: '-1px', borderRadius: 0 }}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <div className="flex items-center justify-between p-6 gap-4">
                  <p style={{
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '16px', lineHeight: 1, color: T.FG,
                  }}>
                    {q}
                  </p>
                  <ChevronDown
                    className="w-4 h-4 shrink-0 transition-transform"
                    style={{
                      color: T.TEXT_PH,
                      transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </div>
                {openFaq === i && FAQ_ANSWERS[q] && (
                  <p className="px-6 pb-6 text-sm" style={{ color: T.TEXT_SEC, lineHeight: 1.5 }}>
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
