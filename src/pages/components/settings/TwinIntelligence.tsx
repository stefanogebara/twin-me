/**
 * TwinIntelligence — Twin Fidelity Score (Settings)
 * ==================================================
 * Shows twin accuracy in Settings. The "Personal Model" training UI was
 * removed in replan-2026-06-10 cycle 4 along with the DPO/fine-tuning
 * backend it called (/finetuning/readiness and /finetuning/train no longer
 * exist).
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Activity, Loader2 } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

interface FidelityData {
  fidelity_score: number;
  probe_count: number;
  confidence: number;
  measured_at: string;
}

async function fetchFidelity(): Promise<FidelityData | null> {
  const res = await authFetch('/twin/fidelity');
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

async function triggerFidelityMeasurement(): Promise<FidelityData | null> {
  const res = await authFetch('/twin/fidelity', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Measurement failed');
  }
  const json = await res.json();
  return json.data;
}

const TwinIntelligence: React.FC = () => {
  const queryClient = useQueryClient();
  const [measureError, setMeasureError] = useState<string | null>(null);

  const { data: fidelity, isLoading: loadingFidelity } = useQuery({
    queryKey: ['twin', 'fidelity'],
    queryFn: fetchFidelity,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const measureMutation = useMutation({
    mutationFn: triggerFidelityMeasurement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['twin', 'fidelity'] });
      setMeasureError(null);
    },
    onError: (err: Error) => {
      setMeasureError(err.message);
    },
  });

  const fidelityPercent = fidelity?.fidelity_score != null
    ? Math.round(fidelity.fidelity_score * 100)
    : null;

  return (
    <div className="mb-10">
      {/* Section label — matches other SectionLabel components in Settings */}
      <h2
        className="text-[11px] font-medium tracking-[0.1em] uppercase block mb-4"
        style={{ color: 'rgba(255, 255, 255, 0.55)', fontFamily: 'Inter, sans-serif', lineHeight: 'normal' }}
      >
        Twin Intelligence
      </h2>

      <div>
        {/* Fidelity Score */}
        <div className="flex items-center justify-between py-3 -mx-1 px-1 rounded-[4px] transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
          <div className="flex items-center gap-3">
            <Brain className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(199,146,234,0.7)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>
                Twin Accuracy
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
                {fidelity
                  ? `Based on ${fidelity.probe_count} behavioral probes`
                  : 'How well your twin predicts your responses'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loadingFidelity ? (
              <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'rgba(255, 255, 255, 0.55)' }} />
            ) : fidelityPercent != null ? (
              <span
                className="text-lg font-semibold tabular-nums"
                style={{
                  color: fidelityPercent >= 70 ? 'rgba(120,200,170,0.9)'
                    : fidelityPercent >= 40 ? 'rgba(255,183,130,0.9)'
                    : 'rgba(255,140,160,0.9)',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {fidelityPercent}%
              </span>
            ) : (
              <button
                onClick={() => measureMutation.mutate()}
                disabled={measureMutation.isPending}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97] flex items-center gap-1.5"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                {measureMutation.isPending ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Measuring...</>
                ) : (
                  <><Activity className="w-3 h-3" /> Measure</>
                )}
              </button>
            )}
          </div>
        </div>

        {measureError && (
          <p className="text-xs py-2" style={{ color: 'rgba(255,140,160,0.8)' }}>{measureError}</p>
        )}
      </div>
    </div>
  );
};

export default TwinIntelligence;
