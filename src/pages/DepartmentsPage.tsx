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
import TemplateCard from './components/departments/TemplateCard';
import InboxSummary from './components/departments/InboxSummary';
import StatusHero from './components/departments/StatusHero';
import NeedsInputSection from './components/departments/NeedsInputSection';
import RecentActivityCards from './components/departments/RecentActivityCards';
import TodayAgendaSidebar from './components/departments/TodayAgendaSidebar';
import { Loader2 } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardContext } from '@/hooks/useDashboardContext';

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
  const { user } = useAuth();
  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || '';
  const { data: dashboardData } = useDashboardContext();
  const calendarEvents = dashboardData?.nextEvents ?? [];

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

      {/* ── Status Hero (OpenAI "Your day, handled" style) ──────────────── */}
      <StatusHero
        firstName={firstName}
        actionsThisWeek={departments.reduce((s, d) => s + (d.actionsThisWeek || 0), 0)}
        pendingCount={proposals.length}
        handledAutonomously={activityItems.filter(i => i.type === 'executed').length}
      />

      {/* ── Two-column layout: main content + calendar sidebar ───────────── */}
      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* ── Needs Your Input (proposals as cards) ──────────────────── */}
          <NeedsInputSection
            proposals={proposals.map(p => ({
              id: p.id,
              department: p.department,
              description: p.description,
              toolName: p.toolName || undefined,
              createdAt: p.createdAt,
            }))}
            onApprove={handleApproveProposal}
            onReject={handleRejectProposal}
            loadingId={actionLoadingId}
          />

          {/* ── Recent Activity (cards with status badges) ─────────────── */}
          <RecentActivityCards items={activityItems} maxItems={6} />
        </div>

        {/* Calendar sidebar (desktop only) */}
        {calendarEvents.length > 0 && (
          <div className="hidden lg:block w-[260px] flex-shrink-0">
            <TodayAgendaSidebar events={calendarEvents} />
          </div>
        )}
      </div>

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
      {/* Old Activity + Proposals sections removed — now handled by
          StatusHero + NeedsInputSection + RecentActivityCards above */}
    </div>
  );
};

export default DepartmentsPage;
