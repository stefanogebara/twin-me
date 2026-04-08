/**
 * Templates API Module
 *
 * Client for the Life Operating System template system.
 * Endpoints: /templates/*
 */

import { authFetch } from './apiBase';

// --- Types ---

export interface TemplateDepartment {
  autonomy: number;
  budget: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  tagline: string;
  icon: string;
  color: string;
  departments: Record<string, TemplateDepartment>;
  departmentCount: number;
  totalBudget: number;
}

export interface ApplyTemplateResult {
  template: string;
  departments: Array<{
    department: string;
    autonomy?: number;
    budget?: number;
    success: boolean;
    error?: string;
  }>;
}

// --- API Methods ---

export async function getTemplates(): Promise<Template[]> {
  const response = await authFetch('/templates');

  if (!response.ok) {
    throw new Error(`Failed to fetch templates: ${response.statusText}`);
  }

  const data = await response.json();
  return data.templates ?? [];
}

export async function applyTemplate(name: string): Promise<ApplyTemplateResult> {
  const response = await authFetch(`/templates/${encodeURIComponent(name)}/apply`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to apply template: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}
