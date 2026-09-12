import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  Clock3,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Square,
  Volume2,
} from 'lucide-react';
import { List, PageHead, Row, Section } from '@/components/register';
import '@/styles/register-public.css';
import '@/styles/presence-onboarding.css';

/**
 * PresenceExperience — the Presence onboarding (/presence/onboarding, and the
 * prototype at /preview/presence). In the register since 2026-09-12
 * (src/styles/presence-onboarding.css): an app screen, flat, the steps as plain
 * text links on the left, each step the kit's title and one grey line over
 * rows, fields and 32/4 choices. Every step, the saved draft, the recorder, the
 * playback, the consent and the interview cycle work as before.
 */

type StepId = 'welcome' | 'relationship' | 'voice' | 'interview' | 'relay';
type RecordingState = 'idle' | 'recording' | 'ready' | 'processing' | 'complete';

type PresenceDraft = {
  stepIndex: number;
  caredForName: string;
  relationship: string;
  callerName: string;
  tone: string;
};

type PresenceExperienceProps = {
  persistDraft?: boolean;
  onExit?: () => void;
};

const PRESENCE_DRAFT_KEY = 'twinme-presence-draft-v1';
const DEFAULT_DRAFT: PresenceDraft = {
  stepIndex: 0,
  caredForName: 'Anur',
  relationship: 'grandmother',
  callerName: 'Stéfano',
  tone: 'Gentle teasing',
};

const STEPS: Array<{ id: StepId; short: string }> = [
  { id: 'welcome', short: 'Start' },
  { id: 'relationship', short: 'Bond' },
  { id: 'voice', short: 'Voice' },
  { id: 'interview', short: 'Style' },
  { id: 'relay', short: 'Preview' },
];

const TONES = ['Gentle teasing', 'Very affectionate', 'Calm and practical', 'Storytelling'];

const VOICE_PROMPTS = [
  'Hi Grandma. I wish I could sit with you for every story, even on the busiest days.',
  'Tell me about the chocolate cake. I want to know who taught you to make it.',
  'I still laugh when I remember that windy afternoon at the beach with the whole family.',
];

const INTERVIEW_CARDS = [
  {
    label: 'Your natural warmth',
    prompt: 'When she repeats a story you have heard before, how do you usually respond?',
    answer: 'I tease her gently, then ask for the detail she left out last time.',
  },
  {
    label: 'Shared language',
    prompt: 'What names, phrases, or little jokes belong only to the two of you?',
    answer: 'I call her Nunu. She calls every good plan “a Sunday plan,” even on Tuesdays.',
  },
  {
    label: 'Boundaries',
    prompt: 'What should your Presence never say or promise without your direct input?',
    answer: 'Never promise a visit, discuss money, or give medical advice.',
  },
];

