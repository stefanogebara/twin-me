import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gauge, Compass, MoonStar, Search } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

/**
 * "What your twin sees" — the PULL surface for first-party self-revelations.
 *
 * These are the patterns the interrupt-Editor (correctly) holds back from the
 * chat feed because they are sustained truths, not timely nags. Here the user
 * came to look, so we show them — read back in the narrative voice on glass,
 * over a living, slowly-drifting backdrop. One rotating focal card carries the
 * weight; the rest sit smaller beneath it, so it lands as a moment, not a wall.
 * Backed by GET /api/revelations (browser-extension data only — first-party).
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
};

const SOURCE_LABEL: Record<string, string> = {
  web: 'From your browsing',
};

// Motion + the living backdrop. Drift loops are long + offset so the glow never
// feels synchronized; cards rise on mount and the hero gently floats. All of it
// is disabled under prefers-reduced-motion.
const MOTION_CSS = `
@keyframes tsDrift1 {0%{transform:translate(0,0) scale(1)}100%{transform:translate(7%,-5%) scale(1.18)}}
@keyframes tsDrift2 {0%{transform:translate(0,0) scale(1.12)}100%{transform:translate(-6%,6%) scale(1)}}
@keyframes tsDrift3 {0%{transform:translate(0,0) scale(1)}100%{transform:translate(5%,7%) scale(1.22)}}
@keyframes tsFloat {0%{transform:translateY(0)}100%{transform:translateY(-7px)}}
@keyframes tsRise {from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.ts-orb{position:absolute;border-radius:50%;filter:blur(64px);will-change:transform}
@media (prefers-reduced-motion: reduce){
  .ts-orb,.ts-hero,.ts-card{animation:none !important;opacity:1 !important;transform:none !important}
}
`;

function RevelationCard({ rev, hero = false }: { rev: Revelation; hero?: boolean }) {
  return (
    <div
      className={hero ? 'ts-hero' : 'ts-card'}
      style={{
        background: 'var(--glass-surface-bg)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid var(--glass-surface-border)',
        borderRadius: 20,
        boxShadow: '0 10px 34px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.06)',
        padding: hero ? '24px 26px' : '18px 20px',
        ...(hero
          ? { maxWidth: 580, animation: 'tsRise .7s ease both, tsFloat 7s ease-in-out infinite alternate' }
          : { flex: 1, minWidth: 240, animation: 'tsRise .7s .15s ease both' }),
      }}
    >
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

  // Rotate the focal card daily so every revelation gets the spotlight in turn,
  // and the surface feels alive across visits rather than static.
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
        border: '1px solid var(--glass-surface-border)',
      }}
    >
      <style>{MOTION_CSS}</style>

      {/* Living, drifting backdrop — our sun-driven amber/copper/purple, dimmed
          behind a scrim so the glass cards stay readable on top. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div className="ts-orb" style={{ width: '62%', height: '62%', left: '-12%', top: '-20%', background: 'rgba(210,145,55,0.38)', animation: 'tsDrift1 28s ease-in-out infinite alternate' }} />
        <div className="ts-orb" style={{ width: '56%', height: '56%', right: '-14%', top: '-12%', background: 'rgba(180,110,65,0.30)', animation: 'tsDrift2 33s ease-in-out infinite alternate' }} />
        <div className="ts-orb" style={{ width: '66%', height: '66%', left: '6%', bottom: '-30%', background: 'rgba(160,95,55,0.32)', animation: 'tsDrift3 37s ease-in-out infinite alternate' }} />
        <div className="ts-orb" style={{ width: '50%', height: '50%', right: '-6%', bottom: '-14%', background: 'rgba(62,50,150,0.26)', animation: 'tsDrift1 41s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(19,18,26,0.34)' }} />
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
