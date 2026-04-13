/**
 * DepartmentsPage
 *
 * SoulOS Department Dashboard — clean settings-panel aesthetic.
 * Compact department list, horizontal template strip, pending proposals.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { departmentsAPI } from '@/services/api/departmentsAPI';
import type { Department, Proposal, ActivityItem } from '@/services/api/departmentsAPI';
import { getTemplates, applyTemplate as applyTemplateAPI } from '@/services/api/templatesAPI';
import type { Template } from '@/services/api/templatesAPI';
import DepartmentCard from './components/departments/DepartmentCard';
import DepartmentOnboarding from './components/departments/DepartmentOnboarding';
import ProposalCard from './components/departments/ProposalCard';
import TemplateCard from './components/departments/TemplateCard';
import ActivityFeed from './components/departments/ActivityFeed';
import InboxSummary from './components/departments/InboxSummary';
import { Loader2, Inbox, RefreshCw } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

// ── Default department configs (used when backend isn't wired yet) ───────

const DEFAULT_DEPARTMENTS: Department[] = [
  {
    name: 'communications',
    config: { name: 'Communications', description: 'Drafts and sends emails in your voice', icon: 'Mail', color: '#3B82F6' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.15 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'scheduling',
    config: { name: 'Scheduling', description: 'Optimizes your calendar and suggests focus time', icon: 'Calendar', color: '#8B5CF6' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.10 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'health',
    config: { name: 'Health', description: 'Analyzes recovery, sleep, and strain patterns', icon: 'HeartPulse', color: '#EF4444' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.05 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'content',
    config: { name: 'Content', description: 'Creates posts and drafts in your style', icon: 'PenLine', color: '#F59E0B' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.10 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'finance',
    config: { name: 'Finance', description: 'Tracks spending patterns and budget alerts', icon: 'Wallet', color: '#10B981' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.05 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'research',
    config: { name: 'Research', description: 'Deep research on topics you care about', icon: 'Search', color: '#6366F1' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.10 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'social',
    config: { name: 'Social', description: 'Maintains relationships and suggests catch-ups', icon: 'Users', color: '#EC4899' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.05 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
];

const QUERY_KEYS = {
  departments: ['departments'] as const,
  proposals: ['departments', 'proposals'] as const,
  templates: ['templates'] as const,
  activity: ['departments', 'activity'] as const,
};

const DepartmentsPage: React.FC = () => {
  useDocumentTitle('Departments');
  const queryClient = useQueryClient();

  useEffect(() => {
    document.body.classList.add('page-departments');
    return () => document.body.classList.remove('page-departments');
  }, []);
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  // Local optimistic state for department changes
  const [localDepts, setLocalDepts] = useState<Department[] | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [showAllProposals, setShowAllProposals] = useState(false);
  // Explainer replaced with inline subtitle under page title — no dismiss state needed

  const {
    data: remoteDepts,
    isLoading: loadingDepts,
  } = useQuery({
    queryKey: QUERY_KEYS.departments,
    queryFn: () => departmentsAPI.getDepartments(),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? DEFAULT_DEPARTMENTS : undefined,
  });

  const {
    data: proposals = [],
    isLoading: loadingProposals,
  } = useQuery({
    queryKey: QUERY_KEYS.proposals,
    queryFn: () => departmentsAPI.getProposals(),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? [] : undefined,
  });

  const {
    data: templates = [],
  } = useQuery({
    queryKey: QUERY_KEYS.templates,
    queryFn: () => getTemplates(),
    staleTime: 60_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? [] : undefined,
  });

  const {
    data: activityItems = [],
  } = useQuery({
    queryKey: QUERY_KEYS.activity,
    queryFn: () => departmentsAPI.getActivity(50),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? [] : undefined,
  });

  // Use local state if available (optimistic updates), otherwise remote
  const departments = localDepts ?? remoteDepts ?? DEFAULT_DEPARTMENTS;

  const isLoading = isDemoMode ? false : (loadingDepts && loadingProposals);

  // ── Group proposals by department ─────────────────────────────────────
  const VISIBLE_LIMIT = 10;
  const groupedProposals = useMemo(() => {
    const groups: Record<string, typeof proposals> = {};
    for (const p of proposals) {
      const dept = p.department || 'general';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(p);
    }
    return groups;
  }, [proposals]);

  // ── Budget totals ──────────────────────────────────────────────────────

  const totalBudget = departments.reduce((acc, d) => ({
    spent: acc.spent + d.budget.spent,
    total: acc.total + d.budget.total,
  }), { spent: 0, total: 0 });

  // showExplainer removed — explainer is now a permanent subtitle under the page title

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleAutonomyChange = useCallback(async (name: string, level: number) => {
    setLocalDepts((prev) => {
      const base = prev ?? departments;
      return base.map((d) =>
        d.name === name ? { ...d, autonomyLevel: level } : d
      );
    });

    try {
      const result = await departmentsAPI.updateAutonomy(name, level);
      if (result?.scopeUpgradeRequired) {
        toast(result.message || 'Additional permissions needed. Please reconnect in Settings.', {
          action: {
            label: 'Go to Settings',
            onClick: () => window.location.href = result.reconnectUrl || '/settings',
          },
        });
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'reauth_required') {
        toast.error(error.message || 'Re-authentication required for this autonomy level.', {
          action: { label: 'Sign in', onClick: () => window.location.href = '/auth' },
        });
      } else {
        toast.error(error.message || 'Failed to update autonomy level.');
      }
      setLocalDepts(null);
    }
  }, [departments, queryClient]);

  const handleToggle = useCallback(async (name: string, enabled: boolean) => {
    setLocalDepts((prev) => {
      const base = prev ?? departments;
      return base.map((d) =>
        d.name === name ? {
          ...d,
          isEnabled: enabled,
          autonomyLevel: enabled ? Math.max(d.autonomyLevel, 1) : 0,
        } : d
      );
    });

    try {
      await departmentsAPI.toggleDepartment(name, enabled);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
    } catch (err) {
      toast.error('Failed to toggle department.');
      setLocalDepts(null);
    }
  }, [departments, queryClient]);

  const handleApproveProposal = useCallback(async (id: string) => {
    setActionLoadingId(id);
    try {
      const response = await departmentsAPI.approveProposal(id);
      const proposal = proposals.find(p => p.id === id);
      const dept = proposal?.department || 'Department';
      toast.success(response?.result ? `${dept}: Action completed` : `${dept}: Approved`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.proposals }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments }),
      ]);
    } catch (err) {
      toast.error('Failed to approve proposal.');
    } finally {
      setActionLoadingId(null);
    }
  }, [queryClient, proposals]);

  const handleRejectProposal = useCallback(async (id: string) => {
    setActionLoadingId(id);
    try {
      await departmentsAPI.rejectProposal(id);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.proposals });
    } catch (err) {
      toast.error('Failed to reject proposal.');
    } finally {
      setActionLoadingId(null);
    }
  }, [queryClient]);

  const handleApplyTemplate = useCallback(async (templateId: string) => {
    try {
      const result = await applyTemplateAPI(templateId);
      setActiveTemplateId(templateId);
      setLocalDepts(null);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });

      // Find the template for a pretty name
      const template = templates.find((t: Template) => t.id === templateId);
      const templateName = template?.name || templateId;

      // Map level numbers to human labels
      const LEVEL_NAMES: Record<number, string> = {
        0: 'Observe',
        1: 'Suggest',
        2: 'Draft',
        3: 'Act',
        4: 'Auto',
      };

      // Format each enabled department as "Name (Level)"
      const enabledDepts = (result?.departments ?? [])
        .filter((d) => d.success && typeof d.autonomy === 'number' && d.autonomy > 0)
        .map((d) => {
          const name = d.department.charAt(0).toUpperCase() + d.department.slice(1);
          const level = LEVEL_NAMES[d.autonomy as number] ?? 'On';
          return `${name} (${level})`;
        });

      const descriptionText = enabledDepts.length > 0
        ? `${enabledDepts.join(', ')}. You can adjust individual departments below.`
        : 'You can adjust individual departments below.';

      toast.success(`${templateName} applied`, {
        description: descriptionText,
        duration: 8000,
      });
    } catch (err) {
      toast.error('Failed to apply template.');
    }
  }, [queryClient, templates]);

  const handleHeartbeat = useCallback(async () => {
    setHeartbeatLoading(true);
    try {
      const result = await departmentsAPI.triggerHeartbeat();
      if (result.skipped) {
        toast('No new proposals — not enough data yet');
      } else if (result.count && result.count > 0) {
        toast(`Generated ${result.count} proposal${result.count > 1 ? 's' : ''}`);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.proposals });
      } else {
        toast('No new proposals — not enough data yet');
      }
    } catch (err) {
      toast.error('Heartbeat check failed');
    } finally {
      setHeartbeatLoading(false);
    }
  }, [queryClient]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '28px',
              fontWeight: 400,
              color: 'var(--foreground)',
              letterSpacing: '-0.02em',
              lineHeight: '1.2',
            }}
          >
            Departments
          </h1>
          <p
            className="text-[13px] mt-1"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
          >
            AI agents that watch your data and propose actions for you to approve
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 pt-1">
          {/* Budget summary */}
          <span
            className="hidden sm:inline text-[12px]"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
            title="Monthly cost of running your AI team"
          >
            ${totalBudget.spent.toFixed(2)} / ${totalBudget.total.toFixed(2)} monthly
          </span>

          {/* Check now button */}
          {!isDemoMode && (
            <button
              onClick={handleHeartbeat}
              disabled={heartbeatLoading}
              title="Scan recent data and generate new proposals"
              className="flex items-center gap-1.5 text-[12px] transition-colors cursor-pointer px-3 py-1.5 rounded-[8px]"
              style={{
                color: 'rgba(255,255,255,0.5)',
                fontFamily: "'Inter', sans-serif",
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              }}
            >
              {heartbeatLoading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />
              }
              Check now
            </button>
          )}
        </div>
      </div>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }} className="mt-6 mb-8" />

      {/* ── Onboarding banner ─────────────────────────────────────────────── */}
      {!isLoading && departments.every(d => d.autonomyLevel === 0) && (
        <DepartmentOnboarding
          onSelectTemplate={handleApplyTemplate}
          visible={departments.every(d => d.autonomyLevel === 0)}
        />
      )}

      {/* ── Life Operating Systems — tile grid ────────────────────────────── */}
      {!isLoading && templates.length > 0 && (
        <section className="mb-10">
          <div
            className="text-[11px] font-medium tracking-[0.1em] uppercase mb-4"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
          >
            Life Operating Systems
          </div>
          {/* 2×N tile grid, horizontal scroll on mobile */}
          <div className="flex flex-wrap gap-3">
            {templates.map((t: Template) => (
              <TemplateCard
                key={t.id}
                id={t.id}
                name={t.name}
                description={t.description}
                tagline={t.tagline}
                icon={t.icon}
                color={t.color}
                departmentCount={t.departmentCount}
                totalBudget={t.totalBudget}
                isActive={activeTemplateId === t.id}
                onApply={handleApplyTemplate}
              />
            ))}
          </div>
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} className="mt-8 mb-2" />
        </section>
      )}

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      )}

      {/* ── Department list ───────────────────────────────────────────────── */}
      {!isLoading && (
        <section className="mb-10">
          <div
            className="text-[11px] font-medium tracking-[0.1em] uppercase mb-4"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
          >
            Your Departments
          </div>
          {/* Hairline-border rows — no gap between them */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {departments.map((dept) => (
              <DepartmentCard
                key={dept.name}
                name={dept.name}
                config={dept.config}
                autonomyLevel={dept.autonomyLevel}
                budget={dept.budget}
                actionsThisWeek={dept.actionsThisWeek}
                isEnabled={dept.isEnabled}
                observationOnly={['health', 'finance', 'social'].includes(dept.name)}
                stats={dept.stats}
                expandedContent={dept.name === 'communications' ? <InboxSummary /> : undefined}
                onAutonomyChange={(level) => handleAutonomyChange(dept.name, level)}
                onToggle={(enabled) => handleToggle(dept.name, enabled)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Recent activity ───────────────────────────────────────────────── */}
      {!isLoading && (
        <section className="mb-10">
          <div
            className="text-[11px] font-medium tracking-[0.1em] uppercase mb-4"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
          >
            Recent Activity
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <ActivityFeed items={activityItems} />
          </div>
        </section>
      )}

      {/* ── Pending proposals ─────────────────────────────────────────────── */}
      {!isLoading && (
        <section>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} className="mb-8" />
          <div
            className="text-[11px] font-medium tracking-[0.1em] uppercase mb-4"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
          >
            Pending Proposals
          </div>

          {proposals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Inbox className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.08)' }} />
              <p
                className="text-[13px] text-center"
                style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
              >
                No pending proposals
              </p>
            </div>
          ) : (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {(() => {
                let rendered = 0;
                return Object.entries(groupedProposals).map(([deptKey, deptProposals]) => {
                  const deptConfig = departments.find(d => d.name === deptKey);
                  const deptColor = deptConfig?.config?.color || deptProposals[0]?.departmentColor || '#6366F1';
                  const visible = showAllProposals ? deptProposals : deptProposals.filter(() => {
                    if (rendered >= VISIBLE_LIMIT) return false;
                    rendered++;
                    return true;
                  });
                  if (visible.length === 0) return null;
                  return (
                    <div key={deptKey} className="mb-1">
                      {/* Department group label */}
                      <div className="flex items-center gap-2 pt-4 pb-2">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: deptColor }} />
                        <span
                          className="text-[11px] font-medium uppercase tracking-[0.08em]"
                          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
                        >
                          {deptKey}
                        </span>
                        <span
                          className="text-[11px]"
                          style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif" }}
                        >
                          {deptProposals.length}
                        </span>
                      </div>
                      {visible.map((proposal) => (
                        <ProposalCard
                          key={proposal.id}
                          id={proposal.id}
                          department={proposal.department}
                          departmentColor={proposal.departmentColor}
                          description={proposal.description}
                          estimatedCost={proposal.estimatedCost}
                          createdAt={proposal.createdAt}
                          onApprove={handleApproveProposal}
                          onReject={handleRejectProposal}
                        />
                      ))}
                    </div>
                  );
                });
              })()}
              {!showAllProposals && proposals.length > VISIBLE_LIMIT && (
                <button
                  onClick={() => setShowAllProposals(true)}
                  className="w-full text-center py-3 text-[11px] font-medium transition-opacity hover:opacity-80"
                  style={{
                    color: 'rgba(255,255,255,0.3)',
                    fontFamily: "'Inter', sans-serif",
                    background: 'none',
                    border: 'none',
                  }}
                >
                  Show {proposals.length - VISIBLE_LIMIT} more
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default DepartmentsPage;
