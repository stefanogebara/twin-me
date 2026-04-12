import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';

interface SoulLayers {
  taste?: { statement?: string; topSignals?: string[] };
  values?: { values?: { name: string; strength: number }[] };
  rhythms?: { chronotype?: string; peakHours?: string; summary?: string };
  connections?: { style?: string; summary?: string };
  growthEdges?: { summary?: string };
}

interface SoulSignatureResponse {
  success: boolean;
  data?: {
    layers?: SoulLayers;
    generatedAt?: string;
    cached?: boolean;
  };
}

export function SoulSummaryCard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<SoulSignatureResponse>({
    queryKey: ['soul-summary-card', user?.id],
    queryFn: async () => {
      const res = await authFetch('/soul-signature/layers');
      if (!res.ok) throw new Error('Failed to fetch soul signature layers');
      return res.json() as Promise<SoulSignatureResponse>;
    },
    staleTime: 12 * 60 * 60 * 1000,
    retry: false,
    enabled: !!user?.id,
    gcTime: 12 * 60 * 60 * 1000,
  });

  const layers = data?.data?.layers;
  const tasteStatement = layers?.taste?.statement;
  const topValues = (layers?.values?.values ?? []).slice(0, 3).map(v => v.name);
  const rawChronotype = layers?.rhythms?.chronotype;
  const chronotype = rawChronotype
    ? rawChronotype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : undefined;

  if (isLoading) {
    return (
      <div
        className="rounded-[20px] px-5 py-5 backdrop-blur-[42px]"
        style={{
          background: 'var(--glass-surface-bg)',
          border: '1px solid var(--glass-surface-border)',
          boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div className="h-4 w-2/3 rounded bg-white/[0.06] animate-pulse mb-3" />
        <div className="h-3 w-full rounded bg-white/[0.04] animate-pulse mb-2" />
        <div className="h-3 w-5/6 rounded bg-white/[0.04] animate-pulse" />
      </div>
    );
  }

  if (!tasteStatement) {
    return (
      <div
        className="rounded-[20px] px-5 py-5 backdrop-blur-[42px]"
        style={{
          background: 'var(--glass-surface-bg)',
          border: '1px solid var(--glass-surface-border)',
          boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
          Soul Signature
        </p>
        <p className="text-sm mb-4" style={{ color: 'rgba(245,245,244,0.5)' }}>
          Connect a few platforms and your soul signature will take shape here.
        </p>
        <button
          onClick={() => navigate('/connect')}
          className="text-xs font-medium px-4 py-2 rounded-[100px] transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
          style={{
            background: 'var(--glass-surface-bg)',
            border: '1px solid var(--glass-surface-border)',
            color: 'var(--text-secondary)',
          }}
        >
          Connect platforms
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-[20px] px-5 py-5 backdrop-blur-[42px]"
      style={{
        background: 'var(--glass-surface-bg)',
        border: '1px solid var(--glass-surface-border)',
        boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
        Soul Signature
      </p>

      <p
        className="narrative-voice text-[15px] leading-[1.6] mb-4"
        style={{ fontStyle: 'italic', color: 'rgba(245,245,244,0.88)' }}
      >
        {tasteStatement}
      </p>

      <div className="flex flex-wrap gap-2">
        {topValues.map((value) => (
          <span
            key={value}
            className="text-xs font-medium px-3 py-1 rounded-[46px]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'var(--text-secondary)',
            }}
          >
            {value}
          </span>
        ))}
        {chronotype && (
          <span
            className="text-xs font-medium px-3 py-1 rounded-[46px]"
            style={{
              background: 'rgba(193,126,44,0.12)',
              border: '1px solid rgba(193,126,44,0.25)',
              color: 'var(--accent-amber)',
            }}
          >
            {chronotype}
          </span>
        )}
      </div>
    </div>
  );
}
