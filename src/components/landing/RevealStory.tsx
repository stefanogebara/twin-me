import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, X, Download, Sparkles } from 'lucide-react';
import type { QuickEnrichmentData } from '../../services/enrichmentService';
import { downloadShareCard } from './shareCard';

/**
 * RevealStory — the enrichment reading as a card story (Wrapped grammar):
 * one insight per card, a beat of withholding before each line, then the
 * identity gate, then a named, saveable "first glimpse" card.
 */

type StoryStep = { kind: 'beat'; index: number } | { kind: 'confirm' } | { kind: 'final' };

/** Split a narrative into 2-4 beats at sentence boundaries, merging
 *  fragments so each beat is substantial enough to carry a card. */
export function splitIntoBeats(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const beats: string[] = [];
  let current = '';
  for (const s of sentences) {
    current = current ? `${current} ${s}` : s;
    if (current.length >= 110) {
      beats.push(current);
      current = '';
    }
  }
  if (current) {
    if (beats.length > 0 && current.length < 60) beats[beats.length - 1] += ` ${current}`;
    else beats.push(current);
  }
  return beats.slice(0, 4);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface RevealStoryProps {
  data: QuickEnrichmentData;
  onCreateTwin: () => void;
  onNotMe: () => void;
  trackFunnel?: (event: string, props?: Record<string, unknown>) => void;
}

const RevealStory = ({ data, onCreateTwin, onNotMe, trackFunnel }: RevealStoryProps) => {
  const reducedMotion = useReducedMotion();
  const beats = useMemo(() => splitIntoBeats(data.persona_summary ?? ''), [data.persona_summary]);
  const sources = useMemo(
    () => (data.web_sources ?? []).slice(0, 6).map((s) => hostnameOf(s.url)),
    [data.web_sources],
  );
  const firstName = data.discovered_name?.split(' ')[0] ?? null;

  const [step, setStep] = useState<StoryStep>({ kind: 'beat', index: 0 });
  const [saving, setSaving] = useState(false);

  const advance = () => {
    if (step.kind === 'beat') {
      const next = step.index + 1;
      if (next < beats.length) {
        setStep({ kind: 'beat', index: next });
        trackFunnel?.('reveal_beat_advanced', { beat: next });
      } else {
        setStep({ kind: 'confirm' });
      }
    }
  };

  const handleConfirm = (isMe: boolean) => {
    trackFunnel?.(isMe ? 'landing_identity_confirmed' : 'landing_identity_rejected');
    if (isMe) setStep({ kind: 'final' });
    else onNotMe();
  };

  const handleSave = async () => {
    setSaving(true);
    trackFunnel?.('reveal_card_saved');
    try {
      await downloadShareCard({ name: data.discovered_name, lines: beats, sources });
    } catch {
      // Canvas/save unavailable — nothing actionable for the user here.
    } finally {
      setSaving(false);
    }
  };

  const stepKey = step.kind === 'beat' ? `beat-${step.index}` : step.kind;

  return (
    <div className="w-full max-w-[600px] text-left">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-5" aria-hidden="true">
        {beats.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: step.kind === 'beat' && step.index === i ? 20 : 6,
              height: 6,
              background:
                step.kind !== 'beat' || step.index >= i
                  ? 'rgba(245,245,244,0.7)'
                  : 'rgba(255,255,255,0.18)',
            }}
          />
        ))}
        <div
          className="rounded-full transition-all duration-300"
          style={{
            width: step.kind !== 'beat' ? 20 : 6,
            height: 6,
            background: step.kind !== 'beat' ? 'rgba(245,245,244,0.7)' : 'rgba(255,255,255,0.18)',
          }}
        />
      </div>

      {/* Keyed remount per step gives the entrance animation; no exit
          animation on purpose — AnimatePresence mode="wait" wedged on the
          exiting card and never mounted the next one. */}
        <motion.div
          key={stepKey}
          initial={reducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* ── Beat cards ── */}
          {step.kind === 'beat' && (
            <button
              type="button"
              onClick={advance}
              className="claura-glass claura-glass--refract w-full text-left px-7 py-8 md:px-9 md:py-10 cursor-pointer group"
            >
              <p className="font-sans text-[11px] font-medium tracking-[0.15em] uppercase text-[var(--text-muted)] mb-5 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                {firstName ? `Your first reading, ${firstName}` : 'Your first reading'}
                <span className="ml-auto normal-case tracking-normal">
                  {step.index + 1} of {beats.length}
                </span>
              </p>

              <motion.p
                initial={reducedMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ delay: reducedMotion ? 0 : 0.45, duration: 0.5 }}
                className="font-heading text-[22px] md:text-[26px] leading-[1.45] tracking-[-0.01em]"
                style={{ color: 'var(--text-narrative)' }}
              >
                {beats[step.index]}
              </motion.p>

              <p className="font-sans text-[12px] font-medium text-[var(--text-muted)] mt-7 flex items-center gap-1.5 group-hover:text-[var(--text-secondary)] transition-colors">
                Continue <ArrowRight className="w-3.5 h-3.5" />
              </p>
            </button>
          )}

          {/* ── Identity gate ── */}
          {step.kind === 'confirm' && (
            <div className="claura-glass px-7 py-8 md:px-9 md:py-10 text-center">
              <p className="font-heading text-[24px] md:text-[28px] tracking-[-0.02em] text-[var(--text-primary)] mb-2">
                Is this you?
              </p>
              {sources.length > 0 && (
                <p className="font-sans text-[13px] font-medium text-[var(--text-muted)] mb-6">
                  Read from {sources.slice(0, 4).join(', ')}
                </p>
              )}
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => handleConfirm(true)} className="claura-btn-primary" style={{ padding: '11px 20px' }}>
                  <Check className="w-4 h-4" /> Yes, that's me
                </button>
                <button onClick={() => handleConfirm(false)} className="claura-btn-glass" style={{ padding: '11px 20px' }}>
                  <X className="w-4 h-4" /> Not me
                </button>
              </div>
            </div>
          )}

          {/* ── Final card ── */}
          {step.kind === 'final' && (
            <div>
              <div className="claura-glass claura-glass--refract px-7 py-8 md:px-9 md:py-10">
                <p className="font-sans text-[11px] font-medium tracking-[0.15em] uppercase text-[var(--text-muted)] mb-4">
                  Soul Signature — first glimpse
                </p>
                {data.discovered_name && (
                  <p className="font-heading text-[30px] md:text-[36px] tracking-[-0.02em] text-[var(--text-primary)] mb-4">
                    {data.discovered_name}
                  </p>
                )}
                <p
                  className="font-heading text-[19px] md:text-[21px] leading-[1.5] tracking-[-0.01em] mb-5"
                  style={{ color: 'var(--text-narrative)' }}
                >
                  {beats[0]}
                </p>
                {sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-[var(--border-glass)]">
                    {sources.map((s) => (
                      <span
                        key={s}
                        className="font-sans text-[12px] font-medium text-[var(--text-secondary)] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.10)] rounded-[46px] px-3 py-1.5"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center mt-6 gap-3">
                <p className="font-sans text-sm font-medium text-[var(--text-secondary)] max-w-[440px] text-center">
                  This is only your public surface. Connect what you actually use — Spotify,
                  YouTube, Calendar — and meet the twin that knows the rest.
                </p>
                <div className="flex items-center gap-3">
                  <button onClick={onCreateTwin} className="claura-btn-primary" style={{ padding: '13px 24px' }}>
                    Create your twin <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={handleSave} disabled={saving} className="claura-btn-glass disabled:opacity-60" style={{ padding: '13px 20px' }}>
                    <Download className="w-4 h-4" /> {saving ? 'Rendering...' : 'Save your card'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
    </div>
  );
};

export default RevealStory;
