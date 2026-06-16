import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gauge, Compass, MoonStar, Search } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

/**
 * "What your twin sees" — the PULL surface for first-party self-revelations.
 *
 * These are the patterns the interrupt-Editor (correctly) holds back from the
 * chat feed because they are sustained truths, not timely nags. Here the user
 * came to look, so we show them: read back in the narrative voice, on glass.
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

  return (
    <section className="mb-12">
      <h2
        className="text-[11px] uppercase tracking-[0.15em] font-medium mb-4"
        style={{ color: 'var(--text-narrative-muted)' }}
      >
        What your twin sees
      </h2>

      <div className="flex flex-col gap-3">
        {revelations.map((r) => (
          <div
            key={r.kind}
            className="rounded-[20px] px-5 py-4 backdrop-blur-[42px]"
            style={{
              background: 'var(--glass-surface-bg)',
              border: '1px solid var(--glass-surface-border)',
              boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-2 mb-2.5" style={{ color: 'var(--accent-vibrant)' }}>
              {KIND_ICON[r.kind] ?? <Gauge className="w-4 h-4" />}
              <span
                className="text-[11px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--text-muted)' }}
              >
                {r.title}
              </span>
            </div>

            <p
              className="text-[19px] leading-snug"
              style={{
                color: 'var(--text-narrative)',
                fontFamily: "'Instrument Serif', serif",
                letterSpacing: '-0.01em',
              }}
            >
              {r.body}
            </p>

            <p className="text-[11px] mt-3" style={{ color: 'var(--text-narrative-muted)' }}>
              {SOURCE_LABEL[r.source] ?? r.source}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
