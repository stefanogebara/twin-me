import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock,
  MessageCircle,
  Mic,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Square,
  User,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { presenceAPI } from '@/services/api/presenceAPI';
import '@/styles/presence-cosmos.css';
import '@/styles/presence-onboarding.css';

/**
 * /presence/onboarding — seven steps on the Cosmos system.
 *
 *   start → bond → about → review → voice (consent first) → style → relay
 *
 * The "About" voice note is the primary input: it is transcribed and mined server-side
 * (people, story anchors, boundaries, life facts, tone hint) and prefills "Review" — one
 * screen where the family checks what was understood: her people, her stories, and what
 * to never bring up. Typed fields remain the fallback and the correction surface.
 * (Plans: 2026-08-31-presence-onboarding-system, 2026-08-31-presence-context-architecture §4.)
 *
 * Persistence: localStorage draft (v5) is the local source of truth; step completion also
 * syncs best-effort to /api/presence (fire-and-forget). Server writes happen only in
 * persistDraft mode (the authed route), never in the preview.
 */

type StepId = 'start' | 'bond' | 'about' | 'review' | 'voice' | 'style' | 'relay';
type RecordingState = 'idle' | 'recording' | 'ready' | 'processing' | 'queued' | 'cloned' | 'failed';
type AboutRec = 'idle' | 'recording' | 'ready' | 'processing' | 'done';

type Person = { name: string; relation: string; calledBy: string };

type PresenceDraft = {
  stepIndex: number;
  serverId: string | null;
  caredForName: string;
  relationship: string;
  callerName: string;
  tone: string;
  consent: boolean;
  people: Person[];
  anchors: { place: string; dish: string; person: string };
  boundaries: string[];
  answers: string[];
  firstNote: string;
  aboutText: string;
  aboutTranscript: string;
  aboutCounts: { people: number; anchors: number; boundaries: number; facts: number } | null;
};

const DRAFT_KEY = 'twinme-presence-draft-v5';

const DEFAULT_DRAFT: PresenceDraft = {
  stepIndex: 0,
  serverId: null,
  caredForName: '',
  relationship: 'grandmother',
  callerName: '',
  tone: 'Gentle teasing',
  consent: false,
  people: [
    { name: '', relation: '', calledBy: '' },
    { name: '', relation: '', calledBy: '' },
  ],
  anchors: { place: '', dish: '', person: '' },
  boundaries: [''],
  answers: ['', ''],
  firstNote: '',
  aboutText: '',
  aboutTranscript: '',
  aboutCounts: null,
};

const STEPS: Array<{ id: StepId; short: string; eyebrow: string }> = [
  { id: 'start', short: 'Start', eyebrow: 'A new kind of presence' },
  { id: 'bond', short: 'Bond', eyebrow: 'The relationship' },
  { id: 'about', short: 'About', eyebrow: 'Tell me about her' },
  { id: 'review', short: 'Review', eyebrow: 'What I understood' },
  { id: 'voice', short: 'Voice', eyebrow: 'Consent, then voice' },
  { id: 'style', short: 'Style', eyebrow: 'How you show up' },
  { id: 'relay', short: 'Relay', eyebrow: 'The family relay' },
];

const TONES = ['Gentle teasing', 'Very affectionate', 'Calm and practical', 'Storytelling'];

const VOICE_PROMPTS = [
  'Hi. I wish I could sit with you for every story, even on the busiest days.',
  'Tell me about the chocolate cake. I want to know who taught you to make it.',
  'I still laugh when I remember that windy afternoon at the beach.',
];

const CONSENT_TEXT_VERSION =
  'own-voice-v1 (2026-08-31): I am recording my own voice and consent to a clearly identified AI version of it. Revocable at any time; revoking disables the voice.';

// Style: the two codebook questions that a voice note rarely answers by itself.
const QUESTIONS: Array<{ kind: 'tone' | 'language'; label: string; prompt: string; placeholder: string }> = [
  {
    kind: 'tone',
    label: 'Your natural warmth',
    prompt: 'When she repeats a story you have heard before, how do you usually respond?',
    placeholder: 'I tease her gently, then ask for the detail she left out last time.',
  },
  {
    kind: 'language',
    label: 'Shared language',
    prompt: 'What names, phrases, or little jokes belong only to the two of you?',
    placeholder: 'I call her Nunu. She calls every good plan a Sunday plan, even on Tuesdays.',
  },
];

const ANCHORS: Array<{ key: keyof PresenceDraft['anchors']; label: string; placeholder: string }> = [
  { key: 'place', label: 'A place that matters to her', placeholder: 'The beach house in Ubatuba' },
  { key: 'dish', label: 'A dish or recipe with a story', placeholder: 'Her chocolate cake, from her mother' },
  { key: 'person', label: 'A person she loves telling stories about', placeholder: 'Her sister Teresa, who taught her to swim' },
];

function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
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

function Waveform({ active = false }: { active?: boolean }) {
  return (
    <div className={`pc-ob-wave ${active ? 'is-active' : ''}`} aria-hidden="true">
      {Array.from({ length: 34 }, (_, index) => (
        <span key={index} style={{ height: `${22 + ((index * 17 + 11) % 66)}%`, animationDelay: `${(index % 7) * -70}ms` }} />
      ))}
    </div>
  );
}

