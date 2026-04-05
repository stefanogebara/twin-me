import { ArrowRight, Loader2 } from 'lucide-react';
import SoulOrb from '../../onboarding/components/SoulOrb';
import DataRevealItem from '../../onboarding/components/DataRevealItem';
import { IdentityConfirmation } from './IdentityConfirmation';
import { DiscoverCorrectionForm } from './DiscoverCorrectionForm';
import { T } from './discoverTokens';

type DiscoverPhase = 'idle' | 'scanning' | 'revealed';
type ConfirmationPhase = 'pending' | 'confirmed' | 'correcting';

interface DataPoint {
  icon: string;
  label: string;
  value: string;
}

interface DiscoverHeroProps {
  phase: DiscoverPhase;
  email: string;
  error: string;
  dataPoints: DataPoint[];
  personaSummary: string | null;
  webSources: Array<{ title: string; url: string }>;
  discoveredName?: string | null;
  confirmationPhase?: ConfirmationPhase;
  isRescanning?: boolean;
  onEmailChange: (value: string) => void;
  onDiscover: () => void;
  onResetPhase: () => void;
  onNavigateAuth: (email: string) => void;
  onEnterDemo: () => void;
  onConfirmYes?: () => void;
  onConfirmNo?: () => void;
  onCorrectionSubmit?: (data: { name: string; linkedin: string; website: string }) => void;
  onCorrectionSkip?: () => void;
}

export default function DiscoverHero({
  phase,
  email,
  error,
  dataPoints,
  personaSummary,
  webSources,
  discoveredName,
  confirmationPhase = 'pending',
  isRescanning = false,
  onEmailChange,
  onDiscover,
  onResetPhase,
  onNavigateAuth,
  onEnterDemo,
  onConfirmYes,
  onConfirmNo,
  onCorrectionSubmit,
  onCorrectionSkip,
}: DiscoverHeroProps) {
  const chatboxStyle = {
    background: T.CARD_BG,
    border: `1px solid ${T.CARD_BDR}`,
    boxShadow: '0 4px 4px rgba(0,0,0,0.12)',
  };

  return (
    <section className="relative flex flex-col items-center pt-40 pb-16 px-6" style={{ overflowX: 'clip' }}>
      {/* H1 */}
      <h1
        className="relative text-center mb-3 max-w-[608px] text-[32px] md:text-[48px]"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          lineHeight: 1,
          letterSpacing: '-0.96px',
          color: T.FG,
        }}
      >
        Discover who you really are
      </h1>

      {/* Subtitle */}
      <p
        className="relative text-center mb-10 max-w-[608px]"
        style={{ color: T.TEXT_SEC, fontSize: '16px', lineHeight: 1.25 }}
      >
        {phase === 'revealed' && dataPoints.length > 0
          ? 'Here\'s what your digital footprint reveals about you.'
          : 'TwinMe builds a living portrait of your authentic self from the platforms you actually use — not just what you say about yourself.'}
      </p>

      {/* ── PHASE: IDLE — Email input ── */}
      {phase === 'idle' && (
        <div className="relative w-full max-w-[608px]">
          <div
            className="rounded-[20px] px-5 py-4"
            style={{
              ...chatboxStyle,
              backdropFilter: 'blur(42px)',
              WebkitBackdropFilter: 'blur(42px)',
            }}
          >
            <form
              onSubmit={(e) => { e.preventDefault(); onDiscover(); }}
              className="flex items-center gap-3"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="Enter your email to discover yourself"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{
                  color: T.FG,
                  fontFamily: "'Inter', sans-serif",
                  caretColor: T.FG,
                }}
                autoFocus
              />
              <button
                type="submit"
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-opacity"
                style={{ background: T.CTA_BG, opacity: email.trim() ? 1 : 0.4 }}
                aria-label="Discover"
              >
                <ArrowRight className="w-4 h-4" style={{ color: T.CTA_FG }} />
              </button>
            </form>
          </div>
          {error && (
            <p className="text-xs mt-2 text-center" style={{ color: '#ef4444' }}>{error}</p>
          )}
          <button
            onClick={onEnterDemo}
            className="mt-4 text-xs transition-opacity hover:opacity-70 w-full text-center"
            style={{ color: T.TEXT_SEC, fontFamily: "'Inter', sans-serif", background: 'none', border: 'none', cursor: 'pointer' }}
          >
            or try the demo
          </button>
        </div>
      )}

      {/* ── PHASE: SCANNING — SoulOrb awakening ── */}
      {phase === 'scanning' && (
        <div className="relative flex flex-col items-center">
          <SoulOrb phase="awakening" dataPointCount={0} />
          <div className="flex items-center gap-2 mt-6">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: T.TEXT_SEC }} />
            <p className="text-sm" style={{ color: T.TEXT_SEC, fontFamily: "'Inter', sans-serif" }}>
              Discovering you...
            </p>
          </div>
        </div>
      )}

      {/* ── PHASE: REVEALED — SoulOrb alive + data points ── */}
      {phase === 'revealed' && (
        <div className="relative flex flex-col items-center w-full max-w-[480px]">
          <SoulOrb phase="alive" dataPointCount={dataPoints.length} />

          {personaSummary ? (
            <div className="w-full max-w-md mt-6">
              <div className="px-5 py-4 rounded-[20px]" style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)' }}>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}>
                  {personaSummary}
                </p>
              </div>
              {webSources.length > 0 && (
                <div className="mt-3 px-1">
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
                    Sources
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {webSources.map((src, i) => {
                      const domain = new URL(src.url).hostname.replace('www.', '');
                      return (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] hover:underline truncate max-w-[200px]"
                          style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
                          title={src.title}
                        >
                          {domain}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full max-w-md mt-6">
              <div className="px-5 py-4 rounded-[20px]" style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)' }}>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                  {dataPoints.length > 0
                    ? `We found traces of you across ${dataPoints.length} platforms. Sign up to see what your digital footprint reveals about who you really are.`
                    : "We couldn't find public info for that email yet — but your twin is ready to learn from you directly."}
                </p>
              </div>
            </div>
          )}

          {/* Identity confirmation flow */}
          {confirmationPhase === 'pending' && (
            <IdentityConfirmation
              onConfirm={onConfirmYes ?? (() => {})}
              onReject={onConfirmNo ?? (() => {})}
            />
          )}

          {confirmationPhase === 'correcting' && (
            <DiscoverCorrectionForm
              defaultName={discoveredName ?? ''}
              onResearch={onCorrectionSubmit ?? (() => {})}
              onSkip={onCorrectionSkip ?? (() => {})}
              isLoading={isRescanning}
            />
          )}

          {/* CTA: Create your twin — only after confirmation */}
          {confirmationPhase === 'confirmed' && (
            <button
              onClick={() => onNavigateAuth(email.trim())}
              className="mt-8 flex items-center gap-2 px-8 py-3 rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                background: T.CTA_BG,
                color: T.CTA_FG,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Create your twin
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {/* Try different email */}
          <button
            onClick={onResetPhase}
            className="mt-3 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif", background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            Try a different email
          </button>
        </div>
      )}
    </section>
  );
}
