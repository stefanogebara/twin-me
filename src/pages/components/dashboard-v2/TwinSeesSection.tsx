import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gauge, Compass, MoonStar, Search, Activity } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

/**
 * "What your twin sees" — the PULL surface for first-party self-revelations.
 *
 * These are the patterns the interrupt-Editor (correctly) holds back from the
 * chat feed because they are sustained truths, not timely nags. Here the user
 * came to look, so we show them — read back in the narrative voice on liquid
 * glass: neutral frosted panels with a faint specular light drifting behind
 * them and a soft sheen riding across the focal card. One rotating hero carries
 * the weight; the rest sit smaller beneath it.
 * Backed by GET /api/revelations (first-party only: browser extension +
 * desktop window-mirroring; no third-party APIs).
 */
interface Revelation {
  kind: string;
  title: string;
  body: string;
  source: string;
}

const KIND_ICON: Record<string, ReactNode> = {
  attention_gravity: <Gauge className="w-4 h-4" />,
  curiosity_signature: <Compass className="w-4 h-4" />,
  day_night_self: <MoonStar className="w-4 h-4" />,
  sticking_point: <Search className="w-4 h-4" />,
  focus_shape: <Activity className="w-4 h-4" />,
};

const SOURCE_LABEL: Record<string, string> = {
  web: 'From your browsing',
  desktop: 'From your desktop',
};

// Liquid glass: neutral specular light drifting behind frosted panels, a sheen
// sweeping across the focal card, cards rising on mount + a gentle float. All
// motion is disabled under prefers-reduced-motion.
const MOTION_CSS = `
@keyframes tsLight1 {0%{transform:translate(0,0) scale(1)}100%{transform:translate(10%,8%) scale(1.25)}}
@keyframes tsLight2 {0%{transform:translate(0,0) scale(1.1)}100%{transform:translate(-8%,-6%) scale(1)}}
@keyframes tsSheen {0%{transform:translateX(-130%) rotate(8deg)}60%,100%{transform:translateX(260%) rotate(8deg)}}
@keyframes tsFloat {0%{transform:translateY(0)}100%{transform:translateY(-6px)}}
@keyframes tsRise {from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.ts-light{position:absolute;border-radius:50%;filter:blur(70px);will-change:transform;pointer-events:none}
@media (prefers-reduced-motion: reduce){
  .ts-light,.ts-hero,.ts-card{animation:none !important;opacity:1 !important;transform:none !important}
  .ts-sheen{display:none !important}
}
`;

const GLASS: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  background: 'rgba(255,255,255,0.08)',
  backdropFilter: 'blur(40px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 22,
  boxShadow:
    '0 14px 44px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -1px 0 rgba(255,255,255,0.05)',
};

function RevelationCard({ rev, hero = false }: { rev: Revelation; hero?: boolean }) {
  return (
    <div
      className={hero ? 'ts-hero' : 'ts-card'}
      style={{
        ...GLASS,
        padding: hero ? '24px 26px' : '18px 20px',
        ...(hero
          ? { maxWidth: 580, animation: 'tsRise .7s ease both, tsFloat 7s ease-in-out infinite alternate' }
          : { flex: 1, minWidth: 240, animation: 'tsRise .7s .15s ease both' }),
      }}
    >
      {hero && (
        <div
          className="ts-sheen"
          aria-hidden
          style={{
            position: 'absolute',
            top: '-40%',
            left: 0,
            width: '36%',
            height: '180%',
            zIndex: 0,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)',
            filter: 'blur(6px)',
            pointerEvents: 'none',
            animation: 'tsSheen 9s ease-in-out infinite',
          }}
        />
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--accent-vibrant)', marginBottom: hero ? 14 : 10 }}>
          {KIND_ICON[rev.kind] ?? <Gauge className="w-4 h-4" />}
          <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            {rev.title}
          </span>
        </div>

        <p
          style={{
            fontFamily: "'Instrument Serif', serif",
            letterSpacing: '-0.01em',
            fontSize: hero ? 25 : 18,
            lineHeight: hero ? 1.24 : 1.3,
            color: hero ? 'var(--text-narrative)' : 'var(--text-narrative-secondary)',
          }}
        >
          {rev.body}
        </p>

        {hero && (
          <p className="text-[11px]" style={{ marginTop: 16, color: 'var(--text-narrative-muted)' }}>
            {SOURCE_LABEL[rev.source] ?? rev.source}
          </p>
        )}
      </div>
    </div>
  );
}

async function fetchRevelations(): Promise<Revelation[]> {
  const res = await authFetch('/revelations');
  if (!res.ok) throw new Error(`revelations ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data?.revelations) ? json.data.revelations : [];
}

export function TwinSeesSection() {
  const { data: revelations } = useQuery({
    queryKey: ['revelations'],
    queryFn: fetchRevelations,
    staleTime: 1000 * 60 * 30, // the server caches ~12h; don't refetch on every mount
    retry: false,
  });

  // Self-hiding: render nothing until there's something true to show.
  if (!revelations || revelations.length === 0) return null;

  // Rotate the focal card daily so every revelation gets the spotlight in turn.
  const heroIndex = Math.floor(Date.now() / 86_400_000) % revelations.length;
  const hero = revelations[heroIndex];
  const supporting = revelations.filter((_, i) => i !== heroIndex).slice(0, 2);

  return (
    <section
      className="mb-12"
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 24,
        padding: '32px 30px 36px',
        background: 'rgba(19,18,26,0.42)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <style>{MOTION_CSS}</style>

      {/* Neutral specular light drifting behind the glass — no colour. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div className="ts-light" style={{ width: '60%', height: '60%', left: '-8%', top: '-20%', background: 'rgba(255,255,255,0.07)', animation: 'tsLight1 30s ease-in-out infinite alternate' }} />
        <div className="ts-light" style={{ width: '54%', height: '54%', right: '-10%', bottom: '-24%', background: 'rgba(214,222,235,0.06)', animation: 'tsLight2 36s ease-in-out infinite alternate' }} />
      </div>

      <div style={{ position: 'relative' }}>
        <h2 className="text-[11px] uppercase tracking-[0.15em] font-medium" style={{ color: 'var(--text-narrative-muted)', marginBottom: 8 }}>
          What your twin sees
        </h2>
        <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, letterSpacing: '-0.02em', color: 'var(--text-narrative-secondary)', marginBottom: 22 }}>
          Your patterns, read back to you
        </p>

        <RevelationCard rev={hero} hero />

        {supporting.length > 0 && (
          <div className="flex gap-3.5 flex-wrap" style={{ marginTop: 16 }}>
            {supporting.map((r) => (
              <RevelationCard key={r.kind} rev={r} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
