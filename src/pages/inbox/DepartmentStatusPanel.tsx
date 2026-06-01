/**
 * DepartmentStatusPanel
 *
 * Collapsible row of per-department status cards at the top of /inbox.
 * Each card surfaces:
 *   - department name + color stripe
 *   - autonomy mode (Watch / Ask / Auto)
 *   - this-week's accept rate ("8 of 10 done · 80%")
 *   - budget bar when a budget is set
 *
 * Polled at 5 min refresh via React Query — slow enough to be cheap, fast
 * enough that an autonomy change in /settings shows up quickly.
 *
 * Default collapsed when there are 0 pending tiles; default expanded when
 * the user has pending items waiting (they're in /inbox to triage).
 */

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { inboxAPI } from '@/services/api/inboxAPI';
import { departmentsAPI } from '@/services/api/departmentsAPI';
import type { DepartmentSummary } from '@/services/api/inboxAPI';

// A department is "underperforming" when the user has decided on at least
// MIN_SAMPLE proposals from it in the last 7 days AND the accept rate is
// below WEAK_RATE. At that point its current autonomy (Ask first / Just do
// it) is producing noise the user reliably skips — surface a one-tap
// affordance to drop it back to Watch only. We don't auto-flip; the user
// always confirms.
const MIN_SAMPLE = 3;
const WEAK_RATE = 30;

function isUnderperforming(d: DepartmentSummary): boolean {
  if (d.autonomyLevel <= 0) return false; // already at Watch only, nothing to suggest
  const decided = d.weeklyAccepted + d.weeklyRejected + d.weeklyFailed;
  if (decided < MIN_SAMPLE) return false;
  if (d.acceptRate == null) return false;
  return d.acceptRate < WEAK_RATE;
}

interface Props {
  /** Optional hint — when there are pending tiles, default the panel open. */
  pendingCount?: number;
}

function autonomyLabel(level: number): string {
  if (level <= 0) return 'Watch only';
  if (level <= 2) return 'Ask first';
  return 'Just do it';
}

function autonomyColor(level: number): string {
  if (level <= 0) return 'var(--text-muted)';
  if (level <= 2) return 'var(--text-secondary)';
  return '#10B981';
}

const DepartmentStatusPanel: React.FC<Props> = ({ pendingCount = 0 }) => {
  const queryClient = useQueryClient();
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['inbox', 'department-summary'],
    queryFn: () => inboxAPI.getDepartmentSummary(),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const [open, setOpen] = useState(pendingCount > 0);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const handleLowerAutonomy = async (d: DepartmentSummary) => {
    setActingOn(d.department);
    const previousLevel = d.autonomyLevel;
    try {
      await departmentsAPI.updateAutonomy(d.department, 0);
      toast.success(`${d.name} set to Watch only`, {
        description: 'You can change this any time in Settings.',
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await departmentsAPI.updateAutonomy(d.department, previousLevel);
              toast.success(`${d.name} restored`);
              await queryClient.invalidateQueries({ queryKey: ['inbox', 'department-summary'] });
            } catch {
              toast.error('Could not undo. Try /settings.');
            }
          },
        },
        duration: 8000,
      });
      await queryClient.invalidateQueries({ queryKey: ['inbox', 'department-summary'] });
      // Pending count may drop too if the department was producing noise.
      await queryClient.invalidateQueries({ queryKey: ['inbox', 'pending-count'] });
    } catch (err) {
      toast.error('Could not lower autonomy. Try again?');
    } finally {
      setActingOn(null);
    }
  };

  // Hide entirely until we have data — avoids a flash of empty header.
  if (isLoading && departments.length === 0) return null;
  if (departments.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[12px] mb-2 transition-opacity hover:opacity-80"
        style={{
          color: 'var(--text-muted)',
          background: 'none',
          border: 'none',
          padding: 0,
        }}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Departments
      </button>

      {open && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {departments.map((d) => (
            <DeptCard
              key={d.department}
              d={d}
              isLowering={actingOn === d.department}
              onLowerAutonomy={() => handleLowerAutonomy(d)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const DeptCard: React.FC<{
  d: DepartmentSummary;
  isLowering: boolean;
  onLowerAutonomy: () => void;
}> = ({ d, isLowering, onLowerAutonomy }) => {
  const budgetPct = d.budget?.total > 0
    ? Math.min(100, Math.round((d.budget.spent / d.budget.total) * 100))
    : 0;
  const decided = d.weeklyAccepted + d.weeklyRejected + d.weeklyFailed;
  const weak = isUnderperforming(d);

  return (
    <div
      className="relative px-3 py-2.5 rounded-[14px] backdrop-blur-[42px]"
      style={{
        background: 'rgba(255,255,255,0.06)',
        // Amber tint when underperforming so the card stands out without
        // being alarming (red is reserved for actual failures).
        border: weak ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid rgba(255,255,255,0.10)',
        opacity: isLowering ? 0.6 : 1,
      }}
    >
      <div
        className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
        style={{ background: d.color }}
        aria-hidden
      />
      <div className="pl-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[13px] font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {d.name}
          </span>
          <span
            className="text-[10px] uppercase tracking-wider flex-shrink-0"
            style={{ color: autonomyColor(d.autonomyLevel) }}
          >
            {autonomyLabel(d.autonomyLevel)}
          </span>
        </div>

        <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {d.weeklyTotal === 0
            ? 'No activity this week'
            : decided === 0
              ? `${d.weeklyPending} pending`
              : `${d.weeklyAccepted}/${decided} done${d.acceptRate != null ? ` · ${d.acceptRate}%` : ''}`}
        </div>

        {d.budget?.total > 0 && (
          <div className="mt-2">
            <div
              className="h-[3px] rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${budgetPct}%`,
                  background: budgetPct > 80 ? '#dc2626' : d.color,
                }}
                aria-hidden
              />
            </div>
            <div
              className="mt-0.5 text-[10px]"
              style={{ color: 'var(--text-muted)' }}
            >
              ${d.budget.spent.toFixed(2)} / ${d.budget.total.toFixed(2)}
            </div>
          </div>
        )}

        {/* Weak-department nudge: only fires when the user has consistently
            skipped this department's proposals this week. Tap-to-quiet
            instead of nagging — one button, undoable for 8s via the toast. */}
        {weak && (
          <button
            onClick={onLowerAutonomy}
            disabled={isLowering}
            className="mt-2 inline-flex items-center gap-1 text-[11px] transition-opacity hover:opacity-80"
            style={{ color: '#f59e0b', background: 'none', border: 'none', padding: 0 }}
            aria-label={`Lower ${d.name} autonomy to Watch only`}
          >
            <AlertTriangle className="w-3 h-3" />
            {isLowering ? 'Updating…' : 'Lower to Watch only'}
          </button>
        )}
      </div>
    </div>
  );
};

export default DepartmentStatusPanel;
