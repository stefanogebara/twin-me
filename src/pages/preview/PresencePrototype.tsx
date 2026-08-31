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
  UserRound,
  Volume2,
} from 'lucide-react';
import '@/styles/presence-system.css';

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

const STEPS: Array<{ id: StepId; short: string; eyebrow: string }> = [
  { id: 'welcome', short: 'Start', eyebrow: 'A new kind of presence' },
  { id: 'relationship', short: 'Bond', eyebrow: 'The relationship' },
  { id: 'voice', short: 'Voice', eyebrow: 'A familiar voice' },
  { id: 'interview', short: 'Style', eyebrow: 'How you show up' },
  { id: 'relay', short: 'Preview', eyebrow: 'The family relay' },
];

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

function Waveform({ active = false, compact = false }: { active?: boolean; compact?: boolean }) {
  const bars = compact ? 18 : 34;
  return (
    <div className={`presence-waveform ${active ? 'is-active' : ''}`} aria-hidden="true">
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
    <main className="presence-shell" id="main-content">
      <div className="presence-ambient" aria-hidden="true" />

      <header className="presence-nav">
        <button className="presence-wordmark" onClick={() => setStepIndex(0)} aria-label="Return to Presence start">
          twin<span>me</span><small>Presence</small>
        </button>
        <div className="presence-security-note">
          <ShieldCheck size={14} />
          Consent stays visible
        </div>
        <button className="presence-exit" onClick={onExit ?? (() => window.history.back())}>
          {persistDraft ? 'Save and exit' : 'Exit preview'}
        </button>
      </header>

      <div className="presence-layout">
        <aside className="presence-rail" aria-label="Onboarding progress">
          <div className="presence-progress-copy">
            <span>First presence</span>
            <strong>{Math.round(progress)}%</strong>
          </div>
          <div className="presence-progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <nav>
            {STEPS.map((step, index) => (
              <button
                key={step.id}
                className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-complete' : ''}
                onClick={() => setStepIndex(index)}
              >
                <span>{index < stepIndex ? <Check size={13} /> : index + 1}</span>
                {step.short}
              </button>
            ))}
          </nav>
          <blockquote>
            “A long conversation for her. A small, real reply from you.”
          </blockquote>
        </aside>

        <section className="presence-stage" aria-live="polite">
          <div className="presence-eyebrow">{currentStep.eyebrow}</div>

          {currentStep.id === 'welcome' && (
            <div className="presence-welcome presence-step">
              <div className="presence-welcome-copy">
                <h1>A little of your voice can carry a lot of love.</h1>
                <p>
                  Create a clearly identified AI presence that listens without rushing, keeps your relationship's language,
                  and brings the important parts back to you.
                </p>
                <div className="presence-promise-row">
                  <div><Clock3 size={17} /><span><strong>12 minutes</strong> to a first version</span></div>
                  <div><Mic size={17} /><span><strong>2 minutes</strong> of voice to begin</span></div>
                  <div><ShieldCheck size={17} /><span><strong>Your words</strong> stay attributable</span></div>
                </div>
              </div>
              <div className="presence-call-card">
                <div className="presence-call-topline">
                  <span>Today, 4:42 PM</span>
                  <span className="presence-live-dot">AI presence</span>
                </div>
                <div className="presence-portrait">
                  <div className="presence-portrait-initials">SG</div>
                  <span className="presence-portrait-ring" />
                  <span className="presence-portrait-ring presence-portrait-ring--two" />
                </div>
                <h2>Stefano's Presence</h2>
                <p>“I’m Stefano’s AI presence. He asked me to listen, and he’ll receive a short note after we talk.”</p>
                <Waveform />
                <button className="presence-round-button" aria-label="Preview voice"><Volume2 size={19} /></button>
              </div>
            </div>
          )}

          {currentStep.id === 'relationship' && (
            <div className="presence-step presence-form-step">
              <div className="presence-heading-row">
                <div>
                  <h1>Who are you showing up for?</h1>
                  <p>We start with the bond, not a generic personality profile.</p>
                </div>
                <span className="presence-duration">About 2 minutes</span>
              </div>

              <div className="presence-form-grid">
                <label>
                  <span>The person you care for</span>
                  <input value={caredForName} onChange={(event) => setDraft((current) => ({ ...current, caredForName: event.target.value }))} aria-label="The person you care for" />
                </label>
                <label>
                  <span>Your relationship</span>
                  <select value={relationship} onChange={(event) => setDraft((current) => ({ ...current, relationship: event.target.value }))} aria-label="Your relationship">
                    <option value="grandmother">Grandmother</option>
                    <option value="grandfather">Grandfather</option>
                    <option value="parent">Parent</option>
                    <option value="friend">Friend</option>
                  </select>
                </label>
                <label className="presence-form-wide">
                  <span>What does she call you?</span>
                  <input value={callerName} onChange={(event) => setDraft((current) => ({ ...current, callerName: event.target.value }))} aria-label="What does she call you" />
                  <small>The exact name the Presence will use aloud.</small>
                </label>
              </div>

              <div className="presence-tone-panel">
                <div>
                  <UserRound size={18} />
                  <span><strong>How are you together?</strong> Choose what feels true, not ideal.</span>
                </div>
                <div className="presence-chip-row">
                  {['Gentle teasing', 'Very affectionate', 'Calm and practical', 'Storytelling'].map((option) => (
                    <button key={option} className={tone === option ? 'is-selected' : ''} onClick={() => setDraft((current) => ({ ...current, tone: option }))}>
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'voice' && (
            <div className="presence-step presence-voice-step">
              <div className="presence-heading-row">
                <div>
                  <h1>Give it a voice she knows.</h1>
                  <p>Two useful minutes now. A higher-fidelity session can happen later.</p>
                </div>
                <span className="presence-duration">2–3 minutes</span>
              </div>

              <div className="presence-voice-grid">
                <div className="presence-recorder-card">
                  <div className="presence-recorder-header">
                    <span>Sample {promptIndex + 1} of {VOICE_PROMPTS.length}</span>
                    <span className={recordingState === 'recording' ? 'is-recording' : ''}>
                      {recordingState === 'recording' ? formatTime(recordingSeconds) : 'Quiet room recommended'}
                    </span>
                  </div>
                  <blockquote>{VOICE_PROMPTS[promptIndex]}</blockquote>
                  <Waveform active={recordingState === 'recording'} />
                  <div className="presence-recorder-actions">
                    {recordingState === 'idle' && (
                      <button className="presence-record-button" onClick={startRecording}><Mic size={18} /> Start recording</button>
                    )}
                    {recordingState === 'recording' && (
                      <button className="presence-record-button is-stop" onClick={stopRecording}><Square size={16} fill="currentColor" /> Stop</button>
                    )}
                    {recordingState === 'ready' && (
                      <>
                        <button className="presence-icon-action" onClick={togglePlayback} aria-label="Play recorded sample">
                          {isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
                        </button>
                        <button className="presence-text-action" onClick={startRecording}>Record again</button>
                        <button className="presence-record-button" onClick={buildVoice}>Build first voice</button>
                      </>
                    )}
                    {recordingState === 'processing' && (
                      <div className="presence-processing"><AudioLines size={18} /> Cleaning room noise and measuring cadence…</div>
                    )}
                    {recordingState === 'complete' && (
                      <div className="presence-voice-ready"><Check size={17} /> First voice profile ready for a live test</div>
                    )}
                  </div>
                  {audioUrl && (
                    <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="sr-only" />
                  )}
                  {micError && <p className="presence-mic-error">{micError}</p>}
                  <div className="presence-prompt-dots">
                    {VOICE_PROMPTS.map((_, index) => (
                      <button
                        key={index}
                        className={index === promptIndex ? 'is-current' : ''}
                        onClick={() => setPromptIndex(index)}
                        aria-label={`Use voice prompt ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>

                <aside className="presence-quality-card">
                  <div className="presence-quality-score">
                    <span>First-pass fidelity</span>
                    <strong>{recordingState === 'complete' ? '82' : '—'}<small>/100</small></strong>
                  </div>
                  <div className="presence-quality-line"><span>Clarity</span><i style={{ '--score': '88%' } as React.CSSProperties} /></div>
                  <div className="presence-quality-line"><span>Cadence</span><i style={{ '--score': '74%' } as React.CSSProperties} /></div>
                  <div className="presence-quality-line"><span>Warmth</span><i style={{ '--score': '83%' } as React.CSSProperties} /></div>
                  <p>Prototype only. A production clone would require provider verification before this score is shown.</p>
                  <label className="presence-consent-row">
                    <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                    <span>I am recording my own voice and consent to creating a clearly identified AI version.</span>
                  </label>
                </aside>
              </div>
            </div>
          )}

          {currentStep.id === 'interview' && (
            <div className="presence-step presence-interview-step">
              <div className="presence-heading-row">
                <div>
                  <h1>Teach the relationship, one truth at a time.</h1>
                  <p>The first interview is short. New questions appear only when they can improve the next conversation.</p>
                </div>
                <span className="presence-duration">5 minutes now</span>
              </div>

              <div className="presence-interview-card">
                <div className="presence-interview-meta">
                  <span>{INTERVIEW_CARDS[interviewIndex].label}</span>
                  <span>{interviewIndex + 1} / {INTERVIEW_CARDS.length}</span>
                </div>
                <h2>{INTERVIEW_CARDS[interviewIndex].prompt}</h2>
                <textarea defaultValue={INTERVIEW_CARDS[interviewIndex].answer} aria-label="Interview response" />
                <div className="presence-interview-controls">
                  <button className="presence-icon-action" aria-label="Answer by voice"><Mic size={17} /></button>
                  <span>You can speak or type. Natural answers train tone better than polished ones.</span>
                  <button
                    onClick={() => setInterviewIndex((index) => (index + 1) % INTERVIEW_CARDS.length)}
                  >
                    Save and ask another <ArrowRight size={15} />
                  </button>
                </div>
              </div>

              <div className="presence-learning-strip">
                <span>Already learned</span>
                <div><Check size={14} /> Gentle humor</div>
                <div><Check size={14} /> “Nunu” is private language</div>
                <div><Check size={14} /> Visits require approval</div>
              </div>
            </div>
          )}

          {currentStep.id === 'relay' && (
            <div className="presence-step presence-relay-step">
              <div className="presence-heading-row">
                <div>
                  <h1>Forty minutes become one meaningful minute.</h1>
                  <p>The AI carries context between you. It never pretends a generated sentence came from family.</p>
                </div>
                <span className="presence-duration">Live concept</span>
              </div>

              <div className="presence-relay-grid">
                <article className="presence-elder-card">
                  <div className="presence-card-label"><span>For {caredForName}</span><span>12:46 elapsed</span></div>
                  <div className="presence-mini-avatar">SG</div>
                  <h2>“And who taught you to make the cake that way?”</h2>
                  <p>Stefano's AI presence is listening</p>
                  <Waveform active compact />
                  <div className="presence-listening-pill"><Mic size={15} /> Listening patiently</div>
                </article>

                <div className="presence-relay-line" aria-hidden="true"><span>Summarize</span></div>

                <article className="presence-family-card">
                  <div className="presence-card-label"><span>For you</span><span>Today</span></div>
                  <h2>{caredForName} had a good, story-filled afternoon.</h2>
                  <ul>
                    <li>She bought ingredients for a chocolate cake.</li>
                    <li>She told a new detail about the family’s beach trip.</li>
                    <li><strong>She wants to know whether you can visit Sunday.</strong></li>
                  </ul>
                  <div className="presence-source-note"><ShieldCheck size={14} /> Summary generated from today’s conversation</div>
                  <div className="presence-reply-box">
                    <span>Your real reply</span>
                    <p>“Tell her Sunday works. I’ll come after lunch, and I want a large slice.”</p>
                    <button aria-label="Record a reply"><Mic size={16} /></button>
                  </div>
                </article>
              </div>

              <div className="presence-attribution-bar">
                <div><span className="presence-key presence-key--family" /> Family-sent words</div>
                <div><span className="presence-key presence-key--ai" /> AI-generated bridge language</div>
                <p>Promises, money, medicine and visits always require a verified family input.</p>
              </div>
            </div>
          )}

          <footer className="presence-stage-footer">
            <button onClick={previousStep} disabled={stepIndex === 0} className="presence-back-button">
              <ArrowLeft size={16} /> Back
            </button>
            <span>{currentStep.id === 'voice' ? 'You can improve fidelity later without repeating onboarding.' : 'Changes save automatically in this prototype.'}</span>
            {stepIndex < STEPS.length - 1 ? (
              <button onClick={nextStep} disabled={!canContinue} className="presence-next-button">
                {stepIndex === 0 ? 'Create a first presence' : 'Continue'} <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={() => setStepIndex(0)} className="presence-next-button">
                {persistDraft ? 'Review from the beginning' : 'Restart prototype'} <ArrowRight size={16} />
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
