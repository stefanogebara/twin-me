import { T, PLATFORM_LOGOS } from './discoverTokens';

const FEATURES = [
  { title: 'Deep Memory',        body: 'Every interaction stored with cognitive-science retrieval weighting — recency, importance, and relevance.' },
  { title: 'Real-time Insights',  body: 'Your twin notices patterns you miss. Proactive insights surface before you ask.' },
  { title: 'Privacy First',       body: 'You control exactly what your twin knows. The privacy spectrum dashboard gives you granular control.' },
  { title: 'Cross-platform',      body: 'Spotify, YouTube, Gmail, Calendar, Discord, LinkedIn, GitHub, Whoop — your digital footprints paint the real picture.' },
];

export default function DiscoverFeatures() {
  return (
    <>
      {/* ── Platform Logos ── */}
      <section className="px-6 md:px-[100px] py-8">
        <p
          className="text-center text-[11px] font-medium tracking-[2px] uppercase mb-8"
          style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
        >
          Your data, your insights — powered by
        </p>
        <div className="flex items-center justify-center gap-10 md:gap-16 flex-wrap">
          {PLATFORM_LOGOS.map(name => (
            <span
              key={name}
              className="text-sm opacity-40"
              style={{ color: T.FG, fontFamily: "'Inter', sans-serif" }}
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-[800px] mx-auto h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* ── Features ── */}
      <section id="features" className="px-6 md:px-[100px] py-20">
        <div className="max-w-[800px] mx-auto">

          <p
            className="text-[11px] font-medium tracking-[2px] uppercase mb-6"
            style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
          >
            Features
          </p>

          <h2
            className="mb-12"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '42px',
              lineHeight: 1.15,
              letterSpacing: '-0.84px',
              color: T.FG,
            }}
          >
            Built for real self-knowledge.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-14">
            {FEATURES.map(({ title, body }) => (
              <div key={title}>
                <h3
                  className="mb-2"
                  style={{
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    fontSize: '18px',
                    fontWeight: 500,
                    color: T.FG,
                  }}
                >
                  {title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.55)' }}
                >
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
