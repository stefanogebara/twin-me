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
 *
 * In the register: the page kit's title and one grey line, the drafts as rows
 * under the ink rule, one 48/12 call to action. No cards; loading is a line.
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowRight, Mail } from 'lucide-react';
import { onboardingWowAPI, type WowDraft } from '@/services/api/onboardingWowAPI';
import { isAbortError } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, PageHead, Section, List, Empty } from '@/components/register';
import '@/styles/register-public.css';
import '@/styles/register-settings.css';

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
    <Page className="rs">
      {isLoading ? (
        <LoadingState />
      ) : !data ? (
        // Error, timeout/abort, or empty payload — never trap the user here.
        <ReadyFallback onContinue={goToday} degraded={isError && !isAbortError(error)} />
      ) : (
        <WowContent voiceRead={data.voiceRead} drafts={data.drafts} onContinue={goToday} />
      )}
    </Page>
  );
};

// No card: the title and one quiet line with the spinner.
const LoadingState: React.FC = () => (
  <PageHead
    title="Meeting your twin"
    line={
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Reading how you write, and drafting your first replies
      </span>
    }
  />
);

const WowContent: React.FC<{ voiceRead: string; drafts: WowDraft[]; onContinue: () => void }> = ({
  voiceRead,
  drafts,
  onContinue,
}) => (
  <>
    {/* The voice read is the page's title: ink, upright, the Cosmos heading. */}
    <PageHead title={voiceRead} line="How your twin reads your writing." />

    <Section
      title={drafts.length > 0 ? 'Already drafted in your voice' : 'Ready when you are'}
      line={drafts.length > 0 ? 'Nothing is sent. Review each one in Today.' : undefined}
      action={drafts.length > 0 ? (
        <span className="rs-quiet rg-figures">{drafts.length} repl{drafts.length === 1 ? 'y' : 'ies'}</span>
      ) : undefined}
    >
      <List label="Drafted replies">
        {drafts.length > 0 ? (
          drafts.map((d) => <DraftPreview key={d.id} draft={d} />)
        ) : (
          <li>
            <Empty>Your twin is set up. As emails arrive, it drafts replies in your voice for you to review.</Empty>
          </li>
        )}
      </List>
    </Section>

    <div className="rs-cta">
      <ContinueButton onClick={onContinue} />
    </div>
  </>
);

const DraftPreview: React.FC<{ draft: WowDraft }> = ({ draft }) => {
  // Why it wrote it this way: one grey line, the kinds in sentence case.
  const why = (draft.why_signals ?? [])
    .map((w) => `${w.kind.charAt(0).toUpperCase()}${w.kind.slice(1)}: ${w.note}`)
    .join('. ');
  return (
    <li className="rg-row" style={{ alignItems: 'start' }}>
      <span className="rg-row-icon" aria-hidden="true"><Mail /></span>
      <span className="rg-row-text" style={{ gap: 8 }}>
        <p className="rs-prose">{draft.draft_text}</p>
        {why && <span className="rg-row-line">{why}</span>}
      </span>
      <span />
    </li>
  );
};

const ReadyFallback: React.FC<{ onContinue: () => void; degraded: boolean }> = ({ onContinue, degraded }) => (
  <>
    <PageHead
      title="Your twin is ready."
      line={degraded
        ? "We couldn't draft your first replies just now. Your twin will draft them as your emails come in."
        : 'It will draft replies in your voice as your emails come in. Review them any time in Today.'}
    />
    <div className="rs-cta" style={{ marginTop: 0 }}>
      <ContinueButton onClick={onContinue} />
    </div>
  </>
);

const ContinueButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className="n-btn n-btn--primary pb-cta">
    Go to Today <ArrowRight className="w-4 h-4" aria-hidden="true" />
  </button>
);

export default OnboardingWowPage;
