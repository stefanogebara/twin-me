import { authFetch } from './apiBase';

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: 'suggested' | 'active' | 'completed' | 'abandoned';
  metric_type: string;
  target_value?: number;
  current_value?: number;
  unit?: string;
  start_date?: string;
  end_date?: string;
  created_at: string;
  completed_at?: string;
  streak_days?: number;
  best_streak?: number;
}

export interface GoalSummary {
  active: number;
  completed: number;
  suggestions: number;
  best_streak: number;
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data as T;
}

export async function fetchGoals(status?: string): Promise<Goal[]> {
  const params = status ? `?status=${status}` : '';
  const res = await authFetch(`/goals${params}`);
  const data = await json<{ goals: Goal[] }>(res);
  return data.goals ?? [];
}

export async function fetchGoalSuggestions(): Promise<Goal[]> {
  const res = await authFetch('/goals/suggestions');
  const data = await json<{ suggestions: Goal[] }>(res);
  return data.suggestions ?? [];
}

export async function fetchGoalSummary(): Promise<GoalSummary> {
  const res = await authFetch('/goals/summary');
  const data = await json<GoalSummary>(res);
  return data;
}

export async function acceptGoal(id: string): Promise<void> {
  const res = await authFetch(`/goals/${id}/accept`, { method: 'POST' });
  await json(res);
}

export async function dismissGoal(id: string): Promise<void> {
  const res = await authFetch(`/goals/${id}/dismiss`, { method: 'POST' });
  await json(res);
}

export async function completeGoal(id: string): Promise<void> {
  const res = await authFetch(`/goals/${id}/complete`, { method: 'POST' });
  await json(res);
}

export async function abandonGoal(id: string): Promise<void> {
  const res = await authFetch(`/goals/${id}/abandon`, { method: 'POST' });
  await json(res);
}

export async function createGoal(title: string, description?: string): Promise<Goal> {
  const res = await authFetch('/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  });
  const data = await json<{ data: Goal }>(res);
  return data.data;
}