function loadPresenceDraft(persistDraft: boolean): PresenceDraft {
  if (!persistDraft) return DEFAULT_DRAFT;
  try {
    const stored = window.localStorage.getItem(PRESENCE_DRAFT_KEY);
    if (!stored) return DEFAULT_DRAFT;
    const parsed = JSON.parse(stored) as Partial<PresenceDraft>;
    return {
      ...DEFAULT_DRAFT,
      ...parsed,
      stepIndex: Math.min(Math.max(Number(parsed.stepIndex) || 0, 0), STEPS.length - 1),
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Presence's dot cluster: a 3x3 grid with the centre removed. */
function Mark() {
  return (
    <svg className="po-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" />
      <circle cx="14" cy="5" r="2.7" />
      <circle cx="23" cy="5" r="2.7" />
      <circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" />
      <circle cx="14" cy="23" r="2.7" />
      <circle cx="5" cy="23" r="2.7" />
      <circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

function Waveform({ active = false, compact = false }: { active?: boolean; compact?: boolean }) {
  const bars = compact ? 18 : 34;
  return (
    <div className={`po-wave${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => (
        <span
          key={index}
          style={{
            height: `${20 + ((index * 17 + 11) % 70)}%`,
            animationDelay: `${(index % 7) * -70}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** A duration beside a step's title. */
const Duration = ({ children }: { children: string }) => <span className="po-duration">{children}</span>;

export function PresenceExperience({ persistDraft = false, onExit }: PresenceExperienceProps) {
  const [draft, setDraft] = useState<PresenceDraft>(() => loadPresenceDraft(persistDraft));
  const { stepIndex, caredForName, relationship, callerName, tone } = draft;
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [promptIndex, setPromptIndex] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [consent, setConsent] = useState(true);
  const [interviewIndex, setInterviewIndex] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentStep = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const canContinue = useMemo(() => {
    if (currentStep.id === 'voice') return consent;
    return true;
  }, [consent, currentStep.id]);

  useEffect(() => {
    if (!persistDraft) return;
    window.localStorage.setItem(PRESENCE_DRAFT_KEY, JSON.stringify(draft));
  }, [draft, persistDraft]);

  useEffect(() => {
    if (recordingState !== 'recording') return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function startRecording() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      setRecordingSeconds(0);
      setRecordingState('recording');

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        setRecordingState('ready');
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start(250);
    } catch {
      setMicError('Microphone access is needed to record a local sample. You can still explore the prototype.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  function buildVoice() {
    setRecordingState('processing');
    window.setTimeout(() => setRecordingState('complete'), 1700);
  }

  function togglePlayback() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      void audioRef.current.play();
      setIsPlaying(true);
    }
  }

  function nextStep() {
    setDraft((current) => ({ ...current, stepIndex: Math.min(current.stepIndex + 1, STEPS.length - 1) }));
  }

  function previousStep() {
    setDraft((current) => ({ ...current, stepIndex: Math.max(current.stepIndex - 1, 0) }));
  }

  function setStepIndex(nextStepIndex: number) {
    setDraft((current) => ({ ...current, stepIndex: nextStepIndex }));
  }

  return (
    <main className="po" id="main-content">
      <header className="po-nav">
        <button type="button" className="po-brand" onClick={() => setStepIndex(0)} aria-label="Return to Presence start">
          <Mark />
          Presence
        </button>
        <span className="po-note">
          <ShieldCheck size={14} aria-hidden="true" />
          Consent stays visible
        </span>
        <button type="button" className="n-btn n-btn--ghost" onClick={onExit ?? (() => window.history.back())}>
          {persistDraft ? 'Save and exit' : 'Exit preview'}
        </button>
      </header>

      <div className="po-frame">
        <aside className="po-side" aria-label="Onboarding progress">
          <p className="po-progress">
            <span>First presence</span>
            <span>{Math.round(progress)}%</span>
          </p>
          <div className="po-track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <nav className="po-steps" aria-label="Steps">
            {STEPS.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={index < stepIndex ? 'is-complete' : undefined}
                aria-current={index === stepIndex ? 'step' : undefined}
                onClick={() => setStepIndex(index)}
              >
                <span>{index < stepIndex ? <Check size={13} aria-hidden="true" /> : index + 1}</span>
                {step.short}
              </button>
            ))}
          </nav>
        </aside>

        <section className="po-stage" aria-live="polite">
          <div>
            {currentStep.id === 'welcome' && (
              <div className="po-step">
                <PageHead
                  title="A little of your voice can carry a lot of love."
                  line="A clearly named AI presence that listens without rushing and brings the important parts back to you."
                />
                <List label="What it takes" className="rg-compact">
                  <Row icon={<Clock3 />} title="12 minutes" line="to a first version" />
                  <Row icon={<Mic />} title="2 minutes of voice" line="to begin" />
                  <Row icon={<ShieldCheck />} title="Your words" line="stay attributable to you" />
                </List>
                <Section title="How it introduces itself" className="po-gap">
                  <List label="The introduction" className="pb-stack">
                    <Row
                      icon={<span className="po-initials">SG</span>}
                      title="Stefano's Presence"
                      line="“I’m Stefano’s AI presence. He’ll get a short note after we talk.”"
                      action={
                        <button type="button" className="n-btn n-btn--ghost po-icon" aria-label="Preview voice">
                          <Volume2 size={16} aria-hidden="true" />
                        </button>
                      }
                    />
                  </List>
                </Section>
              </div>
            )}

            {currentStep.id === 'relationship' && (
              <div className="po-step">
                <PageHead
                  title="Who are you showing up for?"
                  line="We start with the bond, not a generic personality profile."
                  action={<Duration>About 2 minutes</Duration>}
                />
                <div className="po-form">
                  <label className="po-field">
                    <span className="po-label">The person you care for</span>
                    <input className="rg-input" value={caredForName} onChange={(event) => setDraft((current) => ({ ...current, caredForName: event.target.value }))} aria-label="The person you care for" />
                  </label>
                  <label className="po-field">
                    <span className="po-label">Your relationship</span>
                    <select className="rg-input" value={relationship} onChange={(event) => setDraft((current) => ({ ...current, relationship: event.target.value }))} aria-label="Your relationship">
                      <option value="grandmother">Grandmother</option>
                      <option value="grandfather">Grandfather</option>
                      <option value="parent">Parent</option>
                      <option value="friend">Friend</option>
                    </select>
                  </label>
                  <label className="po-field po-field--wide">
                    <span className="po-label">What does she call you?</span>
                    <input className="rg-input" value={callerName} onChange={(event) => setDraft((current) => ({ ...current, callerName: event.target.value }))} aria-label="What does she call you" />
                    <span className="po-hint">The exact name the Presence will use aloud.</span>
                  </label>
                </div>
                <fieldset className="po-field po-gap">
                  <legend className="po-label">How are you together?</legend>
                  <p className="po-hint">Choose what feels true, not ideal.</p>
                  <div className="rg-choices">
                    {TONES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="n-btn n-btn--ghost rg-choice"
                        aria-pressed={tone === option}
                        onClick={() => setDraft((current) => ({ ...current, tone: option }))}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {currentStep.id === 'voice' && (
              <div className="po-step">
                <PageHead
                  title="Give it a voice she knows."
                  line="Two useful minutes now. A higher-fidelity session can happen later."
                  action={<Duration>2–3 minutes</Duration>}
                />
                <div className="po-voice">
                  <section className="po-block" aria-label="Voice sample">
                    <p className="po-meta">
                      <span>Sample {promptIndex + 1} of {VOICE_PROMPTS.length}</span>
                      <span className={recordingState === 'recording' ? 'is-recording' : ''}>
                        {recordingState === 'recording' ? formatTime(recordingSeconds) : 'Quiet room recommended'}
                      </span>
                    </p>
                    <blockquote className="po-read">{VOICE_PROMPTS[promptIndex]}</blockquote>
                    <Waveform active={recordingState === 'recording'} />
                    <div className="po-actions">
                      {recordingState === 'idle' && (
                        <button type="button" className="n-btn n-btn--ghost" onClick={startRecording}><Mic size={16} aria-hidden="true" /> Start recording</button>
                      )}
                      {recordingState === 'recording' && (
                        <button type="button" className="n-btn rg-danger" onClick={stopRecording}><Square size={14} fill="currentColor" aria-hidden="true" /> Stop</button>
                      )}
                      {recordingState === 'ready' && (
                        <>
                          <button type="button" className="n-btn n-btn--ghost po-icon" onClick={togglePlayback} aria-label="Play recorded sample">
                            {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
                          </button>
                          <button type="button" className="n-btn n-btn--ghost" onClick={startRecording}>Record again</button>
                          <button type="button" className="n-btn n-btn--ghost" onClick={buildVoice}>Build first voice</button>
                        </>
                      )}
                      {recordingState === 'processing' && (
                        <p className="po-status"><AudioLines size={16} aria-hidden="true" /> Cleaning room noise and measuring cadence…</p>
                      )}
                      {recordingState === 'complete' && (
                        <p className="po-ok"><Check size={16} aria-hidden="true" /> First voice profile ready for a live test</p>
                      )}
                    </div>
                    {audioUrl && (
                      <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="sr-only" />
                    )}
                    {micError && <p className="po-error" role="alert">{micError}</p>}
                    <div className="po-dots">
                      {VOICE_PROMPTS.map((_, index) => (
                        <button
                          key={index}
                          type="button"
                          className={index === promptIndex ? 'is-current' : ''}
                          onClick={() => setPromptIndex(index)}
                          aria-label={`Use voice prompt ${index + 1}`}
                        />
                      ))}
                    </div>
                  </section>

                  <section aria-label="Voice quality">
                    <ul className="rg-list rg-compact rg-figures">
                      <li className="rg-row rg-row--plain">
                        <span className="rg-row-text"><span className="rg-row-title">First-pass fidelity</span></span>
                        <span className="rg-row-action">{recordingState === 'complete' ? '82' : '—'} / 100</span>
                      </li>
                      {[['Clarity', 88], ['Cadence', 74], ['Warmth', 83]].map(([label, score]) => (
                        <li key={label} className="rg-row rg-row--plain">
                          <span className="rg-row-text">
                            <span className="rg-row-title">{label}</span>
                            <span className="rg-bar" aria-hidden="true"><i style={{ width: `${score}%` }} /></span>
                          </span>
                          <span className="rg-row-action">{score}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="po-hint" style={{ marginTop: 16 }}>
                      Prototype only. A production clone would require provider verification before this score is shown.
                    </p>
                    <label className="po-consent">
                      <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                      <span>I am recording my own voice and consent to creating a clearly identified AI version.</span>
                    </label>
                  </section>
                </div>
              </div>
            )}

            {currentStep.id === 'interview' && (
              <div className="po-step">
                <PageHead
                  title="Teach the relationship, one truth at a time."
                  line="Short now. New questions appear only when they help the next conversation."
                  action={<Duration>5 minutes now</Duration>}
                />
                <section className="po-block" aria-label="Interview">
                  <p className="po-meta">
                    <span>{INTERVIEW_CARDS[interviewIndex].label}</span>
                    <span>{interviewIndex + 1} / {INTERVIEW_CARDS.length}</span>
                  </p>
                  <h2 className="po-question">{INTERVIEW_CARDS[interviewIndex].prompt}</h2>
                  <textarea className="rg-input rg-input--tall" defaultValue={INTERVIEW_CARDS[interviewIndex].answer} aria-label="Interview response" />
                  <div className="po-interview-controls">
                    <button type="button" className="n-btn n-btn--ghost po-icon" aria-label="Answer by voice"><Mic size={16} aria-hidden="true" /></button>
                    <span className="po-hint">Speak or type. Natural answers teach tone better than polished ones.</span>
                    <button
                      type="button"
                      className="n-btn n-btn--ghost"
                      onClick={() => setInterviewIndex((index) => (index + 1) % INTERVIEW_CARDS.length)}
                    >
                      Save and ask another <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </div>
                </section>
                <Section title="Already learned" className="po-gap">
                  <List label="Already learned" className="rg-compact">
                    <Row icon={<Check />} title="Gentle humor" />
                    <Row icon={<Check />} title="“Nunu” is private language" />
                    <Row icon={<Check />} title="Visits require approval" />
                  </List>
                </Section>
              </div>
            )}

            {currentStep.id === 'relay' && (
              <div className="po-step">
                <PageHead
                  title="Forty minutes become one meaningful minute."
                  line="The AI carries context between you. It never pretends a generated sentence came from family."
                  action={<Duration>Live concept</Duration>}
                />
                <div className="po-relay">
                  <section className="po-block" aria-label={`For ${caredForName}`}>
                    <p className="po-meta"><span>For {caredForName}</span><span>12:46 elapsed</span></p>
                    <span className="po-initials" aria-hidden="true">SG</span>
                    <p className="po-quote">“And who taught you to make the cake that way?”</p>
                    <p className="po-hint">Stefano's AI presence is listening</p>
                    <Waveform active compact />
                    <p className="po-status"><Mic size={15} aria-hidden="true" /> Listening patiently</p>
                  </section>

                  <section className="po-block" aria-label="For you">
                    <p className="po-meta"><span>For you</span><span>Today</span></p>
                    <h2 className="po-question">{caredForName} had a good, story-filled afternoon.</h2>
                    <ul className="rg-list rg-compact">
                      <li className="rg-row rg-row--plain"><span className="rg-row-text"><span className="rg-row-line">She bought ingredients for a chocolate cake.</span></span><span /></li>
                      <li className="rg-row rg-row--plain"><span className="rg-row-text"><span className="rg-row-line">She told a new detail about the family’s beach trip.</span></span><span /></li>
                      <li className="rg-row rg-row--plain"><span className="rg-row-text"><span className="rg-row-title">She wants to know whether you can visit Sunday.</span></span><span /></li>
                    </ul>
                    <p className="po-ok"><ShieldCheck size={14} aria-hidden="true" /> Summary generated from today’s conversation</p>
                    <div className="po-reply">
                      <span className="po-label">Your real reply</span>
                      <p>“Tell her Sunday works. I’ll come after lunch, and I want a large slice.”</p>
                      <button type="button" className="n-btn n-btn--ghost po-icon" aria-label="Record a reply"><Mic size={16} aria-hidden="true" /></button>
                    </div>
                  </section>
                </div>
                <ul className="po-legend">
                  <li><span className="po-key po-key--family" aria-hidden="true" /> Family-sent words</li>
                  <li><span className="po-key po-key--ai" aria-hidden="true" /> AI-generated bridge language</li>
                  <li>Promises, money, medicine and visits always require a verified family input.</li>
                </ul>
              </div>
            )}
          </div>

          <footer className="po-foot">
            <button type="button" onClick={previousStep} disabled={stepIndex === 0} className="n-btn n-btn--ghost">
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <span className="po-hint">{currentStep.id === 'voice' ? 'You can improve fidelity later without repeating onboarding.' : 'Changes save automatically.'}</span>
            {stepIndex < STEPS.length - 1 ? (
              <button type="button" onClick={nextStep} disabled={!canContinue} className="n-btn n-btn--primary">
                {stepIndex === 0 ? 'Create a first presence' : 'Continue'} <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={() => setStepIndex(0)} className="n-btn n-btn--primary">
                {persistDraft ? 'Review from the beginning' : 'Restart prototype'} <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}

export default function PresencePrototype() {
  return <PresenceExperience />;
}
