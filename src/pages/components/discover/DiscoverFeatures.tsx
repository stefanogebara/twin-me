import { TrendingUp, Zap, Shield, Puzzle } from 'lucide-react';
import { T, PLATFORM_LOGOS } from './discoverTokens';

const FEATURES = [
  { icon: TrendingUp, title: 'Deep Memory',        body: 'Every interaction stored with cognitive-science retrieval weighting — recency, importance, and relevance.' },
  { icon: Zap,        title: 'Real-time Insights',  body: 'Your twin notices patterns you miss. Proactive insights surface before you ask.' },
  { icon: Shield,     title: 'Privacy First',        body: 'You control exactly what your twin knows. The privacy spectrum dashboard gives you granular control.' },
  { icon: Puzzle,     title: 'Cross-platform',       body: 'Spotify, YouTube, Discord, LinkedIn, Whoop — your digital footprints paint the real picture.' },
];

export default function DiscoverFeatures() {
  const glassStyle = {
    background: T.CARD_BG,
    border: `1px solid ${T.CARD_BDR}`,
  };
  const bentoStyle = {
    background: T.BENTO_BG,
    border: `1px solid ${T.CARD_BDR}`,
  };

  return (
    <>
      {/* ══ TRUST LOGOS ══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Edge fades */}
        <div className="absolute left-0 top-0 bottom-0 w-32 pointer-events-none z-10"
          style={{ background: `linear-gradient(to right, ${T.BG}, transparent)` }} />
        <div className="absolute right-0 top-0 bottom-0 w-32 pointer-events-none z-10"
          style={{ background: `linear-gradient(to left, ${T.BG}, transparent)` }} />

        <div className="flex flex-col items-center gap-12 w-full px-6 md:px-[100px]">
          <div
            className="inline-flex items-center justify-center px-9 py-5 rounded-[32px] text-sm"
            style={{ ...glassStyle, color: T.FG, fontFamily: "'Inter', sans-serif" }}
          >
            Trusted by your favourite platforms
          </div>

          <div className="flex items-center justify-center gap-16 flex-wrap pb-4">
            {PLATFORM_LOGOS.map(name => (
              <span
                key={name}
                className="text-sm font-semibold tracking-wide opacity-50"
                style={{ color: T.FG }}
              >
                {name}
              </span>
            ))}
          </div>

          <div className="w-full h-px" style={{ background: T.CARD_BDR }} />
        </div>
      </section>

      {/* ══ FEATURES ═════════════════════════════════════════════════════ */}
      <section id="features" className="px-6 md:px-[100px] mt-[80px]">
        <div className="max-w-[1312px] mx-auto flex flex-col items-center gap-[42px]">

          <div
            className="inline-flex items-center justify-center px-9 py-5 rounded-[32px] text-sm"
            style={{ ...glassStyle, color: T.FG, fontFamily: "'Inter', sans-serif" }}
          >
            Product overview
          </div>

          <div className="relative flex items-center justify-center">
            <div
              className="absolute pointer-events-none"
              style={{
                width: '513px', height: '97px',
                top: '9px', left: '50%',
                transform: 'translateX(-50%)',
                background: 'radial-gradient(ellipse at 50% 50%, rgba(232,224,212,0.45) 0%, rgba(224,129,22,0.3) 40%, transparent 75%)',
                filter: 'blur(24px)',
                opacity: 1,
              }}
            />
            <h2
              className="relative text-center max-w-[641px]"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '48px', lineHeight: 1.1,
                letterSpacing: '-0.96px', color: T.FG,
              }}
            >
              Your soul, mapped from real data
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex flex-col gap-6 p-6 md:p-10"
                style={{
                  ...bentoStyle,
                  borderRadius: 0,
                }}
              >
                <div
                  className="flex items-center justify-center p-2 rounded-full w-fit"
                  style={{ border: `1px solid ${T.CARD_BDR}` }}
                >
                  <Icon className="w-6 h-6" style={{ color: T.TEXT_SEC }} />
                </div>
                <div className="flex flex-col gap-2">
                  <p style={{
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    fontSize: '24px', lineHeight: 1, color: T.FG,
                  }}>
                    {title}
                  </p>
                  <p style={{ color: T.TEXT_SEC, fontSize: '14px', lineHeight: 1.25 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
