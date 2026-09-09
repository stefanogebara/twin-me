import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Mic,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Square,
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

  // The plate's photograph. One image per relationship so the artifact feels
  // like it belongs to this person rather than to a template. These are the
  // same tiles the landing scatters across its hero.
  const plateImage =
    relationship === 'grandfather' || relationship === 'father'
      ? '/images/presence/cosmos-04-armchair.jpg'
      : relationship === 'friend'
        ? '/images/presence/cosmos-03-garden.jpg'
        : relationship === 'aunt'
          ? '/images/presence/cosmos-07-doorway.jpg'
          : '/images/presence/cosmos-06-portrait.jpg';

  const voiceReady = recordingState === 'cloned' || recordingState === 'queued';
  const namedPeople = people.filter((p) => p.name.trim()).length;
  const keptStories = ANCHORS.filter((a) => anchors[a.key]?.trim()).length;

  // The accreting record. Order is the order it fills in, so the plate reads
  // as a thing being written rather than a form mirror.
  const plateFacts: Array<{ k: string; v: string; empty: string }> = [
    { k: 'Calls you', v: callerName.trim(), empty: 'not yet' },
    { k: 'Together', v: tone, empty: 'not chosen' },
    { k: 'Voice', v: voiceReady ? 'Yours' : consent ? 'Consented' : '', empty: 'not recorded' },
    { k: 'Her people', v: namedPeople ? `${namedPeople} named` : '', empty: 'none yet' },
    { k: 'Her stories', v: keptStories ? `${keptStories} kept` : '', empty: 'none yet' },
  ];

  return (
    <main className="presence-cosmos obx" id="main-content">
      <div className="obx-progress" aria-hidden="true">
        <i style={{ transform: `scaleX(${(stepIndex + 1) / STEPS.length})` }} />
      </div>

      <header className="obx-nav">
        <Link className="obx-nav-brand" to="/presence" aria-label="Presence home"><Mark /></Link>

        {/* A route with stations, not a row of labels. The station names live
            in the eyebrow, so the rail can stay quiet and geometric. */}
        <nav className="obx-rail" aria-label="Onboarding steps">
          {STEPS.map((s, index) => (
            <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {index > 0 && <span className={`link ${index <= stepIndex ? 'is-done' : ''}`} aria-hidden="true" />}
              <button
                className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-done' : ''}
                data-nav={index < stepIndex ? 'true' : 'false'}
                onClick={() => index < stepIndex && goTo(index)}
                disabled={index > stepIndex}
                aria-current={index === stepIndex ? 'step' : undefined}
                title={s.short}
              >
                <span className="dot" />
                <span className="sr-only">{s.short}</span>
              </button>
            </span>
          ))}
        </nav>

        <button className="obx-exit" onClick={onExit ?? (() => window.history.back())}>
          {persistDraft ? 'Save and exit' : 'Exit preview'}
        </button>
      </header>

      <div className="obx-frame">
        {/* ---------------------------------------------------- the plate -- */}
        <aside className="obx-plate" aria-label="What you are building">
          <div className="obx-plate-figure">
            <img src={plateImage} alt="" aria-hidden="true" />
          </div>

          <div>
            <h2 className="obx-plate-name">
              {caredForName.trim()
                ? caredForName.trim()
                : <span className="placeholder">Her name</span>}
            </h2>
            <p className="obx-plate-rel">
              {relationship ? `Your ${relationship}` : 'Someone you love'}
            </p>
          </div>

          <dl className="obx-facts">
            {plateFacts.map((f) => (
              <div className="obx-fact" key={f.k}>
                <dt>{f.k}</dt>
                <dd className={f.v ? '' : 'is-empty'}>{f.v || f.empty}</dd>
              </div>
            ))}
          </dl>

          <p className={`obx-plate-foot ${voiceReady ? 'is-live' : ''}`}>
            <span className="tick" aria-hidden="true" />
            {voiceReady ? 'Ready to call' : 'Draft, saved as you go'}
          </p>
        </aside>

        {/* ---------------------------------------------------- the spine -- */}
        <section className="obx-spine" aria-live="polite">
          <div className="obx-step" key={step.id}>
            <p className="obx-eyebrow">{step.eyebrow}</p>

            {step.id === 'start' && (
              <>
                <h1>A little of your <em>voice</em> carries a lot of love.</h1>
                <p className="obx-sub">
                  Create a clearly identified AI presence that listens without rushing, keeps your
                  relationship's language, and brings the important parts back to you.
                </p>
                <div className="obx-body">
                  <div className="obx-two">
                    <div className="obx-card">
                      <p className="obx-tag">Time</p>
                      <p className="obx-note">
                        <strong>About ten minutes</strong> to a
                        first version. Two of them are your voice.
                      </p>
                    </div>
                    <div className="obx-card">
                      <p className="obx-tag">Honesty</p>
                      <p className="obx-note">
                        <strong>Always identified as AI.</strong> It
                        never pretends a sentence came from you.
                      </p>
                    </div>
                  </div>
                  <div className="obx-card obx-card--quiet" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, alignItems: 'start' }}>
                    <ShieldCheck size={17} style={{ color: 'var(--c-ink-3)', marginTop: 1 }} aria-hidden="true" />
                    <p className="obx-note obx-note--flush">
                      <strong>You stay in control.</strong> Visits,
                      money and medicine always need a real person. You can pause or delete the Presence at any time.
                    </p>
                  </div>
                </div>
              </>
            )}

            {step.id === 'bond' && (
              <>
                <h1>Who are you <em>showing</em> up for?</h1>
                <p className="obx-sub">We start with the relationship, not a personality quiz.</p>
                <div className="obx-body">
                  <div className="obx-card">
                    <div className="obx-two">
                      <label className="obx-field">
                        <span className="lab">The person you care for</span>
                        <input className="obx-input" value={caredForName} placeholder="Sofia" onChange={(event) => patch({ caredForName: event.target.value })} />
                      </label>
                      <label className="obx-field">
                        <span className="lab">Your relationship</span>
                        <span className="obx-select-wrap">
                          <select className="obx-select" value={relationship} onChange={(event) => patch({ relationship: event.target.value })}>
                            <option value="grandmother">Grandmother</option>
                            <option value="grandfather">Grandfather</option>
                            <option value="mother">Mother</option>
                            <option value="father">Father</option>
                            <option value="aunt">Aunt or uncle</option>
                            <option value="friend">Friend</option>
                          </select>
                          <ChevronDown size={16} />
                        </span>
                      </label>
                    </div>
                    <label className="obx-field" style={{ marginTop: 16 }}>
                      <span className="lab">What does she call you?</span>
                      <input className="obx-input" value={callerName} placeholder="Ana" onChange={(event) => patch({ callerName: event.target.value })} />
                      <span className="help">The exact name the Presence will use aloud.</span>
                    </label>
                  </div>
                  <div className="obx-card">
                    <span className="lab">How are you together?</span>
                    <p className="help" style={{ margin: '4px 0 14px' }}>Choose what feels true, not ideal.</p>
                    <div className="obx-chips">
                      {TONES.map((option) => (
                        <button key={option} className={`obx-chip ${tone === option ? 'is-selected' : ''}`} onClick={() => patch({ tone: option })}>
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {step.id === 'about' && (
              <>
                <h1>Tell me about {displayName} like you'd tell a <em>friend</em>.</h1>
                <p className="obx-sub">
                  Who is around her, what she loves talking about, what to never bring up. Two minutes,
                  in your own words. You check everything on the next screen.
                </p>
                <div className="obx-body">
                  {aboutRec === 'done' && aboutCounts ? (
                    <div className="obx-card" style={{ display: 'grid', gap: 14 }}>
                      <p className="obx-tag">Understood from what you said</p>
                      <div className="obx-learned">
                        <span className="pill"><Check size={13} /> {aboutCounts.people} {aboutCounts.people === 1 ? 'person' : 'people'}</span>
                        <span className="pill"><Check size={13} /> {aboutCounts.anchors} {aboutCounts.anchors === 1 ? 'story' : 'stories'}</span>
                        <span className="pill"><Check size={13} /> {aboutCounts.boundaries} {aboutCounts.boundaries === 1 ? 'boundary' : 'boundaries'}</span>
                        <span className="pill"><Check size={13} /> {aboutCounts.facts} facts</span>
                      </div>
                      <p className="obx-hint">Continue to check and correct it.</p>
                      <button className="pc-btn pc-btn--ghost" style={{ justifySelf: 'start' }} onClick={() => { setAboutRec('idle'); aboutBlobRef.current = null; }}>
                        Record or write again
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="obx-card">
                        <div className="obx-rec-head">
                          <span>Voice note</span>
                          <span className={aboutRec === 'recording' ? 'is-recording' : ''}>
                            {aboutRec === 'recording' ? formatTime(aboutSeconds) : 'Around two minutes'}
                          </span>
                        </div>
                        <blockquote className="obx-prompt">
                          Who is she? Who is around her? What does she love talking about? What should I never bring up?
                        </blockquote>
                        <Waveform active={aboutRec === 'recording'} />
                        <div className="obx-actions">
                          {aboutRec === 'idle' && (
                            <button className="pc-btn pc-btn--primary" onClick={startAboutRecording}><Mic size={16} /> Start recording</button>
                          )}
                          {aboutRec === 'recording' && (
                            <button className="pc-btn pc-btn--primary" onClick={stopAboutRecording}><Square size={14} fill="currentColor" /> Stop</button>
                          )}
                          {aboutRec === 'ready' && (
                            <>
                              <button className="pc-btn pc-btn--ghost" onClick={startAboutRecording}>Record again</button>
                              <button className="pc-btn pc-btn--primary" onClick={() => aboutBlobRef.current && analyzeAbout({ audio: aboutBlobRef.current })}>
                                Use this recording <ArrowRight size={15} />
                              </button>
                            </>
                          )}
                          {aboutRec === 'processing' && (
                            <span className="obx-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <AudioLines size={16} /> Listening and taking notes…
                            </span>
                          )}
                        </div>
                        {aboutError && <p className="obx-error" role="alert">{aboutError}</p>}
                      </div>
                      <div className="obx-card">
                        <label className="obx-field">
                          <span className="lab">Or write it</span>
                          <textarea
                            className="obx-textarea"
                            value={draft.aboutText}
                            placeholder="Sofia lives alone in Santos since my grandfather passed. Her daughter Rê has lunch with her on Sundays. She loves talking about the beach house in Ubatuba and her mother's kibbeh. Never bring up the sale of the house."
                            onChange={(event) => patch({ aboutText: event.target.value })}
                          />
                        </label>
                        <button
                          className="pc-btn pc-btn--ghost"
                          style={{ marginTop: 14 }}
                          disabled={!draft.aboutText.trim() || aboutRec === 'processing'}
                          onClick={() => analyzeAbout({ text: draft.aboutText.trim() })}
                        >
                          Use what I wrote <ArrowRight size={15} />
                        </button>
                      </div>
                    </>
                  )}
                  <p className="obx-hint">
                    You can skip this and fill the next screen by hand — the first conversation will just know less.
                  </p>
                </div>
              </>
            )}

            {step.id === 'review' && (
              <>
                <h1>{understood ? <>Here is what I <em>understood</em>.</> : <>Who is <em>around</em> {displayName}.</>}</h1>
                <p className="obx-sub">
                  {understood
                    ? 'Correct anything that is off and add what is missing. This is the map the Presence checks before it speaks.'
                    : 'Fill in what matters most. This is the map the Presence checks before it ever mentions a person.'}
                </p>
                <div className="obx-body">
                  <div className="obx-card" style={{ display: 'grid', gap: 16 }}>
                    <p className="obx-tag">Her people</p>
                    {people.map((person, index) => (
                      <div className="obx-person" key={index}>
                        <label className="obx-field">
                          <span className="lab">Name</span>
                          <input className="obx-input" value={person.name} placeholder={index === 0 ? 'Ana' : 'Pedro'} onChange={(e) => setPerson(index, 'name', e.target.value)} />
                        </label>
                        <label className="obx-field">
                          <span className="lab">Relation to her</span>
                          <input className="obx-input" value={person.relation} placeholder={index === 0 ? 'Daughter' : 'Grandson'} onChange={(e) => setPerson(index, 'relation', e.target.value)} />
                        </label>
                        <label className="obx-field">
                          <span className="lab">She calls them</span>
                          <input className="obx-input" value={person.calledBy} placeholder={index === 0 ? 'Aninha' : 'Pedrinho'} onChange={(e) => setPerson(index, 'calledBy', e.target.value)} />
                        </label>
                        <button className="obx-round obx-person-remove" onClick={() => patch({ people: people.filter((_, i) => i !== index) })} disabled={people.length <= 1} aria-label={`Remove person ${index + 1}`}>
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                    {people.length < 8 && (
                      <button className="pc-btn pc-btn--ghost" style={{ justifySelf: 'start' }} onClick={() => patch({ people: [...people, { name: '', relation: '', calledBy: '' }] })}>
                        <Plus size={15} /> Add a person
                      </button>
                    )}
                    <p className="obx-hint">If someone has passed away, write it in the relation — “husband (deceased)” — so they are only ever spoken of with care.</p>
                  </div>

                  <div className="obx-card" style={{ display: 'grid', gap: 16 }}>
                    <p className="obx-tag">Her stories</p>
                    {ANCHORS.map((anchor) => (
                      <label className="obx-field" key={anchor.key}>
                        <span className="lab">{anchor.label}</span>
                        <input className="obx-input" value={anchors[anchor.key]} placeholder={anchor.placeholder} onChange={(event) => patch({ anchors: { ...anchors, [anchor.key]: event.target.value } })} />
                      </label>
                    ))}
                  </div>

                  <div className="obx-card" style={{ display: 'grid', gap: 12 }}>
                    <p className="obx-tag">Never bring up</p>
                    <p className="obx-hint">Visits, money and medicine are always protected. Add anything that is hers alone.</p>
                    {boundaries.map((boundary, index) => (
                      <div className="obx-person obx-person--one" key={index}>
                        <label className="obx-field">
                          <span className="sr-only">Boundary {index + 1}</span>
                          <input className="obx-input" value={boundary} placeholder="The sale of the beach house" onChange={(e) => setBoundary(index, e.target.value)} />
                        </label>
                        <button className="obx-round obx-person-remove" onClick={() => patch({ boundaries: boundaries.filter((_, i) => i !== index) })} disabled={boundaries.length <= 1} aria-label={`Remove boundary ${index + 1}`}>
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                    {boundaries.length < 6 && (
                      <button className="pc-btn pc-btn--ghost" style={{ justifySelf: 'start' }} onClick={() => patch({ boundaries: [...boundaries, ''] })}>
                        <Plus size={15} /> Add a boundary
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {step.id === 'voice' && (
              <>
                <h1>Give it a voice she <em>knows</em>.</h1>
                <p className="obx-sub">Consent comes first. Then two useful minutes of your own voice.</p>
                <div className="obx-body">
                  <label className="obx-card obx-consent">
                    <input type="checkbox" checked={consent} onChange={(event) => patch({ consent: event.target.checked })} />
                    <p>
                      <strong>I am recording my own voice</strong> and consent to a clearly identified AI version of it
                      speaking with {displayName}. I can revoke this at any time, which deletes the voice.
                    </p>
                  </label>

                  <div className="obx-card" style={consent ? undefined : { opacity: 0.42, pointerEvents: 'none' }} aria-disabled={!consent}>
                    <div className="obx-rec-head">
                      <span>Sample {promptIndex + 1} of {VOICE_PROMPTS.length}</span>
                      <span className={recordingState === 'recording' ? 'is-recording' : ''}>
                        {recordingState === 'recording' ? formatTime(recordingSeconds) : 'Quiet room recommended'}
                      </span>
                    </div>
                    <blockquote className="obx-prompt">{VOICE_PROMPTS[promptIndex]}</blockquote>
                    <Waveform active={recordingState === 'recording'} />
                    <div className="obx-actions">
                      {recordingState === 'idle' && (
                        <button className="pc-btn pc-btn--primary" onClick={startRecording}><Mic size={16} /> Start recording</button>
                      )}
                      {recordingState === 'recording' && (
                        <button className="pc-btn pc-btn--primary" onClick={stopRecording}><Square size={14} fill="currentColor" /> Stop</button>
                      )}
                      {recordingState === 'ready' && (
                        <>
                          <button className="obx-round" onClick={togglePlayback} aria-label={isPlaying ? 'Pause sample' : 'Play sample'}>
                            {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
                          </button>
                          <button className="pc-btn pc-btn--ghost" onClick={startRecording}>Record again</button>
                          <button className="pc-btn pc-btn--primary" onClick={queueVoiceBuild}>Use this sample</button>
                        </>
                      )}
                      {recordingState === 'processing' && (
                        <span className="obx-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <AudioLines size={16} /> Building your voice…
                        </span>
                      )}
                      {recordingState === 'queued' && (
                        <>
                          <span className="obx-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--c-ink)' }}>
                            <Check size={15} /> Sample saved. Your voice build is queued — we tell you when it is ready.
                          </span>
                          <button className="pc-btn pc-btn--ghost" onClick={recordAnotherSample}>Record another sample</button>
                        </>
                      )}
                      {recordingState === 'cloned' && (
                        <>
                          <span className="obx-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--c-ink)' }}>
                            <Check size={15} /> {voiceNote || 'Your voice is ready. Her calls use it from now on.'}
                          </span>
                          <button className="pc-btn pc-btn--ghost" onClick={recordAnotherSample}>Add another sample</button>
                        </>
                      )}
                      {recordingState === 'failed' && (
                        <>
                          <span className="obx-hint" style={{ color: 'var(--c-ink)' }}>{voiceNote || 'Something went wrong with the sample.'}</span>
                          <button className="pc-btn pc-btn--ghost" onClick={recordAnotherSample}>Try again</button>
                        </>
                      )}
                    </div>
                    {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="sr-only" />}
                    {micError && <p className="obx-error" role="alert">{micError}</p>}
                    <div className="obx-dots">
                      {VOICE_PROMPTS.map((_, index) => (
                        <button key={index} className={index === promptIndex ? 'is-current' : ''} onClick={() => setPromptIndex(index)} aria-label={`Voice prompt ${index + 1}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {step.id === 'style' && (
              <>
                <h1>Two things a voice note <em>rarely</em> says.</h1>
                <p className="obx-sub">How you actually are together, and the words that are only yours.</p>
                <div className="obx-body">
                  <div className="obx-card">
                    <div className="obx-meta">
                      <span>{QUESTIONS[questionIndex].label}</span>
                      <span>{questionIndex + 1} / {QUESTIONS.length}</span>
                    </div>
                    <h2 className="obx-question">{QUESTIONS[questionIndex].prompt}</h2>
                    <textarea
                      className="obx-textarea"
                      value={answers[questionIndex]}
                      placeholder={QUESTIONS[questionIndex].placeholder}
                      onChange={(event) => {
                        const next = [...answers];
                        next[questionIndex] = event.target.value;
                        patch({ answers: next });
                      }}
                      aria-label="Your answer"
                    />
                    <div className="obx-actions" style={{ justifyContent: 'space-between' }}>
                      <span className="obx-hint">Answers save automatically.</span>
                      <button className="pc-btn pc-btn--ghost" onClick={() => setQuestionIndex((index) => (index + 1) % QUESTIONS.length)}>
                        {questionIndex === QUESTIONS.length - 1 ? 'Back to the first' : 'Next question'} <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="obx-learned">
                    <span className="t">Learned so far</span>
                    {answers.map((answer, index) => (answer.trim() ? <span className="pill" key={index}><Check size={13} /> {QUESTIONS[index].label}</span> : null))}
                    {answeredCount === 0 && <span className="obx-hint">Nothing yet — one honest answer is enough to start.</span>}
                  </div>
                </div>
              </>
            )}

            {step.id === 'relay' && (
              <>
                <h1>Forty minutes become one <em>meaningful</em> minute.</h1>
                <p className="obx-sub">
                  This is how a conversation with {displayName} comes back to you. The AI never pretends a generated sentence came from family.
                </p>
                <div className="obx-body">
                  <div className="obx-relay">
                    <article className="obx-card">
                      <p className="obx-tag">For {displayName}</p>
                      <h3>{anchors.dish.trim() ? `“Tell me about ${decap(anchors.dish.trim())}. Who taught you?”` : '“And who taught you to make the cake that way?”'}</h3>
                      <p>{callerName.trim() ? `${callerName.trim()}'s` : 'Your'} AI presence, listening patiently. Identified as AI on every call.</p>
                    </article>
                    <article className="obx-card">
                      <p className="obx-tag">For you</p>
                      <h3>A good, story-filled afternoon.</h3>
                      <ul>
                        <li>She bought ingredients for a chocolate cake.</li>
                        <li>A new detail about {anchors.place.trim() ? decap(anchors.place.trim()) : 'the family beach trip'}.</li>
                        <li><strong>She wants to know whether you can visit Sunday.</strong></li>
                      </ul>
                    </article>
                  </div>
                  <div className="obx-card">
                    <label className="obx-field">
                      <span className="lab">Send a first note into her next conversation</span>
                      <textarea className="obx-textarea" style={{ minHeight: 88 }} value={firstNote} placeholder="Ask who taught her to swim." onChange={(event) => patch({ firstNote: event.target.value })} />
                      <span className="help">Notes are read aloud as coming from you, never rewritten.</span>
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          <footer className="obx-footer">
            <button className="pc-btn pc-btn--ghost" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
              <ArrowLeft size={15} /> Back
            </button>
            <span className="obx-footer-hint">
              {step.id === 'voice' ? 'You can improve the voice later without redoing onboarding.' : 'Progress saves automatically.'}
            </span>
            {stepIndex < STEPS.length - 1 ? (
              <button className="pc-btn pc-btn--primary" onClick={() => continueFrom(stepIndex)} disabled={!canContinue}>
                {stepIndex === 0 ? 'Create a first Presence' : 'Continue'} <ArrowRight size={15} />
              </button>
            ) : (
              <button className="pc-btn pc-btn--primary" onClick={finishSetup}>
                Finish setup <Check size={15} />
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
