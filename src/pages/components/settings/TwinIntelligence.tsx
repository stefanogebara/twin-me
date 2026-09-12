/**
 * TwinIntelligence — Twin Fidelity Score (Settings)
 * ==================================================
 * Shows twin accuracy in Settings, as one row of the page kit (render it inside
 * a List). The "Personal Model" training UI was removed in replan-2026-06-10
 * cycle 4 along with the DPO/fine-tuning backend it called (/finetuning/readiness
 * and /finetuning/train no longer exist).
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Loader2 } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { Row } from '@/components/register';

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

  // The score is ink: the signature hues fail as text (the old pink was 1.97:1).
  const action = loadingFidelity ? (
    <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--rg-ink-2)' }} aria-label="Loading" />
  ) : fidelityPercent != null ? (
    <span className="rs-figure">{fidelityPercent}%</span>
  ) : (
    <button
      type="button"
      className="n-btn n-btn--ghost"
      onClick={() => measureMutation.mutate()}
      disabled={measureMutation.isPending}
    >
      {measureMutation.isPending ? (
        <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Measuring</>
      ) : 'Measure'}
    </button>
  );

  return (
    <Row
      icon={<Brain />}
      title="Twin accuracy"
      line={measureError
        ? <span className="rs-bad">{measureError}</span>
        : fidelity
          ? `Based on ${fidelity.probe_count} test questions`
          : 'How well your twin predicts your answers'}
      action={action}
    />
  );
};

export default TwinIntelligence;
