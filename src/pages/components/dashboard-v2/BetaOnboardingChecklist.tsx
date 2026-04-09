/**
 * BetaOnboardingChecklist
 *
 * Guided checklist for beta users after their first sign-in.
 * Shows progress through 5 key steps to get the most out of TwinMe.
 * Auto-dismisses after completion or manual dismiss.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cable,
  LayoutGrid,
  Zap,
  MessageCircle,
  X,
  ChevronRight,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authFetch, API_URL } from '@/services/api/apiBase';

const STORAGE_KEY = 'twinme_beta_onboarding_dismissed';

interface OnboardingStep {
  id: string;
  icon: typeof Cable;
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
  isComplete: boolean;
}

function useConnectedPlatformCount(): number {
  const { data } = useQuery<number>({
    queryKey: ['beta-onboarding-platform-count'],
    queryFn: async () => {
      try {
        const userId = JSON.parse(localStorage.getItem('auth_user') || '{}')?.id;
        if (!userId) return 0;
        const res = await authFetch(`/connectors/status/${userId}`);
        if (!res.ok) return 0;
        const json = await res.json();
        if (!json.success) return 0;
        const statuses = json.connectors || json.data || [];
        return statuses.filter(
          (c: { status?: string }) => c.status === 'connected'
        ).length;
      } catch {
        return 0;
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return data ?? 0;
}

function useDepartmentCount(): number {
  const { data } = useQuery<number>({
    queryKey: ['beta-onboarding-dept-count'],
    queryFn: async () => {
      try {
        const res = await authFetch('/departments');
        if (!res.ok) return 0;
        const json = await res.json();
        const depts = json.data || json.departments || [];
        return depts.filter(
          (d: { isEnabled?: boolean }) => d.isEnabled
        ).length;
      } catch {
        return 0;
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return data ?? 0;
}

function useHasMessagedTwin(): boolean {
  const { data } = useQuery<boolean>({
    queryKey: ['beta-onboarding-messaged'],
    queryFn: async () => {
      try {
        const res = await authFetch('/chat/usage');
        if (!res.ok) return false;
        const json = await res.json();
        return (json.totalMessages || json.messageCount || 0) > 0;
      } catch {
        return false;
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return data ?? false;
}

interface BetaOnboardingChecklistProps {
  onDismiss?: () => void;
}

export function BetaOnboardingChecklist({ onDismiss }: BetaOnboardingChecklistProps) {
  const navigate = useNavigate();
  const connectedCount = useConnectedPlatformCount();
  const departmentCount = useDepartmentCount();
  const hasMessaged = useHasMessagedTwin();

  const [visible, setVisible] = useState(() => {
    return !localStorage.getItem(STORAGE_KEY);
  });

  const steps: OnboardingStep[] = [
    {
      id: 'platforms',
      icon: Cable,
      title: 'Connect 2+ platforms',
      description: `${connectedCount} connected. Your twin learns from your real data.`,
      action: () => navigate('/get-started'),
      actionLabel: 'Connect',
      isComplete: connectedCount >= 2,
    },
    {
      id: 'template',
      icon: LayoutGrid,
      title: 'Pick a Life Operating System',
      description: 'Choose a template to activate your AI departments.',
      action: () => navigate('/departments'),
      actionLabel: 'Choose',
      isComplete: departmentCount >= 3,
    },
    {
      id: 'heartbeat',
      icon: Zap,
      title: 'Trigger your first sync',
      description: 'Pull fresh data from your connected platforms.',
      action: () => navigate('/get-started'),
      actionLabel: 'Sync now',
      isComplete: connectedCount >= 1,
    },
    {
      id: 'chat',
      icon: MessageCircle,
      title: 'Talk to your twin about departments',
      description: 'Ask about your patterns, or try "What should I focus on today?"',
      action: () =>
        navigate('/talk-to-twin', {
          state: { prefill: 'What should my departments focus on today?' },
        }),
      actionLabel: 'Chat',
      isComplete: hasMessaged,
    },
  ];

  const completedCount = steps.filter(s => s.isComplete).length;
  const allComplete = completedCount === steps.length;

  // Auto-dismiss after all steps complete (with a delay so user sees full progress)
  useEffect(() => {
    if (allComplete && visible) {
      const timer = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, 'true');
        setVisible(false);
        onDismiss?.();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [allComplete, visible, onDismiss]);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
    onDismiss?.();
  }, [onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative rounded-[20px] px-4 sm:px-5 py-5"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
            boxShadow:
              '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 var(--border-glass)',
          }}
        >
          {/* Dismiss */}
          <button
            onClick={dismiss}
            aria-label="Dismiss onboarding checklist"
            className="absolute top-4 right-4 p-1 rounded-full transition-all duration-150 ease-out hover:brightness-150 active:scale-90"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>

          {/* Header */}
          <h2
            className="tracking-tight mb-1"
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '22px',
              color: 'var(--foreground)',
              lineHeight: 1.2,
            }}
          >
            Get started
          </h2>
          <p
            className="text-sm mb-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            {allComplete
              ? 'All set. Your twin is ready.'
              : `${completedCount} of ${steps.length} complete`}
          </p>

          {/* Progress bar */}
          <div
            className="w-full h-1 rounded-full mb-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: 'var(--accent-vibrant)' }}
              initial={{ width: 0 }}
              animate={{
                width: `${(completedCount / steps.length) * 100}%`,
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-2">
            {steps.map(step => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className="flex items-center gap-3 py-2"
                >
                  {/* Check circle */}
                  <div
                    className="flex items-center justify-center flex-shrink-0 rounded-full"
                    style={{
                      width: 28,
                      height: 28,
                      background: step.isComplete
                        ? 'rgba(16,183,127,0.15)'
                        : 'rgba(255,255,255,0.06)',
                      border: step.isComplete
                        ? '1px solid rgba(16,183,127,0.3)'
                        : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Icon
                      size={14}
                      style={{
                        color: step.isComplete
                          ? '#10B77F'
                          : 'var(--text-secondary)',
                      }}
                    />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[14px] font-medium"
                      style={{
                        color: step.isComplete
                          ? 'var(--text-secondary)'
                          : 'var(--foreground)',
                        lineHeight: 1.4,
                        textDecoration: step.isComplete
                          ? 'line-through'
                          : 'none',
                        textDecorationColor: 'rgba(255,255,255,0.15)',
                      }}
                    >
                      {step.title}
                    </p>
                    {!step.isComplete && (
                      <p
                        className="text-[12px] mt-0.5"
                        style={{
                          color: 'var(--text-muted)',
                          lineHeight: 1.4,
                        }}
                      >
                        {step.description}
                      </p>
                    )}
                  </div>

                  {/* Action button */}
                  {!step.isComplete && (
                    <button
                      onClick={step.action}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-[100px] text-[12px] font-medium flex-shrink-0 transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.97] cursor-pointer"
                      style={{
                        background: '#F5F5F4',
                        color: '#110f0f',
                        border: 'none',
                        fontFamily: "'Geist', 'Inter', sans-serif",
                      }}
                    >
                      {step.actionLabel}
                      <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer dismiss link */}
          {!allComplete && (
            <button
              onClick={dismiss}
              className="text-[12px] mt-4 cursor-pointer transition-all duration-150 ease-out hover:brightness-150 active:scale-[0.97]"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
              }}
            >
              Skip for now
            </button>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
