import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import type { ProactiveInsight } from '@/types/dashboard';

const QUERY_KEY = ['proactive-insights'] as const;

async function fetchInsights(): Promise<ProactiveInsight[]> {
  const res = await authFetch('/insights/proactive?limit=10&include_delivered=true');
  if (!res.ok) throw new Error(`Insights fetch failed: ${res.status}`);
  const json = await res.json();
  return json.insights ?? [];
}

export function useProactiveInsights() {
  const queryClient = useQueryClient();

  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  const query = useQuery<ProactiveInsight[]>({
    queryKey: QUERY_KEY,
    queryFn: isDemoMode ? () => Promise.resolve([]) : fetchInsights,
    staleTime: 60_000,
    enabled: !isDemoMode,
  });

  const engageMutation = useMutation({
    mutationFn: async (id: string) => {
      await authFetch(`/insights/proactive/${id}/engage`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const undelivered = (query.data ?? []).filter(i => !i.delivered);

  return {
    insights: query.data ?? [],
    undelivered,
    count: undelivered.length,
    isLoading: query.isLoading,
    refetch: query.refetch,
    markEngaged: engageMutation.mutate,
  };
}
