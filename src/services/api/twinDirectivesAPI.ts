import { authFetch } from './apiBase';

export type DirectiveCategory =
  | 'preference'
  | 'fact'
  | 'tone'
  | 'topic-avoid'
  | 'topic-prefer';

export type DirectiveStatus = 'active' | 'paused' | 'deleted';

export interface TwinDirective {
  id: string;
  content: string;
  category: DirectiveCategory;
  reinforcement_count: number;
  last_reinforced_at: string;
  user_edited: boolean;
  status: DirectiveStatus;
  source_conversation_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CorrectionRateData {
  totalCorrections: number;
  directivesCreated: number;
  directivesReinforced: number;
  correctionsByDay: Array<{ date: string; count: number }>;
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data as T;
}

export async function fetchDirectives(status?: 'active' | 'paused'): Promise<TwinDirective[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await authFetch(`/twin-directives${qs}`);
  const data = await json<{ directives: TwinDirective[] }>(res);
  return data.directives ?? [];
}

export async function fetchCorrectionRate(days = 30): Promise<CorrectionRateData> {
  const res = await authFetch(`/twin-directives/correction-rate?days=${days}`);
  const data = await json<{ data: CorrectionRateData }>(res);
  return data.data;
}

export async function updateDirective(
  id: string,
  updates: { content?: string; category?: DirectiveCategory; status?: 'active' | 'paused' },
): Promise<TwinDirective> {
  const res = await authFetch(`/twin-directives/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await json<{ data: TwinDirective }>(res);
  return data.data;
}

export async function deleteDirective(id: string): Promise<void> {
  const res = await authFetch(`/twin-directives/${id}`, { method: 'DELETE' });
  await json(res);
}
