import { Check } from 'lucide-react';
import { T, AMBER_GLOW_CSS } from './discoverTokens';

interface DiscoverPricingProps {
  billingAnnual: boolean;
  onToggleBilling: (annual: boolean) => void;
  onNavigate: (path: string) => void;
}

export default function DiscoverPricing({
  billingAnnual,
  onToggleBilling,
  onNavigate,
}: DiscoverPricingProps) {
  const bentoStyle = {
    background: T.BENTO_BG,
    border: `1px solid ${T.CARD_BDR}`,
  };

  return (
    <section id="pricing" className="relative px-6 md:px-[100px] py-[37px] mt-[120px] overflow-hidden">
      {/* Amber glow from Figma pricing SVG — rising from bottom center */}
      <div
        className="absolute pointer-events-none overflow-hidden"
        style={{ inset: 0 }}
      >
        <div style={{
          position: 'absolute',
          bottom: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: '1512px', height: '764px',
          opacity: 0.5,
          background: AMBER_GLOW_CSS,
        }} />
      </div>

      {/* Bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: T.CARD_BDR }} />

      <div className="max-w-[1312px] mx-auto flex flex-col items-center gap-7 relative">
        <h2
          className="text-center whitespace-nowrap"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '48px', lineHeight: 1.1,
            letterSpacing: '-0.96px', color: T.FG,
          }}
        >
          Get started today
        </h2>

        {/* Toggle */}
        <div
          className="flex items-center gap-3 h-12 px-[5px] py-1 rounded-[32px]"
          style={{
            background: 'var(--sidebar)',
            border: `1px solid ${T.CARD_BDR}`,
          }}
        >
          {['Monthly', 'Annually'].map(label => {
            const active = label === 'Monthly' ? !billingAnnual : billingAnnual;
            return (
              <button
                key={label}
                onClick={() => onToggleBilling(label === 'Annually')}
                className="flex items-center justify-center w-[120px] h-full rounded-[32px] text-sm transition-all duration-200 ease-out active:scale-[0.97]"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  background: active ? T.FG : 'transparent',
                  color:      active ? T.BG  : T.FG,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Cards */}
        <div className="flex flex-col lg:flex-row w-full">
          {/* Free */}
          <div className="flex flex-col flex-1" style={{ marginRight: '-1px' }}>
            <div className="px-10 py-[23px]" style={{ ...bentoStyle, marginBottom: '-1px' }}>
              <p style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontSize: '20px', lineHeight: 1, color: T.FG }}>Free</p>
              <p className="mt-1 text-xs" style={{ color: T.TEXT_SEC }}>Get started discovering yourself</p>
            </div>
            <div className="flex flex-col gap-6 p-10 flex-1" style={bentoStyle}>
              <div className="flex flex-col gap-2 flex-1">
                <p style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontSize: '24px', lineHeight: 1, color: T.FG }}>$0</p>
                <p className="text-xs" style={{ color: T.TEXT_SEC }}>Free forever, no credit card needed</p>
                <div className="flex flex-col gap-px mt-5">
                  {['Up to 3 platform connections', '1,000 monthly memories', 'Basic twin chat'].map(f => (
                    <div key={f} className="flex items-center gap-2 min-h-[28px] py-0.5">
                      <Check className="w-6 h-6 shrink-0" style={{ color: T.TEXT_SEC }} />
                      <span className="text-xs" style={{ color: T.TEXT_SEC }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => onNavigate('/auth')}
                className="flex items-center justify-center h-10 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  background: T.GHOST_BG,
                  border: `1px solid ${T.CARD_BDR}`,
                  color: T.FG,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Get started
              </button>
            </div>
          </div>

          {/* Plus — elevated */}
          <div className="flex flex-col shrink-0 w-full lg:w-[438px] lg:-my-[26px]" style={{ marginRight: '-1px' }}>
            <div className="px-10 py-[23px]" style={{ ...bentoStyle, marginBottom: '-1px' }}>
              <p style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontSize: '20px', lineHeight: 1, color: T.FG }}>Plus</p>
              <p className="mt-1 text-xs" style={{ color: T.TEXT_SEC }}>For those who want depth</p>
            </div>
            <div className="flex flex-col gap-6 p-10 flex-1" style={bentoStyle}>
              <div className="flex flex-col gap-2 flex-1">
                <p style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontSize: '24px', lineHeight: 1, color: T.FG }}>
                  {billingAnnual ? '$15/mo' : '$20/mo'}
                </p>
                <p className="text-xs" style={{ color: T.TEXT_SEC }}>
                  {billingAnnual ? 'Billed annually ($180/yr)' : 'Billed monthly'}
                </p>
                <div className="flex flex-col gap-px mt-5">
                  {['All platforms connected', 'Unlimited memories', 'Expert reflection engine', 'Soul signature portrait', 'Goal tracking & nudges'].map(f => (
                    <div key={f} className="flex items-center gap-2 min-h-[28px] py-0.5">
                      <Check className="w-6 h-6 shrink-0" style={{ color: T.TEXT_SEC }} />
                      <span className="text-xs" style={{ color: T.TEXT_SEC }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => onNavigate('/auth')}
                className="flex items-center justify-center h-10 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: T.CTA_BG, color: T.CTA_FG, fontFamily: "'Inter', sans-serif" }}
              >
                Start with Plus
              </button>
            </div>
          </div>

          {/* Pro */}
          <div className="flex flex-col flex-1">
            <div className="px-10 py-[23px]" style={{ ...bentoStyle, marginBottom: '-1px' }}>
              <p style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontSize: '20px', lineHeight: 1, color: T.FG }}>Pro</p>
              <p className="mt-1 text-xs" style={{ color: T.TEXT_SEC }}>For power users who want it all</p>
            </div>
            <div className="flex flex-col gap-6 p-10 flex-1" style={bentoStyle}>
              <div className="flex flex-col gap-2 flex-1">
                <p style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontSize: '24px', lineHeight: 1, color: T.FG }}>
                  {billingAnnual ? '$75/mo' : '$100/mo'}
                </p>
                <p className="text-xs" style={{ color: T.TEXT_SEC }}>
                  {billingAnnual ? 'Billed annually ($900/yr)' : 'Billed monthly'}
                </p>
                <div className="flex flex-col gap-px mt-5">
                  {['Everything in Plus', 'Unlimited reflections & insights', 'Personality oracle fine-tuning', 'Priority support', 'Early access to new features'].map(f => (
                    <div key={f} className="flex items-center gap-2 min-h-[28px] py-0.5">
                      <Check className="w-6 h-6 shrink-0" style={{ color: T.TEXT_SEC }} />
                      <span className="text-xs" style={{ color: T.TEXT_SEC }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => onNavigate('/auth')}
                className="flex items-center justify-center h-10 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  background: T.GHOST_BG,
                  border: `1px solid ${T.CARD_BDR}`,
                  color: T.FG,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Start with Pro
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
