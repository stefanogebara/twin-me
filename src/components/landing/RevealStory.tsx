import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, X, Download } from 'lucide-react';
import type { QuickEnrichmentData } from '../../services/enrichmentService';
import { downloadShareCard } from './shareCard';
import '../../styles/front-door.css';

/**
 * RevealStory — the enrichment reading as a card story (Wrapped grammar):
 * one insight per card, a beat of withholding before each line, then the
 * identity gate, then a named, saveable "first glimpse" card.
 *
 * In the register (the .rv block of src/styles/front-door.css): the glass cards
 * are a plain panel on the page colour, labels are sentence case, and the
 * buttons are 32/4. It is shown over the hero's photograph, so the panel paints
 * its own ground and every line on it is ink.
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
    <div className="rv">
      {/* Progress dots */}
      <div className="rv-dots" aria-hidden="true">
        {beats.map((_, i) => (
          <i
            key={i}
            className={
              step.kind === 'beat' && step.index === i ? 'is-current'
                : step.kind !== 'beat' || step.index >= i ? 'is-on' : ''
            }
          />
        ))}
        <i className={step.kind !== 'beat' ? 'is-current' : ''} />
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
            <button type="button" onClick={advance} className="rv-panel">
              <p className="rv-meta">
                <span>{firstName ? `Your first reading, ${firstName}` : 'Your first reading'}</span>
                <span>{step.index + 1} of {beats.length}</span>
              </p>

              <motion.p
                initial={reducedMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ delay: reducedMotion ? 0 : 0.45, duration: 0.5 }}
                className="rv-beat"
              >
                {beats[step.index]}
              </motion.p>

              <p className="rv-more">
                Continue <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </p>
            </button>
          )}

          {/* ── Identity gate ── */}
          {step.kind === 'confirm' && (
            <div className="rv-panel rv-panel--center">
              <p className="rv-question">Is this you?</p>
              {sources.length > 0 && (
                <p className="rv-line">Read from {sources.slice(0, 4).join(', ')}</p>
              )}
              <div className="rv-actions">
                <button type="button" onClick={() => handleConfirm(true)} className="n-btn n-btn--primary">
                  <Check className="w-4 h-4" aria-hidden="true" /> Yes, that's me
                </button>
                <button type="button" onClick={() => handleConfirm(false)} className="n-btn n-btn--ghost">
                  <X className="w-4 h-4" aria-hidden="true" /> Not me
                </button>
              </div>
            </div>
          )}

          {/* ── Final card ── */}
          {step.kind === 'final' && (
            <div className="rv-panel">
              <p className="rv-meta"><span>Your soul signature, a first glimpse</span></p>
              {data.discovered_name && <p className="rv-name">{data.discovered_name}</p>}
              <p className="rv-beat">{beats[0]}</p>
              {sources.length > 0 && <p className="rv-line">{sources.join(', ')}</p>}
              <div className="rv-rule" />
              <p className="rv-line">
                This is only your public side. Connect Spotify, YouTube or Calendar and your twin learns the rest.
              </p>
              <div className="rv-actions">
                <button type="button" onClick={onCreateTwin} className="n-btn n-btn--primary">
                  Create your twin <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={handleSave} disabled={saving} className="n-btn n-btn--ghost">
                  <Download className="w-4 h-4" aria-hidden="true" /> {saving ? 'Rendering...' : 'Save your card'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
    </div>
  );
};

export default RevealStory;
