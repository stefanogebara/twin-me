import React, { useState, useEffect } from 'react';
import { ArrowRight, Sparkles, Link2, Linkedin, Loader2 } from 'lucide-react';
import SoulOrb from './SoulOrb';
import DataRevealItem from './DataRevealItem';
import CorrectionForm from './CorrectionForm';
import type { OnboardingBriefing } from '@/services/enrichmentService';

type OrbPhase = 'dormant' | 'awakening' | 'alive';
type RevealSubView = 'data' | 'correction';

interface DataPoint {
  icon: string;
  label: string;
  value: string;
}

interface RevealPhaseProps {
  orbPhase: OrbPhase;
  userName: string;
  dataPoints: DataPoint[];
  narrative: string;
  briefing: OnboardingBriefing | null;
  showContinue: boolean;
  enrichError: string | null;
  identityConfirmed: boolean;
  revealSubView: RevealSubView;
  correctionName: string;
  correctionLinkedIn: string;
  isRetrying: boolean;
  retryCount: number;
  userLinkedInUrl: string;
  isLinkedInSearching: boolean;
  onConfirmIdentity: () => void;
  onNotMe: () => void;
  onAdvance: () => void;
  onCorrectionNameChange: (value: string) => void;
  onCorrectionLinkedInChange: (value: string) => void;
  onUserLinkedInChange: (value: string) => void;
  onLinkedInSubmit: () => void;
  onSearchAgain: () => void;
  onSkipEnrichment: () => void;
}

/**
 * In the register: a quiet status line (no tracked caps), the orb, an upright
 * Cosmos headline, what was found as rows under the ink rule, and one 48/12
 * call to action. No boxes, no italic.
 */
