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

export interface Department {
  name: string;
  config: DepartmentConfig;
  autonomyLevel: number;
  budget: { spent: number; total: number };
  actionsThisWeek: number;
  isEnabled: boolean;
}

export interface Proposal {
  id: string;
  department: string;
  departmentColor: string;
  description: string;
  estimatedCost: number;
  createdAt: string;
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
    return data.data ?? [];
  },

  /**
   * Update the autonomy level for a department
   */
  updateAutonomy: async (name: string, level: number): Promise<void> => {
    const response = await authFetch(`/departments/${encodeURIComponent(name)}/autonomy`, {
      method: 'PUT',
      body: JSON.stringify({ autonomyLevel: level }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update autonomy: ${response.statusText}`);
    }
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
    return data.data ?? [];
  },

  /**
   * Approve a pending proposal
   */
  approveProposal: async (id: string): Promise<void> => {
    const response = await authFetch(`/departments/proposals/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to approve proposal: ${response.statusText}`);
    }
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
};