/** The landing page's nav pill stores a typed note here before sign-in (same key
    as PRESENCE_PENDING_NOTE_KEY in PresenceLandingPage). It becomes the first note
    unless the draft already has one, and is consumed on read. */
const PENDING_NOTE_KEY = 'presence-pending-note';

function withPendingNote(draft: PresenceDraft): PresenceDraft {
  try {
    const pending = window.sessionStorage.getItem(PENDING_NOTE_KEY);
    if (!pending) return draft;
    window.sessionStorage.removeItem(PENDING_NOTE_KEY);
    return draft.firstNote.trim() ? draft : { ...draft, firstNote: pending };
  } catch {
    return draft;
  }
}

function loadDraft(persist: boolean): PresenceDraft {
  return withPendingNote(loadStoredDraft(persist));
}

function loadStoredDraft(persist: boolean): PresenceDraft {
  if (!persist) return DEFAULT_DRAFT;
  try {
    const stored = window.localStorage.getItem(DRAFT_KEY);
    if (!stored) return DEFAULT_DRAFT;
    const parsed = JSON.parse(stored) as Partial<PresenceDraft>;
    return {
      ...DEFAULT_DRAFT,
      ...parsed,
      people: Array.isArray(parsed.people) && parsed.people.length > 0
        ? parsed.people.map((p) => ({ name: String(p?.name ?? ''), relation: String(p?.relation ?? ''), calledBy: String(p?.calledBy ?? '') }))
        : DEFAULT_DRAFT.people,
      anchors: { ...DEFAULT_DRAFT.anchors, ...(parsed.anchors ?? {}) },
      boundaries: Array.isArray(parsed.boundaries) && parsed.boundaries.length > 0 ? parsed.boundaries.map(String) : DEFAULT_DRAFT.boundaries,
      answers: Array.isArray(parsed.answers) && parsed.answers.length === 2 ? parsed.answers.map(String) : DEFAULT_DRAFT.answers,
      aboutCounts: parsed.aboutCounts && typeof parsed.aboutCounts === 'object' ? parsed.aboutCounts : null,
      stepIndex: Math.min(Math.max(Number(parsed.stepIndex) || 0, 0), STEPS.length - 1),
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

/** Lowercase the first letter so a user-typed anchor reads naturally mid-sentence. */
function decap(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

type Props = { persistDraft?: boolean; onExit?: () => void };

export function PresenceOnboardingExperience({ persistDraft = false, onExit }: Props) {
  const [draft, setDraft] = useState<PresenceDraft>(() => loadDraft(persistDraft));
  const { stepIndex, caredForName, relationship, callerName, tone, consent, people, anchors, boundaries, answers, firstNote, aboutCounts } = draft;

  // Voice-sample recorder
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [promptIndex, setPromptIndex] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const voiceBlobRef = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // "About her" recorder — separate from the voice-sample recorder.
  const [aboutRec, setAboutRec] = useState<AboutRec>(draft.aboutCounts ? 'done' : 'idle');
  const [aboutSeconds, setAboutSeconds] = useState(0);
  const [aboutError, setAboutError] = useState<string | null>(null);
  const aboutRecorderRef = useRef<MediaRecorder | null>(null);
  const aboutStreamRef = useRef<MediaStream | null>(null);
  const aboutChunksRef = useRef<Blob[]>([]);
  const aboutBlobRef = useRef<Blob | null>(null);

  const [questionIndex, setQuestionIndex] = useState(0);
  const draftRef = useRef(draft);
  const creatingRef = useRef<Promise<string | null> | null>(null);
  const consentSentRef = useRef(false);

  const step = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;
  const displayName = caredForName.trim() || 'her';
  const answeredCount = answers.filter((a) => a.trim()).length;
  const understood = Boolean(aboutCounts);

  const canContinue = useMemo(() => (step.id === 'voice' ? consent : true), [consent, step.id]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!persistDraft) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, persistDraft]);

  // Resume from the server once per mount: adopt the server presence id, and its
  // fields only when the local draft is untouched.
  useEffect(() => {
    if (!persistDraft) return;
    let cancelled = false;
    void presenceAPI.mine().then((response) => {
      if (cancelled || !response?.presence) return;
      const server = response.presence;
      setDraft((current) => ({
        ...current,
        serverId: server.id,
        ...(current.caredForName.trim() === '' && server.cared_for_name
          ? { caredForName: server.cared_for_name, relationship: server.relationship || current.relationship, callerName: server.caller_name, tone: server.tone || current.tone }
          : {}),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [persistDraft]);

  useEffect(() => {
    if (recordingState !== 'recording') return;
    const timer = window.setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    if (aboutRec !== 'recording') return;
    const timer = window.setInterval(() => setAboutSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [aboutRec]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      aboutStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const patch = (partial: Partial<PresenceDraft>) => setDraft((current) => ({ ...current, ...partial }));

  /** Get (or lazily create) the server-side presence. Null in preview / offline. */
  async function ensureServer(): Promise<string | null> {
    if (!persistDraft) return null;
    const existing = draftRef.current.serverId;
    if (existing) return existing;
    if (!creatingRef.current) {
      const d = draftRef.current;
      creatingRef.current = presenceAPI
        .create({ cared_for_name: d.caredForName, relationship: d.relationship, caller_name: d.callerName, tone: d.tone })
        .then((response) => {
          const id = response?.presence?.id ?? null;
          if (id) patch({ serverId: id });
          return id;
        })
        .finally(() => {
          creatingRef.current = null;
        });
    }
    return creatingRef.current;
  }

  /** Best-effort sync when leaving a step. Never blocks navigation. */
  function syncStep(leaving: StepId) {
    if (!persistDraft) return;
    void (async () => {
      const d = draftRef.current;
      const id = await ensureServer();
      if (!id) return;
      switch (leaving) {
        case 'bond':
          await presenceAPI.patch(id, { cared_for_name: d.caredForName, relationship: d.relationship, caller_name: d.callerName, tone: d.tone });
          break;
        case 'review':
          await presenceAPI.savePeople(
            id,
            d.people.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), relation: p.relation.trim(), called_by: p.calledBy.trim() })),
          );
          for (const anchor of ANCHORS) {
            const value = d.anchors[anchor.key]?.trim();
            if (value) await presenceAPI.saveFact(id, 'anchor', anchor.label, value);
          }
          for (const boundary of d.boundaries) {
            const text = boundary.trim();
            if (text) await presenceAPI.saveFact(id, 'boundary', text.slice(0, 200), text);
          }
          break;
        case 'style':
          for (const [index, question] of QUESTIONS.entries()) {
            const answer = d.answers[index]?.trim();
            if (answer) await presenceAPI.saveFact(id, question.kind, question.prompt, answer);
          }
          break;
        default:
          break;
      }
    })();
  }

  // Consent is evidence: append it the moment it is given, exactly once per session.
  useEffect(() => {
    if (!persistDraft || !consent || consentSentRef.current) return;
    consentSentRef.current = true;
    void (async () => {
      const id = await ensureServer();
      if (id) await presenceAPI.consent(id, 'own_voice', CONSENT_TEXT_VERSION);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent, persistDraft]);

  // ---------- About her ----------
  async function startAboutRecording() {
    setAboutError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const recorder = new MediaRecorder(stream);
      aboutStreamRef.current = stream;
      aboutRecorderRef.current = recorder;
      aboutChunksRef.current = [];
      setAboutSeconds(0);
      setAboutRec('recording');
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) aboutChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        aboutBlobRef.current = new Blob(aboutChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAboutRec('ready');
        stream.getTracks().forEach((track) => track.stop());
        aboutStreamRef.current = null;
      };
      recorder.start(250);
    } catch {
      setAboutError('Microphone access is needed to record. You can write instead.');
    }
  }

  function stopAboutRecording() {
    if (aboutRecorderRef.current?.state === 'recording') aboutRecorderRef.current.stop();
  }

  /** Send the voice note (or typed text) for transcription + extraction, then prefill Review. */
  async function analyzeAbout(input: { audio?: Blob; text?: string }) {
    setAboutError(null);
    setAboutRec('processing');
    const id = await ensureServer();
    if (!id) {
      setAboutRec(input.audio ? 'ready' : 'idle');
      setAboutError(persistDraft ? 'Could not reach the server. Try again in a moment.' : 'Analysis runs once you are signed in — the preview keeps your text.');
      return;
    }
    const result = await presenceAPI.about(id, input);
    if (!result?.success) {
      setAboutRec(input.audio ? 'ready' : 'idle');
      setAboutError('Could not understand the recording. Try again, or write a few lines instead.');
      return;
    }
    const ex = result.extracted;
    setDraft((current) => {
      const merged = current.people.filter((p) => p.name.trim());
      const known = new Set(merged.map((p) => p.name.trim().toLowerCase()));
      for (const person of ex.people) {
        if (!known.has(person.name.toLowerCase()) && merged.length < 6) {
          merged.push({ name: person.name, relation: person.relation, calledBy: person.called_by });
          known.add(person.name.toLowerCase());
        }
      }
      const nextAnchors = { ...current.anchors };
      for (const anchor of ex.anchors) {
        if (anchor.kind === 'place' && !nextAnchors.place) nextAnchors.place = anchor.value;
        if (anchor.kind === 'dish' && !nextAnchors.dish) nextAnchors.dish = anchor.value;
        if (anchor.kind === 'person' && !nextAnchors.person) nextAnchors.person = anchor.value;
      }
      const existingBoundaries = current.boundaries.map((b) => b.trim()).filter(Boolean);
      const nextBoundaries = [...existingBoundaries];
      for (const b of ex.boundaries) if (!nextBoundaries.some((x) => x.toLowerCase() === b.toLowerCase())) nextBoundaries.push(b);
      return {
        ...current,
        people: merged.length ? merged : current.people,
        anchors: nextAnchors,
        boundaries: nextBoundaries.length ? nextBoundaries : current.boundaries,
        tone: TONES.includes(ex.tone_hint) ? ex.tone_hint : current.tone,
        aboutTranscript: result.transcript,
        aboutCounts: { people: ex.people.length, anchors: ex.anchors.length, boundaries: ex.boundaries.length, facts: ex.facts.length },
      };
    });
    setAboutRec('done');
  }

  // ---------- Voice samples ----------
  async function startRecording() {
    if (!consent) return;
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
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
        voiceBlobRef.current = blob;
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        setRecordingState('ready');
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start(250);
    } catch {
      setMicError('Microphone access is needed to record a sample. You can continue and record later.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  /** Upload the sample; the server clones (flag on) or queues, and says which. */
  function queueVoiceBuild() {
    setRecordingState('processing');
    const seconds = recordingSeconds;
    const blob = voiceBlobRef.current;
    void (async () => {
      const id = persistDraft ? await ensureServer() : null;
      if (!id || !blob) {
        window.setTimeout(() => setRecordingState('queued'), 900);
        return;
      }
      const result = await presenceAPI.uploadVoiceSample(id, blob, seconds);
      if (!result?.success) {
        setRecordingState('failed');
        setVoiceNote('The sample could not be uploaded. You can try again or continue and record later.');
        return;
      }
      setVoiceNote(result.voice.note || '');
      setRecordingState(result.voice.status === 'ready' ? 'cloned' : result.voice.status === 'failed' ? 'failed' : 'queued');
    })();
  }

  function recordAnotherSample() {
    voiceBlobRef.current = null;
    setPromptIndex((index) => (index + 1) % VOICE_PROMPTS.length);
    setRecordingState('idle');
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

  // ---------- Navigation ----------
  const goTo = (index: number) => patch({ stepIndex: Math.min(Math.max(index, 0), STEPS.length - 1) });

  function continueFrom(currentIndex: number) {
    syncStep(STEPS[currentIndex].id);
    goTo(currentIndex + 1);
  }

  function finishSetup() {
    if (persistDraft) {
      void (async () => {
        const d = draftRef.current;
        const id = await ensureServer();
        if (!id) return;
        if (d.firstNote.trim()) await presenceAPI.queueNote(id, d.firstNote.trim());
        await presenceAPI.patch(id, { status: 'active' });
      })();
    }
    if (onExit) onExit();
    else goTo(0);
  }

  const setPerson = (index: number, field: keyof Person, value: string) =>
    patch({ people: people.map((p, i) => (i === index ? { ...p, [field]: value } : p)) });
  const setBoundary = (index: number, value: string) =>
    patch({ boundaries: boundaries.map((b, i) => (i === index ? value : b)) });

  const [menuOpen, setMenuOpen] = useState(false);

  const voiceReady = recordingState === 'cloned' || recordingState === 'queued';
  const namedPeople = people.filter((p) => p.name.trim()).length;
  const keptStories = ANCHORS.filter((a) => anchors[a.key]?.trim()).length;

  // The accreting record, in the sidebar. Order is the order it fills in, so
  // it reads as a thing being written rather than a form mirror.
  const plateFacts: Array<{ k: string; v: string; empty: string }> = [
    { k: 'Calls you', v: callerName.trim(), empty: 'not yet' },
    { k: 'Together', v: tone, empty: 'not chosen' },
    { k: 'Voice', v: voiceReady ? 'Yours' : consent ? 'Consented' : '', empty: 'not recorded' },
    { k: 'Her people', v: namedPeople ? `${namedPeople} named` : '', empty: 'none yet' },
    { k: 'Her stories', v: keptStories ? `${keptStories} kept` : '', empty: 'none yet' },
  ];

  const aboutLine =
    aboutRec === 'recording' ? formatTime(aboutSeconds)
      : aboutRec === 'ready' ? 'Recorded. Use it, or record again.'
        : aboutRec === 'processing' ? 'Listening and taking notes…'
          : 'About two minutes, in your own words.';

  const sampleLine =
    recordingState === 'recording' ? formatTime(recordingSeconds)
      : recordingState === 'ready' ? 'Listen back, or record again.'
        : recordingState === 'processing' ? 'Building your voice…'
          : recordingState === 'queued' ? 'Saved. Your voice build is queued; we tell you when it is ready.'
            : recordingState === 'cloned' ? voiceNote || 'Your voice is ready. Her calls use it from now on.'
              : recordingState === 'failed' ? voiceNote || 'Something went wrong with the sample.'
                : `Sample ${promptIndex + 1} of ${VOICE_PROMPTS.length}. A quiet room helps.`;

  return (
    <main className="presence-cosmos pc-app obx" id="main-content">
      <div className="pc-shell">
        <div className="pc-topbar">
          <Link className="pc-side-brand" to="/presence" aria-label="Presence home"><Mark /></Link>
          <button
            className="pc-btn pc-btn--ghost"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="obx-side"
          >
            Step {stepIndex + 1} of {STEPS.length}
          </button>
        </div>

        {/* ------------------------------------------------ the sidebar -- */}
        <aside className={`pc-side${menuOpen ? ' is-open' : ''}`} id="obx-side" aria-label="Your progress">
          <Link className="pc-side-brand" to="/presence" aria-label="Presence home"><Mark /></Link>

          {/* The steps as plain links: the done ones go back, the rest wait. */}
          <nav className="pc-side-nav" aria-label="Onboarding steps">
            {STEPS.map((s, index) => (
              <button
                key={s.id}
                className="pc-side-link"
                onClick={() => {
                  if (index < stepIndex) {
                    goTo(index);
                    setMenuOpen(false);
                  }
                }}
                disabled={index > stepIndex}
                aria-current={index === stepIndex ? 'step' : undefined}
              >
                {s.short}
              </button>
            ))}
          </nav>

          {/* The thing being made: it starts nearly empty and fills in as the
              answers arrive. */}
          <div className="obx-record">
            <p className={`obx-record-name${caredForName.trim() ? '' : ' is-empty'}`}>{caredForName.trim() || 'Her name'}</p>
            <p className="pc-side-note">{relationship ? `Your ${relationship}` : 'Someone you love'}</p>
            <dl className="obx-facts">
              {plateFacts.map((f) => (
                <div className="obx-fact" key={f.k}>
                  <dt>{f.k}</dt>
                  <dd className={f.v ? '' : 'is-empty'}>{f.v || f.empty}</dd>
                </div>
              ))}
            </dl>
            <p className="pc-side-note">{voiceReady ? 'Ready to call' : 'Saved as you go'}</p>
          </div>

          <button className="pc-side-link" onClick={onExit ?? (() => window.history.back())}>
            {persistDraft ? 'Save and exit' : 'Exit preview'}
          </button>
        </aside>

        {/* ------------------------------------------------- the column -- */}
        <section className="pc-col" aria-live="polite">
          <div className="obx-step" key={step.id}>
            {step.id === 'start' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">A little of your voice carries a lot of love.</h1>
                  <p className="pc-apphead-line">A clearly labelled AI that listens without rushing, and brings what matters back to you.</p>
                </header>
                <section className="pc-appsection">
                  <ul className="pc-list">
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><Clock /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">About ten minutes</p>
                        <p className="pc-row-line">Two of them are your voice.</p>
                      </div>
                    </li>
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><BadgeCheck /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">Always labelled as AI</p>
                        <p className="pc-row-line">It never pretends a sentence came from you.</p>
                      </div>
                    </li>
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><ShieldCheck /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">You stay in control</p>
                        <p className="pc-row-line">Visits, money and medicine need a person. Pause or delete anytime.</p>
                      </div>
                    </li>
                  </ul>
                </section>
              </>
            )}

            {step.id === 'bond' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">Who are you showing up for?</h1>
                  <p className="pc-apphead-line">The relationship first, not a personality quiz.</p>
                </header>
                <section className="pc-appsection">
                  <ul className="pc-list">
                    <li>
                      <label className="pc-row pc-row--plain obx-fieldrow">
                        <span className="pc-row-text"><span className="pc-row-title">The person you care for</span></span>
                        <input className="pc-input" value={caredForName} placeholder="Sofia" onChange={(event) => patch({ caredForName: event.target.value })} />
                      </label>
                    </li>
                    <li>
                      <label className="pc-row pc-row--plain obx-fieldrow">
                        <span className="pc-row-text"><span className="pc-row-title">Your relationship</span></span>
                        <span className="pc-select">
                          <select className="pc-input" value={relationship} onChange={(event) => patch({ relationship: event.target.value })}>
                            <option value="grandmother">Grandmother</option>
                            <option value="grandfather">Grandfather</option>
                            <option value="mother">Mother</option>
                            <option value="father">Father</option>
                            <option value="aunt">Aunt or uncle</option>
                            <option value="friend">Friend</option>
                          </select>
                          <ChevronDown aria-hidden="true" />
                        </span>
                      </label>
                    </li>
                    <li>
                      <label className="pc-row pc-row--plain obx-fieldrow">
                        <span className="pc-row-text">
                          <span className="pc-row-title">What she calls you</span>
                          <span className="pc-row-line">The exact name the Presence says aloud.</span>
                        </span>
                        <input className="pc-input" value={callerName} placeholder="Ana" onChange={(event) => patch({ callerName: event.target.value })} />
                      </label>
                    </li>
                  </ul>
                </section>
                <section className="pc-appsection">
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">How you are together</h2>
                    <p className="pc-sechead-line">Choose what feels true, not ideal.</p>
                  </div>
                  <ul className="pc-list">
                    <li className="pc-row pc-row--plain">
                      <div className="obx-chips" role="group" aria-label="How you are together">
                        {TONES.map((option) => (
                          <button
                            key={option}
                            className="pc-btn pc-btn--ghost obx-chip"
                            aria-pressed={tone === option}
                            onClick={() => patch({ tone: option })}
                          >
                            {tone === option ? <Check size={14} aria-hidden="true" /> : null}
                            {option}
                          </button>
                        ))}
                      </div>
                    </li>
                  </ul>
                </section>
              </>
            )}

            {step.id === 'about' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">Tell me about {displayName} like you'd tell a friend.</h1>
                  <p className="pc-apphead-line">Who is around her, what she loves, what to never bring up. You check it all next.</p>
                </header>
                {aboutRec === 'done' && aboutCounts ? (
                  <section className="pc-appsection">
                    <ul className="pc-list">
                      <li className="pc-row">
                        <span className="pc-row-icon" aria-hidden="true"><Check /></span>
                        <div className="pc-row-text">
                          <p className="pc-row-title">Understood</p>
                          <p className="pc-row-line">
                            {aboutCounts.people} {aboutCounts.people === 1 ? 'person' : 'people'}
                            {' · '}{aboutCounts.anchors} {aboutCounts.anchors === 1 ? 'story' : 'stories'}
                            {' · '}{aboutCounts.boundaries} {aboutCounts.boundaries === 1 ? 'boundary' : 'boundaries'}
                            {' · '}{aboutCounts.facts} facts
                          </p>
                        </div>
                        <div className="pc-row-action">
                          <button className="pc-btn pc-btn--ghost" onClick={() => { setAboutRec('idle'); aboutBlobRef.current = null; }}>
                            Redo
                          </button>
                        </div>
                      </li>
                    </ul>
                  </section>
                ) : (
                  <>
                    <section className="pc-appsection">
                      <ul className="pc-list">
                        <li className="pc-row">
                          <span className="pc-row-icon" aria-hidden="true"><Mic /></span>
                          <div className="pc-row-text">
                            <p className="pc-row-title">Record a voice note</p>
                            <p className="pc-row-line">{aboutLine}</p>
                          </div>
                          <div className="pc-row-action">
                            {aboutRec === 'idle' && (
                              <button className="pc-btn pc-btn--ghost" onClick={startAboutRecording}>Record</button>
                            )}
                            {aboutRec === 'recording' && (
                              <button className="pc-btn pc-btn--ghost" onClick={stopAboutRecording}><Square size={12} fill="currentColor" /> Stop</button>
                            )}
                            {aboutRec === 'ready' && (
                              <button className="pc-btn pc-btn--ghost" onClick={() => aboutBlobRef.current && analyzeAbout({ audio: aboutBlobRef.current })}>
                                Use it
                              </button>
                            )}
                            {aboutRec === 'processing' && <AudioLines className="pc-chevron" aria-hidden="true" />}
                          </div>
                        </li>
                        {aboutRec === 'recording' && (
                          <li className="pc-subrow"><Waveform active /></li>
                        )}
                        {aboutRec === 'ready' && (
                          <li className="pc-subrow">
                            <span />
                            <button className="pc-btn pc-btn--ghost" onClick={startAboutRecording}>Record again</button>
                          </li>
                        )}
                        {aboutError && (
                          <li className="pc-subrow"><p className="obx-error" role="alert">{aboutError}</p></li>
                        )}
                      </ul>
                    </section>
                    <section className="pc-appsection">
                      <div className="pc-sechead">
                        <h2 className="pc-sechead-title">Or write it</h2>
                        <p className="pc-sechead-line">A few lines are enough.</p>
                      </div>
                      <ul className="pc-list">
                        <li className="pc-row pc-row--plain obx-form">
                          <textarea
                            className="pc-input"
                            value={draft.aboutText}
                            placeholder="Sofia lives alone in Santos since my grandfather passed. Her daughter Rê has lunch with her on Sundays. She loves talking about the beach house in Ubatuba and her mother's kibbeh. Never bring up the sale of the house."
                            onChange={(event) => patch({ aboutText: event.target.value })}
                            aria-label="Tell me about her"
                          />
                          <div className="obx-form-actions">
                            <button
                              className="pc-btn pc-btn--ghost"
                              disabled={!draft.aboutText.trim() || aboutRec === 'processing'}
                              onClick={() => analyzeAbout({ text: draft.aboutText.trim() })}
                            >
                              Use what I wrote
                            </button>
                          </div>
                        </li>
                      </ul>
                    </section>
                  </>
                )}
                <p className="pc-empty">You can skip this. The first call will just know less.</p>
              </>
            )}

            {step.id === 'review' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">{understood ? 'Here is what I understood.' : `Who is around ${displayName}.`}</h1>
                  <p className="pc-apphead-line">
                    {understood
                      ? 'Fix anything that is off. The Presence checks this before it speaks.'
                      : 'The Presence checks this before it mentions anyone.'}
                  </p>
                </header>

                <section className="pc-appsection">
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">Her people</h2>
                    <p className="pc-sechead-line">Passed away? Say so in the relation, like “husband (deceased)”.</p>
                    {people.length < 8 && (
                      <button
                        className="pc-iconbtn pc-sechead-add"
                        onClick={() => patch({ people: [...people, { name: '', relation: '', calledBy: '' }] })}
                        aria-label="Add a person"
                      >
                        <Plus />
                      </button>
                    )}
                  </div>
                  <ul className="pc-list">
                    {people.map((person, index) => (
                      <li className="pc-row pc-row--plain obx-person" key={index}>
                        <div className="obx-person-fields">
                          <label className="pc-field">
                            <span className="pc-field-label">Name</span>
                            <input className="pc-input" value={person.name} placeholder={index === 0 ? 'Ana' : 'Pedro'} onChange={(e) => setPerson(index, 'name', e.target.value)} />
                          </label>
                          <label className="pc-field">
                            <span className="pc-field-label">Relation to her</span>
                            <input className="pc-input" value={person.relation} placeholder={index === 0 ? 'Daughter' : 'Grandson'} onChange={(e) => setPerson(index, 'relation', e.target.value)} />
                          </label>
                          <label className="pc-field">
                            <span className="pc-field-label">She calls them</span>
                            <input className="pc-input" value={person.calledBy} placeholder={index === 0 ? 'Aninha' : 'Pedrinho'} onChange={(e) => setPerson(index, 'calledBy', e.target.value)} />
                          </label>
                        </div>
                        <button
                          className="pc-iconbtn"
                          onClick={() => patch({ people: people.filter((_, i) => i !== index) })}
                          disabled={people.length <= 1}
                          aria-label={`Remove person ${index + 1}`}
                        >
                          <X />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="pc-appsection">
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">Her stories</h2>
                    <p className="pc-sechead-line">What she loves telling you about.</p>
                  </div>
                  <ul className="pc-list">
                    {ANCHORS.map((anchor) => (
                      <li key={anchor.key}>
                        <label className="pc-row pc-row--plain obx-fieldrow">
                          <span className="pc-row-text"><span className="pc-row-title">{anchor.label}</span></span>
                          <input
                            className="pc-input"
                            value={anchors[anchor.key]}
                            placeholder={anchor.placeholder}
                            onChange={(event) => patch({ anchors: { ...anchors, [anchor.key]: event.target.value } })}
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="pc-appsection">
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">Never bring up</h2>
                    <p className="pc-sechead-line">Visits, money and medicine are always protected. Add what is hers alone.</p>
                    {boundaries.length < 6 && (
                      <button className="pc-iconbtn pc-sechead-add" onClick={() => patch({ boundaries: [...boundaries, ''] })} aria-label="Add a boundary">
                        <Plus />
                      </button>
                    )}
                  </div>
                  <ul className="pc-list">
                    {boundaries.map((boundary, index) => (
                      <li className="pc-row pc-row--plain" key={index}>
                        <label className="pc-field">
                          <span className="sr-only">Boundary {index + 1}</span>
                          <input className="pc-input" value={boundary} placeholder="The sale of the beach house" onChange={(e) => setBoundary(index, e.target.value)} />
                        </label>
                        <button
                          className="pc-iconbtn"
                          onClick={() => patch({ boundaries: boundaries.filter((_, i) => i !== index) })}
                          disabled={boundaries.length <= 1}
                          aria-label={`Remove boundary ${index + 1}`}
                        >
                          <X />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            {step.id === 'voice' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">Give it a voice she knows.</h1>
                  <p className="pc-apphead-line">Consent first. Then two minutes of your own voice.</p>
                </header>

                <section className="pc-appsection">
                  <ul className="pc-list">
                    <li className="pc-row pc-row--plain">
                      <div className="pc-row-text">
                        <p className="pc-row-title" id="obx-consent-title">I am recording my own voice</p>
                        <p className="pc-row-line" id="obx-consent-line">
                          And I agree to a clearly labelled AI version of it speaking with {displayName}. I can take it back anytime, which deletes the voice.
                        </p>
                      </div>
                      <div className="pc-row-action">
                        <button
                          className="pc-switch"
                          role="switch"
                          aria-checked={consent}
                          aria-labelledby="obx-consent-title"
                          aria-describedby="obx-consent-line"
                          onClick={() => patch({ consent: !consent })}
                        />
                      </div>
                    </li>
                  </ul>
                </section>

                <section className={`pc-appsection${consent ? '' : ' obx-locked'}`} aria-disabled={!consent}>
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">Read this aloud</h2>
                    <p className="pc-sechead-line">{sampleLine}</p>
                  </div>
                  <ul className="pc-list">
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><Mic /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">{VOICE_PROMPTS[promptIndex]}</p>
                      </div>
                      <div className="pc-row-action">
                        {recordingState === 'idle' && (
                          <button className="pc-btn pc-btn--ghost" onClick={startRecording}>Record</button>
                        )}
                        {recordingState === 'recording' && (
                          <button className="pc-btn pc-btn--ghost" onClick={stopRecording}><Square size={12} fill="currentColor" /> Stop</button>
                        )}
                        {recordingState === 'ready' && (
                          <button className="pc-btn pc-btn--ghost" onClick={queueVoiceBuild}>Use this</button>
                        )}
                        {recordingState === 'processing' && <AudioLines className="pc-chevron" aria-hidden="true" />}
                        {recordingState === 'queued' && (
                          <button className="pc-btn pc-btn--ghost" onClick={recordAnotherSample}>Record another</button>
                        )}
                        {recordingState === 'cloned' && (
                          <button className="pc-btn pc-btn--ghost" onClick={recordAnotherSample}>Add another</button>
                        )}
                        {recordingState === 'failed' && (
                          <button className="pc-btn pc-btn--ghost" onClick={recordAnotherSample}>Try again</button>
                        )}
                      </div>
                    </li>
                    {recordingState === 'recording' && (
                      <li className="pc-subrow"><Waveform active /></li>
                    )}
                    {recordingState === 'ready' && (
                      <li className="pc-subrow obx-listen">
                        <button className="pc-iconbtn" onClick={togglePlayback} aria-label={isPlaying ? 'Pause sample' : 'Play sample'}>
                          {isPlaying ? <Pause /> : <Play fill="currentColor" />}
                        </button>
                        <button className="pc-btn pc-btn--ghost" onClick={startRecording}>Record again</button>
                      </li>
                    )}
                    {micError && (
                      <li className="pc-subrow"><p className="obx-error" role="alert">{micError}</p></li>
                    )}
                    <li className="pc-subrow">
                      <p className="pc-row-line">Other sentences</p>
                      <div className="obx-dots">
                        {VOICE_PROMPTS.map((_, index) => (
                          <button
                            key={index}
                            className={index === promptIndex ? 'is-current' : ''}
                            onClick={() => setPromptIndex(index)}
                            aria-label={`Voice prompt ${index + 1}`}
                            aria-pressed={index === promptIndex}
                          />
                        ))}
                      </div>
                    </li>
                  </ul>
                  {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="sr-only" />}
                </section>
              </>
            )}

            {step.id === 'style' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">Two things a voice note rarely says.</h1>
                  <p className="pc-apphead-line">How you really are together, and the words only you two use.</p>
                </header>
                <section className="pc-appsection">
                  <ul className="pc-list">
                    <li className="pc-row pc-row--plain">
                      <div className="pc-row-text">
                        <p className="pc-row-title">{QUESTIONS[questionIndex].prompt}</p>
                        <p className="pc-row-line">{QUESTIONS[questionIndex].label} · {questionIndex + 1} of {QUESTIONS.length}</p>
                      </div>
                      <div className="pc-row-action">
                        <button className="pc-btn pc-btn--ghost" onClick={() => setQuestionIndex((index) => (index + 1) % QUESTIONS.length)}>
                          {questionIndex === QUESTIONS.length - 1 ? 'First question' : 'Next question'}
                        </button>
                      </div>
                    </li>
                    <li className="pc-row pc-row--plain obx-form">
                      <textarea
                        className="pc-input"
                        value={answers[questionIndex]}
                        placeholder={QUESTIONS[questionIndex].placeholder}
                        onChange={(event) => {
                          const next = [...answers];
                          next[questionIndex] = event.target.value;
                          patch({ answers: next });
                        }}
                        aria-label="Your answer"
                      />
                    </li>
                  </ul>
                  <p className="pc-empty">
                    {answeredCount === 0
                      ? 'Nothing yet. One honest answer is enough to start.'
                      : `Learned so far: ${answers.map((answer, index) => (answer.trim() ? QUESTIONS[index].label : null)).filter(Boolean).join(', ')}.`}
                  </p>
                </section>
              </>
            )}

            {step.id === 'relay' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">Forty minutes become one meaningful minute.</h1>
                  <p className="pc-apphead-line">How a call with {displayName} comes back to you. Always labelled as AI.</p>
                </header>
                <section className="pc-appsection">
                  <ul className="pc-list">
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><MessageCircle /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">For {displayName}</p>
                        <p className="pc-row-line">
                          {anchors.dish.trim() ? `“Tell me about ${decap(anchors.dish.trim())}. Who taught you?”` : '“And who taught you to make the cake that way?”'}
                        </p>
                      </div>
                    </li>
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><User /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">For you</p>
                        <p className="pc-row-line">
                          A new detail about {anchors.place.trim() ? decap(anchors.place.trim()) : 'the family beach trip'}, and one thing for you: can you visit Sunday?
                        </p>
                      </div>
                    </li>
                  </ul>
                </section>
                <section className="pc-appsection">
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">A first note</h2>
                    <p className="pc-sechead-line">Read aloud on her next call, as coming from you. Never rewritten.</p>
                  </div>
                  <ul className="pc-list">
                    <li className="pc-row pc-row--plain obx-form">
                      <textarea
                        className="pc-input"
                        value={firstNote}
                        placeholder="Ask who taught her to swim."
                        onChange={(event) => patch({ firstNote: event.target.value })}
                        aria-label="A first note for her next conversation"
                      />
                    </li>
                  </ul>
                </section>
              </>
            )}
          </div>

          <footer className="obx-footer">
            <button className="pc-btn pc-btn--ghost" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
              <ArrowLeft size={14} /> Back
            </button>
            <span className="obx-footer-hint">{step.id === 'voice' ? 'You can improve the voice later.' : ''}</span>
            {stepIndex < STEPS.length - 1 ? (
              <button className="pc-btn pc-btn--primary" onClick={() => continueFrom(stepIndex)} disabled={!canContinue}>
                {stepIndex === 0 ? 'Create a first Presence' : 'Continue'} <ArrowRight size={14} />
              </button>
            ) : (
              <button className="pc-btn pc-btn--primary" onClick={finishSetup}>
                Finish setup <Check size={14} />
              </button>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}

export default function PresenceOnboardingPreview() {
  return <PresenceOnboardingExperience />;
}

export function PresenceOnboardingRoute() {
  const navigate = useNavigate();
  return <PresenceOnboardingExperience persistDraft onExit={() => navigate('/presence/home')} />;
}