const RevealPhase: React.FC<RevealPhaseProps> = ({
  orbPhase,
  userName,
  dataPoints,
  narrative,
  briefing,
  showContinue,
  enrichError,
  identityConfirmed,
  revealSubView,
  correctionName,
  correctionLinkedIn,
  isRetrying,
  retryCount,
  userLinkedInUrl,
  isLinkedInSearching,
  onConfirmIdentity,
  onNotMe,
  onAdvance,
  onCorrectionNameChange,
  onCorrectionLinkedInChange,
  onUserLinkedInChange,
  onLinkedInSubmit,
  onSearchAgain,
  onSkipEnrichment,
}) => {
  const hasBriefing = briefing && briefing.headline && briefing.observations?.length > 0;

  // Show LinkedIn input during awakening phase after a short delay
  const [showLinkedInHint, setShowLinkedInHint] = useState(false);
  useEffect(() => {
    if (orbPhase === 'awakening') {
      const timer = setTimeout(() => setShowLinkedInHint(true), 2500);
      return () => clearTimeout(timer);
    }
    setShowLinkedInHint(false);
  }, [orbPhase]);

  return (
    <div className="rs-flow flex flex-col items-center w-full max-w-lg text-center">
      {/* Status line */}
      <p className="rs-flow-line mb-8" aria-live="polite">
        {orbPhase === 'dormant' && 'Discovering you'}
        {orbPhase === 'awakening' && 'Piecing together your story'}
        {orbPhase === 'alive' && (
          hasBriefing
            ? 'Here is what we found'
            : dataPoints.length === 0
              ? `Hello, ${userName.split(' ')[0]}`
              : `We found some things about ${userName.split(' ')[0]}`
        )}
      </p>

      {/* Soul Orb */}
      <div className="mb-8">
        <SoulOrb phase={orbPhase} dataPointCount={dataPoints.length} />
      </div>

      {/* LinkedIn URL hint during awakening (helps disambiguate the right person) */}
      {orbPhase === 'awakening' && showLinkedInHint && (
        <div className="w-full max-w-sm mb-6" style={{ display: 'grid', gap: 8 }}>
          <label htmlFor="reveal-linkedin" className="rs-flow-line" style={{ fontWeight: 350 }}>
            Have a LinkedIn? It helps us find the right you.
          </label>
          <input
            id="reveal-linkedin"
            type="url"
            value={userLinkedInUrl}
            onChange={(e) => onUserLinkedInChange(e.target.value)}
            placeholder="https://linkedin.com/in/yourprofile"
            className="n-input"
            style={{ width: '100%' }}
          />
        </div>
      )}

      {/* ===== BRIEFING VIEW (when LLM briefing is available) ===== */}
      {revealSubView === 'data' && hasBriefing && (
        <div className="w-full mt-2" style={{ display: 'grid', gap: 24 }}>
          <h2 className="rs-flow-title">{briefing.headline}</h2>

          <ul className="rg-list rg-compact">
            {briefing.observations.map((observation, idx) => (
              <li key={idx} className="rg-row">
                <span className="rg-row-icon" aria-hidden="true"><Sparkles /></span>
                <span className="rg-row-text"><span className="rg-row-title">{observation}</span></span>
                <span />
              </li>
            ))}
          </ul>

          {briefing.gaps.length > 0 && (
            <div style={{ display: 'grid', gap: 12, textAlign: 'left' }}>
              <p className="rs-strong" style={{ margin: 0 }}>Connect more to unlock</p>
              <ul className="rg-list rg-compact">
                {briefing.gaps.map((gap, idx) => (
                  <li key={idx} className="rg-row">
                    <span className="rg-row-icon" aria-hidden="true"><Link2 /></span>
                    <span className="rg-row-text"><span className="rg-row-line">{gap}</span></span>
                    <span />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ===== FALLBACK: data points as rows (when no briefing) ===== */}
      {revealSubView === 'data' && !hasBriefing && dataPoints.length > 0 && (
        <ul className="rg-list rg-compact w-full mt-4">
          {dataPoints.map((dp) => (
            <DataRevealItem
              key={dp.label}
              icon={dp.icon}
              label={dp.label}
              value={dp.value}
            />
          ))}
        </ul>
      )}

      {/* Narrative (only when no briefing — briefing replaces it) */}
      {revealSubView === 'data' && !hasBriefing && narrative && (
        <p className="rs-prose mt-6" style={{ textAlign: 'left' }}>
          {narrative.length > 500
            ? (() => {
                const chunk = narrative.slice(0, 500);
                const lastPeriod = chunk.lastIndexOf('.');
                return lastPeriod > 200 ? chunk.slice(0, lastPeriod + 1) : chunk.replace(/\s+\S*$/, '') + '...';
              })()
            : narrative}
        </p>
      )}

      {/* Error message */}
      {revealSubView === 'data' && enrichError && dataPoints.length === 0 && !hasBriefing && (
        <p className="rs-flow-line mt-6 max-w-sm">{enrichError}</p>
      )}

      {/* Empty state + LinkedIn input */}
      {revealSubView === 'data' && orbPhase === 'alive' && dataPoints.length === 0 && !enrichError && !hasBriefing && (
        <div className="w-full max-w-sm mt-6" style={{ display: 'grid', gap: 16 }}>
          <p className="rs-flow-line">We couldn't find much yet. Paste your LinkedIn to speed things up.</p>
          <LinkedInInputBox
            value={userLinkedInUrl}
            onChange={onUserLinkedInChange}
            onSubmit={onLinkedInSubmit}
            isSearching={isLinkedInSearching}
          />
        </div>
      )}

      {/* Identity confirmation gate: a line and two buttons, no box */}
      {revealSubView === 'data' && showContinue && (dataPoints.length > 0 || hasBriefing) && !identityConfirmed && (
        <div className="w-full max-w-sm mt-10" style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
          <p className="rs-strong" style={{ margin: 0 }}>Is this you?</p>
          <div className="rs-inline" style={{ justifyContent: 'center' }}>
            <button type="button" onClick={onConfirmIdentity} className="n-btn n-btn--primary pb-cta">
              Yes, that's me
            </button>
            <button type="button" onClick={onNotMe} className="n-btn n-btn--ghost">
              Not me
            </button>
          </div>
        </div>
      )}

      {/* LinkedIn input — shown while the results wait for confirmation */}
      {revealSubView === 'data' && showContinue && (dataPoints.length > 0 || hasBriefing) && !identityConfirmed && (
        <div className="w-full max-w-sm mt-6">
          <LinkedInInputBox
            value={userLinkedInUrl}
            onChange={onUserLinkedInChange}
            onSubmit={onLinkedInSubmit}
            isSearching={isLinkedInSearching}
            compact
          />
        </div>
      )}

      {/* Continue button */}
      {revealSubView === 'data' && showContinue && (identityConfirmed || (dataPoints.length === 0 && !hasBriefing)) && (
        <div className="flex flex-col items-center mt-10">
          <button type="button" onClick={onAdvance} className="n-btn n-btn--primary pb-cta">
            {hasBriefing && briefing.cta
              ? briefing.cta.length > 30 ? 'Continue' : briefing.cta
              : 'Continue'}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {revealSubView === 'correction' && (
        <CorrectionForm
          name={correctionName}
          linkedIn={correctionLinkedIn}
          onNameChange={onCorrectionNameChange}
          onLinkedInChange={onCorrectionLinkedInChange}
          onSearchAgain={onSearchAgain}
          onSkip={onSkipEnrichment}
          isRetrying={isRetrying}
          retryCount={retryCount}
        />
      )}
    </div>
  );
};

// ─── LinkedIn URL Input Box: the register's field and a secondary button ────
const LinkedInInputBox: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isSearching: boolean;
  compact?: boolean;
}> = ({ value, onChange, onSubmit, isSearching, compact }) => {
  const isValid = !value.trim() || /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i.test(value.trim());
  const canSubmit = value.trim().length > 0 && isValid && !isSearching;

  return (
    <div style={{ display: 'grid', gap: 8, textAlign: 'left' }}>
      {!compact && (
        <p className="rs-quiet" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--rg-ink-2)' }}>
          <Linkedin className="w-4 h-4" aria-hidden="true" />
          Your LinkedIn link makes the profile more accurate
        </p>
      )}
      <div className="rs-inline">
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onSubmit(); }}
          placeholder={compact ? 'linkedin.com/in/you' : 'https://linkedin.com/in/yourprofile'}
          aria-label="Your LinkedIn link"
          aria-invalid={!!value && !isValid}
          className="n-input"
        />
        <button type="button" onClick={onSubmit} disabled={!canSubmit} className="n-btn n-btn--ghost">
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Searching" /> : 'Find me'}
        </button>
      </div>
      {value && !isValid && (
        <p className="rs-bad" style={{ margin: 0 }}>Enter a LinkedIn profile link, like linkedin.com/in/yourname</p>
      )}
    </div>
  );
};

export default RevealPhase;
