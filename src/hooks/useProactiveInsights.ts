import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import type { ProactiveInsight } from '@/types/dashboard';

const QUERY_KEY = ['proactive-insights'] as const;

async function fetchInsights(): Promise<ProactiveInsight[]> {
  const res = await authFetch('/insights/proactive?limit=10&include_delivered=true');
  if (!res.ok) throw new Error(`Insights fetch failed: ${res.status}`);
  const json = await res.json();
  const insights: ProactiveInsight[] = json.insights ?? [];
  if (insights.length === 0) {
    // Fire-and-forget generation for users who have never had insights generated
    authFetch('/insights/proactive/generate', { method: 'POST' }).catch(() => {});
  }
  return insights;
}

export interface NudgeFeedbackPayload {
  id: string;
  followed: boolean;
  note?: string;
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

  // Optimistic nudge feedback: immediately remove the insight from the cache
  // so the card archives before the server responds. On error, restore.
  const feedbackMutation = useMutation<
    { success: boolean },
    Error,
    NudgeFeedbackPayload,
    { previous?: ProactiveInsight[] }
  >({
    mutationFn: async ({ id, followed, note }) => {
      const res = await authFetch(`/insights/${id}/nudge-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followed, note }),
      });
      if (!res.ok) {
        throw new Error(`Nudge feedback failed: ${res.status}`);
      }
      return res.json();
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<ProactiveInsight[]>(QUERY_KEY);
      queryClient.setQueryData<ProactiveInsight[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((i) => i.id !== id)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    // No invalidate on success — server filters out acted-on insights, so the
    // optimistic removal stays consistent with the next refetch.
  });

  const undelivered = (query.data ?? []).filter(i => !i.delivered);

  return {
    insights: query.data ?? [],
    undelivered,
    count: undelivered.length,
    isLoading: query.isLoading,
    refetch: query.refetch,
    markEngaged: engageMutation.mutate,
    submitFeedback: feedbackMutation.mutate,
    isSubmittingFeedback: feedbackMutation.isPending,
    feedbackPendingId:
      feedbackMutation.isPending ? (feedbackMutation.variables?.id ?? null) : null,
  };
}
