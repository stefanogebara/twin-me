/**
 * TwinIntelligence — Twin Fidelity Score + Model Status (TRIBE v2)
 * =================================================================
 * Shows twin accuracy, training readiness, and model status in Settings.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Activity, Loader2, RefreshCw, Zap } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

interface FidelityData {
  fidelity_score: number;
  probe_count: number;
  confidence: number;
  measured_at: string;
}

interface ReadinessData {
  eligible: boolean;
  status: string;
  conversations: number;
  conversationsRequired: number;
  pairs: number;
  pairsRequired: number;
  model: { id: string; method: string } | null;
  nextAction: string;
}

async function fetchFidelity(): Promise<FidelityData | null> {
  const res = await authFetch('/tribe/fidelity');
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

async function fetchReadiness(): Promise<ReadinessData | null> {
  const res = await authFetch('/finetuning/readiness');
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

async function triggerFidelityMeasurement(): Promise<FidelityData | null> {
  const res = await authFetch('/tribe/fidelity', { method: 'POST' });
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

  const { data: readiness, isLoading: loadingReadiness } = useQuery({
    queryKey: ['finetuning', 'readiness'],
    queryFn: fetchReadiness,
    staleTime: 5 * 60 * 1000,
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

  const glassCard = {
    background: 'var(--glass-surface-bg)',
    backdropFilter: 'blur(42px)',
    WebkitBackdropFilter: 'blur(42px)',
    border: '1px solid var(--glass-surface-border)',
  };

  return (
    <div className="mb-10">
      {/* Section label */}
      <h2
        className="text-[11px] font-medium tracking-widest uppercase block mb-5"
        style={{ color: 'var(--accent-vibrant)', fontFamily: 'Inter, sans-serif' }}
      >
        Twin Intelligence
      </h2>

      <div className="rounded-[20px] px-5 py-4" style={glassCard}>
        {/* Fidelity Score */}
        <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-glass)' }}>
          <div className="flex items-center gap-3">
            <Brain className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(199,146,234,0.7)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>
                Twin Accuracy
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {fidelity
                  ? `Based on ${fidelity.probe_count} behavioral probes`
                  : 'How well your twin predicts your responses'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loadingFidelity ? (
              <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
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

        {/* Model Status */}
        <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-glass)' }}>
          <div className="flex items-center gap-3">
            <Zap className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,183,130,0.7)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>
                Personal Model
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {readiness?.model
                  ? `Trained via ${readiness.model.method.toUpperCase()}`
                  : 'Finetuned AI adapter for your personality'}
              </p>
            </div>
          </div>
          {loadingReadiness ? (
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
          ) : (
            <span
              className="text-xs px-2 py-1 rounded-full"
              style={{
                background: readiness?.model
                  ? 'rgba(120,200,170,0.12)' : 'rgba(255,255,255,0.04)',
                color: readiness?.model
                  ? 'rgba(120,200,170,0.8)' : 'rgba(255,255,255,0.3)',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {readiness?.model ? 'Active' : readiness?.eligible ? 'Ready to train' : 'Collecting data'}
            </span>
          )}
        </div>

        {/* Training Progress */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(130,170,255,0.7)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>
                Training Data
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Conversations powering your model
              </p>
            </div>
          </div>
          {loadingReadiness ? (
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
          ) : (
            <span className="text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter, sans-serif' }}>
              {readiness?.conversations?.toLocaleString() || '0'} / {readiness?.conversationsRequired || 50}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {readiness && !readiness.model && (
          <div className="mt-1 mb-2 mx-7">
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((readiness.conversations || 0) / (readiness.conversationsRequired || 50)) * 100)}%`,
                  background: readiness.eligible
                    ? 'rgba(120,200,170,0.6)'
                    : 'rgba(130,170,255,0.4)',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TwinIntelligence;
