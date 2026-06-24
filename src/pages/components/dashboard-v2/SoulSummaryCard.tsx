import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
// audit-2026-05-23 demo mode plumbing removed

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

  const { data, isLoading, isError, refetch } = useQuery<SoulSignatureResponse>({
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

  if (isError) {
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
          Couldn&rsquo;t load your soul signature.
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs font-medium px-4 py-2 rounded-[100px] transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
          style={{
            background: 'var(--glass-surface-bg)',
            border: '1px solid var(--glass-surface-border)',
            color: 'var(--text-secondary)',
          }}
        >
          Try again
        </button>
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
        className="narrative-voice text-[16px] leading-[1.55]"
        style={{ fontStyle: 'italic', color: 'rgba(245,245,244,0.85)' }}
      >
        &ldquo;{tasteStatement}&rdquo;
      </p>

      <button
        onClick={() => navigate('/identity')}
        className="mt-3 text-xs font-medium transition-opacity hover:opacity-70"
        style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        See full soul signature &rarr;
      </button>
    </div>
  );
}
