/**
 * Departments API Module
 *
 * Client for the SoulOS Department system.
 * Endpoints: /departments/*
 */

import { authFetch } from './apiBase';

// --- Types ---

export interface DepartmentConfig {
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface DepartmentStats {
  totalProposals: number;
  approved: number;
  rejected: number;
  approvalRate: number;
}

export interface Department {
  name: string;
  config: DepartmentConfig;
  autonomyLevel: number;
  budget: { spent: number; total: number };
  actionsThisWeek: number;
  isEnabled: boolean;
  stats?: DepartmentStats;
}

export interface Proposal {
  id: string;
  department: string;
  departmentColor: string;
  description: string;
  estimatedCost: number;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  type: 'proposal' | 'approved' | 'rejected' | 'executed' | 'suggestion';
  department: string;
  description: string;
  toolName: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  outcome: string | null;
}

// --- API Methods ---

export const departmentsAPI = {
  /**
   * Get all departments with their current state
   */
  getDepartments: async (): Promise<Department[]> => {
    const response = await authFetch('/departments');

    if (!response.ok) {
      throw new Error(`Failed to fetch departments: ${response.statusText}`);
    }

    const data = await response.json();
    const raw = data.departments ?? data.data ?? [];

    // Transform backend shape to frontend Department interface
    return raw.map((d: any) => ({
      name: d.department || d.name,
      config: {
        name: d.name || d.department,
        description: d.description || '',
        icon: d.icon || 'circle',
        color: d.color || '#6366F1',
      },
      autonomyLevel: d.autonomyLevel ?? d.defaultAutonomy ?? 1,
      budget: {
        spent: d.budget?.spent ?? 0,
        total: d.budget?.budget ?? d.defaultMonthlyBudget ?? 0.10,
      },
      actionsThisWeek: d.recentActionsCount ?? 0,
      isEnabled: (d.autonomyLevel ?? 0) > 0,
      stats: d.stats ?? { totalProposals: 0, approved: 0, rejected: 0, approvalRate: 0 },
    }));
  },

  /**
   * Update the autonomy level for a department
   */
  updateAutonomy: async (name: string, level: number): Promise<{ scopeUpgradeRequired?: boolean; message?: string; reconnectUrl?: string }> => {
    const response = await authFetch(`/departments/${encodeURIComponent(name)}/autonomy`, {
      method: 'PUT',
      body: JSON.stringify({ autonomyLevel: level }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update autonomy: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Toggle a department on or off
   */
  toggleDepartment: async (name: string, enabled: boolean): Promise<void> => {
    const response = await authFetch(`/departments/${encodeURIComponent(name)}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });

    if (!response.ok) {
      throw new Error(`Failed to toggle department: ${response.statusText}`);
    }
  },

  /**
   * Get pending proposals across all departments
   */
  getProposals: async (): Promise<Proposal[]> => {
    const response = await authFetch('/departments/proposals');

    if (!response.ok) {
      throw new Error(`Failed to fetch proposals: ${response.statusText}`);
    }

    const data = await response.json();
    return (data.proposals ?? data.data ?? []).map((p: any) => ({
      id: p.id,
      department: p.department || p.skill_name?.split('_')[0] || 'general',
      departmentColor: p.departmentColor || '#6366F1',
      description: p.display_description || p.context_summary || p.description || 'Pending action',
      estimatedCost: p.estimated_cost_usd ?? 0,
      createdAt: p.created_at || new Date().toISOString(),
    }));
  },

  /**
   * Approve a pending proposal
   */
  approveProposal: async (id: string): Promise<{ success: boolean; result?: unknown }> => {
    const response = await authFetch(`/departments/proposals/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to approve proposal: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Reject a pending proposal
   */
  rejectProposal: async (id: string): Promise<void> => {
    const response = await authFetch(`/departments/proposals/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to reject proposal: ${response.statusText}`);
    }
  },

  /**
   * Trigger a manual heartbeat check (bypasses 2-hour cooldown)
   */
  triggerHeartbeat: async (): Promise<{ success: boolean; proposals: any[]; count?: number; skipped?: string }> => {
    const response = await authFetch('/departments/heartbeat', { method: 'POST' });
    if (!response.ok) throw new Error('Heartbeat failed');
    return response.json();
  },

  /**
   * Get unified activity feed across all departments
   */
  getActivity: async (limit = 50): Promise<ActivityItem[]> => {
    const response = await authFetch(`/departments/activity?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch activity');
    const data = await response.json();
    return data.activity ?? [];
  },

  /**
   * Create a proposal for a department action (from twin DEPT_SUGGEST tags)
   */
  propose: async (department: string, opts: { toolName?: string; params?: Record<string, unknown>; context?: string }): Promise<{ success: boolean; proposal: unknown }> => {
    const response = await authFetch(`/departments/${encodeURIComponent(department)}/propose`, {
      method: 'POST',
      body: JSON.stringify({
        toolName: opts.toolName || 'suggest',
        params: opts.params || {},
        context: opts.context || '',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create proposal: ${response.statusText}`);
    }

    return response.json();
  },
};
