/**
 * Wiki API Module
 *
 * Client for the LLM Wiki compiled knowledge pages.
 * Endpoints: /wiki/*
 */

import { authFetch } from './apiBase';

// --- Types ---

export interface WikiPage {
  domain: string; // personality, lifestyle, cultural, social, motivation
  title: string;
  content_md: string;
  version: number;
  compiled_at: string;
  created_at: string;
}

export interface WikiLog {
  domain: string;
  version: number;
  change_summary: string;
  reflections_used: number;
  memories_used: number;
  created_at: string;
}

// --- API Functions ---

/**
 * Fetch all wiki pages for the authenticated user.
 */
export async function getWikiPages(): Promise<WikiPage[]> {
  const response = await authFetch('/wiki/pages');
  if (!response.ok) throw new Error(`Wiki pages fetch failed: ${response.statusText}`);
  const json = await response.json();
  return json.data ?? [];
}

/**
 * Fetch a single wiki page by domain.
 */
export async function getWikiPage(domain: string): Promise<WikiPage | null> {
  const response = await authFetch(`/wiki/pages/${domain}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Wiki page fetch failed: ${response.statusText}`);
  const json = await response.json();
  return json.data ?? null;
}

/**
 * Fetch wiki compilation logs.
 */
export async function getWikiLogs(limit = 20): Promise<WikiLog[]> {
  const response = await authFetch(`/wiki/logs?limit=${limit}`);
  if (!response.ok) throw new Error(`Wiki logs fetch failed: ${response.statusText}`);
  const json = await response.json();
  return json.data ?? [];
}

/**
 * Fetch full knowledge graph data (domains + platforms + entities + edges).
 */
export async function getWikiGraph(): Promise<{
  nodes: Array<{ id: string; type: string; label: string; [key: string]: unknown }>;
  edges: Array<{ source: string; target: string; type: string; strength: number }>;
  stats: { domainCount: number; platformCount: number; entityCount: number; crossrefCount: number; totalCompilations: number };
}> {
  const response = await authFetch('/wiki/graph');
  if (!response.ok) throw new Error(`Wiki graph fetch failed: ${response.statusText}`);
  const json = await response.json();
  return json.data ?? { nodes: [], edges: [], stats: { domainCount: 0, platformCount: 0, entityCount: 0, crossrefCount: 0, totalCompilations: 0 } };
}

/**
 * Manually trigger wiki compilation (debug/testing).
 */
export async function triggerWikiCompile(): Promise<{ compiled: string[]; skipped: string[]; errors: string[] }> {
  const response = await authFetch('/wiki/compile', { method: 'POST' });
  if (!response.ok) throw new Error(`Wiki compile failed: ${response.statusText}`);
  const json = await response.json();
  return json.data;
}
