/**
 * OnboardingWowPage — the "wow" moment right after connecting Gmail.
 *
 * On mount it asks the backend to read the user's writing voice and draft their
 * first replies (POST /api/onboarding/wow — this creates pending twin actions).
 * It shows the voice read + those drafts, then drops the user into Today, where
 * the drafts wait for Send / Edit / Reject.
 *
 * The drafts are read-only here: the wow is "look what your twin already wrote in
 * your voice" — acting on them happens in the inbox. Nothing is ever sent
 * automatically.
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowRight, Mail } from 'lucide-react';
import { onboardingWowAPI, type WowDraft } from '@/services/api/onboardingWowAPI';
import { isAbortError } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const glass =
  'bg-[var(--surface)] border border-[var(--glass-surface-border)] rounded-[20px] backdrop-blur-[42px]';

const OnboardingWowPage: React.FC = () => {
  const navigate = useNavigate();
  useDocumentTitle('Your twin');
  const { trackFunnel } = useAnalytics();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['onboarding-wow'],
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        return await onboardingWowAPI.generate(controller.signal);
      } finally {
        clearTimeout(timer);
      }
    },
    // This POST has a side effect (it creates the drafts). Run it once and never
    // auto-refetch, or a window refocus would draft the same threads again.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Fire the funnel milestone once, when the payload first arrives.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (!data || trackedRef.current) return;
    trackedRef.current = true;
    trackFunnel('wow_delivered', {
      drafts_count: data.drafts.length,
      has_voice_read: Boolean(data.voiceRead),
    });
  }, [data, trackFunnel]);

  const goToday = () => navigate('/today');

  return (
    <div className="min-h-screen w-full flex justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-[640px] flex flex-col gap-8">
        {isLoading ? (
          <LoadingState />
        ) : !data ? (
          // Error, timeout/abort, or empty payload — never trap the user here.
          <ReadyFallback onContinue={goToday} degraded={isError && !isAbortError(error)} />
        ) : (
          <WowContent voiceRead={data.voiceRead} drafts={data.drafts} onContinue={goToday} />
        )}
      </div>
    </div>
  );
};

const LoadingState: React.FC = () => (
  <div className={`${glass} px-6 py-12 flex flex-col items-center text-center gap-4`}>
    <Loader2 className="w-7 h-7 text-[#A8A29E] animate-spin" aria-hidden />
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[var(--foreground)] text-[19px] font-medium tracking-tight">Meeting your twin</h1>
      <p className="text-[#A8A29E] text-sm max-w-[380px] leading-relaxed">
        Reading how you write, and drafting your first replies in your voice. This takes a few seconds.
      </p>
    </div>
  </div>
);

const WowContent: React.FC<{ voiceRead: string; drafts: WowDraft[]; onContinue: () => void }> = ({
  voiceRead,
  drafts,
  onContinue,
}) => (
  <>
    <header className="flex flex-col gap-3 pt-2">
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#9C9590]">Your voice</span>
      <p className="narrative-voice text-[26px] sm:text-[30px] text-[rgba(245,245,244,0.92)] leading-[1.4]">
        {voiceRead}
      </p>
    </header>

    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[var(--foreground)] text-[15px] font-medium tracking-tight">
          {drafts.length > 0 ? 'Already drafted in your voice' : 'Ready when you are'}
        </h2>
        {drafts.length > 0 && (
          <span className="text-[#9C9590] text-xs tabular-nums">
            {drafts.length} repl{drafts.length === 1 ? 'y' : 'ies'}
          </span>
        )}
      </div>

      {drafts.length > 0 ? (
        drafts.map((d) => <DraftPreview key={d.id} draft={d} />)
      ) : (
        <div className={`${glass} px-5 py-6 text-center`}>
          <p className="text-[#A8A29E] text-sm leading-relaxed">
            Your twin is set up. As emails arrive, it will draft replies in your voice for you to review here.
          </p>
        </div>
      )}
    </section>

    <div className="flex flex-col gap-3">
      {drafts.length > 0 && (
        <p className="text-[#9C9590] text-[13px] text-center px-4 leading-relaxed">
          Nothing is sent automatically. Review each one in Today, then send, edit, or skip.
        </p>
      )}
      <ContinueButton onClick={onContinue} />
    </div>
  </>
);

const DraftPreview: React.FC<{ draft: WowDraft }> = ({ draft }) => (
  <article className={`${glass} px-5 py-4 flex flex-col gap-3`}>
    <header className="flex items-center gap-2 text-[#9C9590] text-xs">
      <Mail size={13} aria-hidden />
      <span className="tracking-tight">Draft reply</span>
      <span className="ml-auto text-[10px] uppercase tracking-wide text-[#57534E]">Pending your review</span>
    </header>

    <p className="text-[var(--foreground)] text-[14.5px] leading-relaxed whitespace-pre-wrap">{draft.draft_text}</p>

    {draft.why_signals?.length > 0 && (
      <div className="flex flex-wrap gap-1.5">
        {draft.why_signals.map((w, i) => (
          <span
            key={i}
            className="inline-flex items-center rounded-[46px] bg-[var(--surface)] border border-[var(--glass-surface-border)] px-2.5 py-1 text-[11px] text-[#A8A29E]"
          >
            <span className="text-[#c17e2c] mr-1.5 uppercase tracking-wide text-[9px]">{w.kind}</span>
            {w.note}
          </span>
        ))}
      </div>
    )}
  </article>
);

const ReadyFallback: React.FC<{ onContinue: () => void; degraded: boolean }> = ({ onContinue, degraded }) => (
  <div className="flex flex-col gap-6 pt-2">
    <header className="flex flex-col gap-3">
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#9C9590]">Your twin</span>
      <p className="narrative-voice text-[26px] sm:text-[30px] text-[rgba(245,245,244,0.92)] leading-[1.4]">
        Your twin is ready.
      </p>
    </header>
    <div className={`${glass} px-5 py-6 text-center`}>
      <p className="text-[#A8A29E] text-sm leading-relaxed">
        {degraded
          ? "We couldn't draft your first replies just now, but your twin is set up. It will draft replies in your voice as your emails come in."
          : 'Your twin is set up. It will draft replies in your voice as your emails come in — review them any time in Today.'}
      </p>
    </div>
    <ContinueButton onClick={onContinue} />
  </div>
);

const ContinueButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center justify-center gap-2 bg-[image:var(--claura-bone)] text-[var(--claura-bone-ink)] rounded-[12px] px-5 py-3 text-[14px] font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.4)] transition-opacity"
  >
    Go to Today <ArrowRight size={16} aria-hidden />
  </button>
);

export default OnboardingWowPage;
