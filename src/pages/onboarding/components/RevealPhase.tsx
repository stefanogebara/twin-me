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
    <div className="flex flex-col items-center w-full max-w-lg transition-all duration-500">
      {/* Status text */}
      <p
        className="text-sm uppercase tracking-widest mb-8 text-center transition-all duration-300"
        style={{
          color: 'rgba(232, 213, 183, 0.5)',
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.15em',
        }}
      >
        {orbPhase === 'dormant' && 'Discovering you...'}
        {orbPhase === 'awakening' && 'Piecing together your story...'}
        {orbPhase === 'alive' && (
          hasBriefing
            ? 'Here\'s what we found'
            : dataPoints.length === 0
              ? `Hello, ${userName.split(' ')[0]}`
              : `We found some info about ${userName.split(' ')[0]}`
        )}
      </p>

      {/* Soul Orb */}
      <div className="mb-8">
        <SoulOrb phase={orbPhase} dataPointCount={dataPoints.length} />
      </div>

      {/* LinkedIn URL hint during awakening (helps disambiguate the right person) */}
      {orbPhase === 'awakening' && showLinkedInHint && (
        <div
          className="w-full max-w-sm mb-6 transition-all duration-500"
          style={{ opacity: showLinkedInHint ? 1 : 0 }}
        >
          <p
            className="text-xs text-center mb-2"
            style={{
              color: 'rgba(232, 213, 183, 0.4)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Have a LinkedIn? It helps us find the right you.
          </p>
          <input
            type="url"
            value={userLinkedInUrl}
            onChange={(e) => onUserLinkedInChange(e.target.value)}
            placeholder="https://linkedin.com/in/yourprofile"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
            style={{
              background: 'rgba(232, 213, 183, 0.06)',
              border: '1px solid rgba(232, 213, 183, 0.12)',
              color: 'rgba(232, 213, 183, 0.8)',
              fontFamily: 'var(--font-body)',
            }}
          />
        </div>
      )}

      {/* ===== BRIEFING VIEW (when LLM briefing is available) ===== */}
      {revealSubView === 'data' && hasBriefing && (
        <div className="w-full max-w-md mt-2 transition-all duration-500">
          {/* Headline */}
          <h2
            className="text-2xl md:text-3xl leading-snug text-center mb-6"
            style={{
              fontFamily: 'var(--font-heading)',
              fontStyle: 'italic',
              color: 'rgba(232, 213, 183, 0.9)',
              letterSpacing: '-0.02em',
            }}
          >
            {briefing.headline}
          </h2>

          {/* Observations */}
          <div className="space-y-3 mb-6">
            {briefing.observations.map((observation, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 px-4 py-3 rounded-2xl transition-all duration-300"
                style={{
                  background: 'rgba(232, 213, 183, 0.06)',
                  border: '1px solid rgba(232, 213, 183, 0.10)',
                }}
              >
                <Sparkles
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  style={{ color: 'rgba(232, 213, 183, 0.5)' }}
                />
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: 'rgba(232, 213, 183, 0.75)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {observation}
                </p>
              </div>
            ))}
          </div>

          {/* Gaps */}
          {briefing.gaps.length > 0 && (
            <div className="mb-6">
              <p
                className="text-xs uppercase tracking-widest mb-2 px-1"
                style={{
                  color: 'rgba(232, 213, 183, 0.35)',
                  fontFamily: 'var(--font-body)',
                  letterSpacing: '0.12em',
                }}
              >
                Connect more to unlock
              </p>
              <div className="space-y-2">
                {briefing.gaps.map((gap, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 px-4 py-2.5 rounded-xl"
                    style={{
                      background: 'rgba(232, 213, 183, 0.03)',
                      border: '1px dashed rgba(232, 213, 183, 0.12)',
                    }}
                  >
                    <Link2
                      className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                      style={{ color: 'rgba(232, 213, 183, 0.35)' }}
                    />
                    <p
                      className="text-xs leading-relaxed"
                      style={{
                        color: 'rgba(232, 213, 183, 0.45)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {gap}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== FALLBACK: Old data points view (when no briefing) ===== */}
      {revealSubView === 'data' && !hasBriefing && dataPoints.length > 0 && (
        <div className="w-full max-w-sm mt-4 transition-all duration-300">
          {dataPoints.map((dp) => (
            <DataRevealItem
              key={dp.label}
              icon={dp.icon}
              label={dp.label}
              value={dp.value}
            />
          ))}
        </div>
      )}

      {/* Narrative (only when no briefing — briefing replaces it) */}
      {revealSubView === 'data' && !hasBriefing && narrative && (
        <p
          className="text-base leading-relaxed mt-6 text-center max-w-md transition-all duration-500"
          style={{
            color: 'rgba(232, 213, 183, 0.7)',
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
          }}
        >
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
        <p
          className="text-sm text-center mt-6 max-w-sm transition-all duration-300"
          style={{
            color: 'rgba(232, 213, 183, 0.5)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {enrichError}
        </p>
      )}

      {/* Empty state + LinkedIn input */}
      {revealSubView === 'data' && orbPhase === 'alive' && dataPoints.length === 0 && !enrichError && !hasBriefing && (
        <div className="w-full max-w-sm mt-6 text-center transition-all duration-300">
          <p
            className="text-sm mb-5"
            style={{
              color: 'rgba(232, 213, 183, 0.5)',
              fontFamily: 'var(--font-body)',
            }}
          >
            We couldn't find much yet — paste your LinkedIn to speed things up.
          </p>
          <LinkedInInputBox
            value={userLinkedInUrl}
            onChange={onUserLinkedInChange}
            onSubmit={onLinkedInSubmit}
            isSearching={isLinkedInSearching}
          />
        </div>
      )}

      {/* Identity confirmation gate */}
      {revealSubView === 'data' && showContinue && (dataPoints.length > 0 || hasBriefing) && !identityConfirmed && (
        <div className="w-full max-w-sm mt-8 transition-all duration-300">
          <div
            className="rounded-xl p-5 text-center"
            style={{
              background: 'rgba(232, 213, 183, 0.06)',
              border: '1px solid rgba(232, 213, 183, 0.15)',
            }}
          >
            <p
              className="text-sm mb-4"
              style={{ color: 'rgba(232, 213, 183, 0.8)', fontFamily: 'var(--font-body)' }}
            >
              Is this information about you?
            </p>
            <div className="flex gap-3">
              <button
                onClick={onConfirmIdentity}
                className="flex-1 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                  color: '#0C0C0C',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                }}
              >
                Yes, that's me
              </button>
              <button
                onClick={onNotMe}
                className="flex-1 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:opacity-80"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(232, 213, 183, 0.3)',
                  color: 'rgba(232, 213, 183, 0.7)',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                }}
              >
                Not me
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LinkedIn input — shown after identity confirmation OR when results are shown */}
      {revealSubView === 'data' && showContinue && (dataPoints.length > 0 || hasBriefing) && !identityConfirmed && (
        <div className="w-full max-w-sm mt-4 transition-all duration-300">
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
        <div className="flex flex-col items-center mt-8 transition-all duration-300">
          <button
            onClick={onAdvance}
            className="px-8 py-3 rounded-full text-base flex items-center gap-2 transition-all duration-200 hover:scale-[1.03]"
            style={{
              background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
              color: '#0C0C0C',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
            }}
          >
            {hasBriefing && briefing.cta
              ? briefing.cta.length > 30 ? 'Continue' : briefing.cta
              : 'Continue'}
            <ArrowRight className="w-4 h-4" />
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

// ─── LinkedIn URL Input Box ─────────────────────────────────────────────────
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
    <div
      className={`rounded-xl ${compact ? 'p-3' : 'p-4'}`}
      style={{
        background: 'rgba(232, 213, 183, 0.04)',
        border: '1px solid rgba(232, 213, 183, 0.10)',
      }}
    >
      {!compact && (
        <div className="flex items-center gap-2 mb-3">
          <Linkedin className="w-4 h-4" style={{ color: 'rgba(232, 213, 183, 0.5)' }} />
          <p
            className="text-xs"
            style={{ color: 'rgba(232, 213, 183, 0.5)', fontFamily: 'var(--font-body)' }}
          >
            Paste your LinkedIn URL for a more accurate profile
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onSubmit(); }}
          placeholder={compact ? 'linkedin.com/in/you' : 'https://linkedin.com/in/yourprofile'}
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none transition-all"
          style={{
            background: 'rgba(232, 213, 183, 0.06)',
            border: `1px solid ${value && !isValid ? 'rgba(239, 68, 68, 0.4)' : 'rgba(232, 213, 183, 0.12)'}`,
            color: 'rgba(232, 213, 183, 0.8)',
            fontFamily: 'var(--font-body)',
          }}
        />
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-[1.02] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
          style={{
            background: canSubmit ? 'rgba(232, 213, 183, 0.15)' : 'rgba(232, 213, 183, 0.06)',
            border: '1px solid rgba(232, 213, 183, 0.15)',
            color: 'rgba(232, 213, 183, 0.8)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {isSearching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            'Find me'
          )}
        </button>
      </div>
      {value && !isValid && (
        <p className="text-xs mt-1.5" style={{ color: 'rgba(239, 68, 68, 0.6)' }}>
          Enter a valid LinkedIn URL (e.g. linkedin.com/in/yourname)
        </p>
      )}
    </div>
  );
};

export default RevealPhase;
