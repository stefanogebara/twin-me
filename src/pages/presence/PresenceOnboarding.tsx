import { useEffect, useRef, useState } from 'react';
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
  Plus,
  ShieldCheck,
  Square,
  User,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { presenceAPI } from '@/services/api/presenceAPI';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import '@/styles/presence-cosmos.css';
import '@/styles/presence-cosmos-onboarding.css';

/**
 * /presence/onboarding — six steps on the Cosmos system, read by a Brazilian family in pt-BR.
 *
 *   start → bond → about → review → style → relay
 *
 * The "About" voice note is the primary input: it is transcribed and mined server-side
 * (people, story anchors, boundaries, life facts, tone hint) and prefills "Review" — one
 * screen where the family checks what was understood: her people, her stories, and what
 * to never bring up. Typed fields remain the fallback and the correction surface.
 * (Plans: 2026-08-31-presence-onboarding-system, 2026-08-31-presence-context-architecture §4.)
 *
 * There is no voice step: first value does not wait for a cloned voice. Recording the
 * family member's own voice is offered later, from the home page.
 *
 * Stored values (tone, relationship) stay in English because the server prompt and the
 * readiness tests key on them; only their displayed labels are Portuguese.
 *
 * Persistence: localStorage draft (v6) is the local source of truth; step completion also
 * syncs best-effort to /api/presence. A failed sync shows one line by the Continue button
 * and never blocks navigation. Finishing does wait for the PATCH to status 'active': a
 * draft presence cannot answer her link. Server writes happen only in persistDraft mode
 * (the authed route), never in the preview.
 */

type StepId = 'start' | 'bond' | 'about' | 'review' | 'style' | 'relay';
type AboutRec = 'idle' | 'recording' | 'ready' | 'processing' | 'done';

type Person = { name: string; relation: string; calledBy: string };

type PresenceDraft = {
  stepIndex: number;
  serverId: string | null;
  caredForName: string;
  relationship: string;
  callerName: string;
  tone: string;
  people: Person[];
  anchors: { place: string; dish: string; person: string };
  boundaries: string[];
  answers: string[];
  firstNote: string;
  aboutText: string;
  aboutTranscript: string;
  aboutCounts: { people: number; anchors: number; boundaries: number; facts: number } | null;
};

const DRAFT_KEY = 'twinme-presence-draft-v6';

const DEFAULT_DRAFT: PresenceDraft = {
  stepIndex: 0,
  serverId: null,
  caredForName: '',
  relationship: 'grandmother',
  callerName: '',
  tone: 'Gentle teasing',
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
  { id: 'start', short: 'Início', eyebrow: 'Um novo tipo de presença' },
  { id: 'bond', short: 'Vínculo', eyebrow: 'A relação' },
  { id: 'about', short: 'Sobre ela', eyebrow: 'Me conta sobre ela' },
  { id: 'review', short: 'Revisão', eyebrow: 'O que eu entendi' },
  { id: 'style', short: 'Jeito', eyebrow: 'Como vocês são juntos' },
  { id: 'relay', short: 'Retorno', eyebrow: 'O que volta para você' },
];

// The stored value is what the server prompt and the readiness tests key on; the label is what the family reads.
const TONES: Array<{ value: string; label: string }> = [
  { value: 'Gentle teasing', label: 'Brincadeira carinhosa' },
  { value: 'Very affectionate', label: 'Muito afetuoso' },
  { value: 'Calm and practical', label: 'Calmo e prático' },
  { value: 'Storytelling', label: 'Contador de histórias' },
];
const TONE_VALUES = TONES.map((t) => t.value);
const toneLabel = (value: string) => TONES.find((t) => t.value === value)?.label ?? value;

// Same split for the relationship: English key stored, Portuguese label shown. `side` is the sidebar line.
const RELATIONSHIPS: Array<{ value: string; label: string; side: string }> = [
  { value: 'grandmother', label: 'Avó', side: 'Sua avó' },
  { value: 'grandfather', label: 'Avô', side: 'Seu avô' },
  { value: 'mother', label: 'Mãe', side: 'Sua mãe' },
  { value: 'father', label: 'Pai', side: 'Seu pai' },
  { value: 'aunt', label: 'Tia ou tio', side: 'Sua tia ou seu tio' },
  { value: 'friend', label: 'Amiga ou amigo', side: 'Uma amiga ou um amigo' },
];

const SYNC_FAILED = 'Não deu para salvar. Vamos tentar de novo no próximo passo.';
const SERVER_UNREACHABLE = 'Não deu para falar com o servidor. Tente de novo em instantes.';
const ABOUT_FAILED = 'Não consegui entender a gravação. Tente de novo ou escreva algumas linhas.';
const ACTIVATE_FAILED = 'Não deu para ativar a Presença. Tente de novo.';

// Style: the two codebook questions that a voice note rarely answers by itself.
const QUESTIONS: Array<{ kind: 'tone' | 'language'; label: string; prompt: string; placeholder: string }> = [
  {
    kind: 'tone',
    label: 'O seu jeito carinhoso',
    prompt: 'Quando ela repete uma história que você já ouviu, como você costuma responder?',
    placeholder: 'Brinco com ela de leve e pergunto o detalhe que ela esqueceu da última vez.',
  },
  {
    kind: 'language',
    label: 'Palavras só de vocês',
    prompt: 'Que apelidos, expressões ou piadinhas são só de vocês dois?',
    placeholder: 'Eu chamo ela de Nunu. Ela chama todo plano bom de plano de domingo, mesmo na terça.',
  },
];

const ANCHORS: Array<{ key: keyof PresenceDraft['anchors']; label: string; placeholder: string }> = [
  { key: 'place', label: 'Um lugar que importa para ela', placeholder: 'A casa de praia em Ubatuba' },
  { key: 'dish', label: 'Um prato ou receita com história', placeholder: 'O bolo de chocolate dela, da mãe' },
  { key: 'person', label: 'Uma pessoa de quem ela adora contar histórias', placeholder: 'A irmã Teresa, que ensinou ela a nadar' },
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

/** Reads only the fields this version knows, so a draft with older fields (consent, voice) still loads. */
function loadStoredDraft(persist: boolean): PresenceDraft {
  if (!persist) return DEFAULT_DRAFT;
  try {
    const stored = window.localStorage.getItem(DRAFT_KEY);
    if (!stored) return DEFAULT_DRAFT;
    const parsed = JSON.parse(stored) as Partial<PresenceDraft> & Record<string, unknown>;
    const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
    return {
      stepIndex: Math.min(Math.max(Number(parsed.stepIndex) || 0, 0), STEPS.length - 1),
      serverId: typeof parsed.serverId === 'string' ? parsed.serverId : null,
      caredForName: text(parsed.caredForName, ''),
      relationship: text(parsed.relationship, DEFAULT_DRAFT.relationship),
      callerName: text(parsed.callerName, ''),
      tone: text(parsed.tone, DEFAULT_DRAFT.tone),
      people: Array.isArray(parsed.people) && parsed.people.length > 0
        ? parsed.people.map((p) => ({ name: String(p?.name ?? ''), relation: String(p?.relation ?? ''), calledBy: String(p?.calledBy ?? '') }))
        : DEFAULT_DRAFT.people,
      anchors: { ...DEFAULT_DRAFT.anchors, ...(parsed.anchors ?? {}) },
      boundaries: Array.isArray(parsed.boundaries) && parsed.boundaries.length > 0 ? parsed.boundaries.map(String) : DEFAULT_DRAFT.boundaries,
      answers: Array.isArray(parsed.answers) && parsed.answers.length === 2 ? parsed.answers.map(String) : DEFAULT_DRAFT.answers,
      firstNote: text(parsed.firstNote, ''),
      aboutText: text(parsed.aboutText, ''),
      aboutTranscript: text(parsed.aboutTranscript, ''),
      aboutCounts: parsed.aboutCounts && typeof parsed.aboutCounts === 'object' ? parsed.aboutCounts : null,
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

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

type Props = { persistDraft?: boolean; onExit?: () => void };

export function PresenceOnboardingExperience({ persistDraft = false, onExit }: Props) {
  const { trackEvent } = useAnalytics();
  const [draft, setDraft] = useState<PresenceDraft>(() => loadDraft(persistDraft));
  const { stepIndex, caredForName, relationship, callerName, tone, people, anchors, boundaries, answers, firstNote, aboutCounts } = draft;

  // "About her" recorder: the family member describing her, not a voice sample.
  const [aboutRec, setAboutRec] = useState<AboutRec>(draft.aboutCounts ? 'done' : 'idle');
  const [aboutSeconds, setAboutSeconds] = useState(0);
  const [aboutError, setAboutError] = useState<string | null>(null);
  const aboutRecorderRef = useRef<MediaRecorder | null>(null);
  const aboutStreamRef = useRef<MediaStream | null>(null);
  const aboutChunksRef = useRef<Blob[]>([]);
  const aboutBlobRef = useRef<Blob | null>(null);

  // Network state the family can see: one line by the Continue button.
  const [syncError, setSyncError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const noteQueuedRef = useRef(false);

  const [questionIndex, setQuestionIndex] = useState(0);
  const draftRef = useRef(draft);
  const creatingRef = useRef<Promise<string | null> | null>(null);

  const step = STEPS[stepIndex];
  const displayName = caredForName.trim() || 'ela';
  const answeredCount = answers.filter((a) => a.trim()).length;
  const understood = Boolean(aboutCounts);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!persistDraft) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, persistDraft]);

  // One event per step shown; trackEvent is stable (useCallback in the provider).
  useEffect(() => {
    trackEvent('presence_onboarding_step', { step: step.id });
  }, [step.id, trackEvent]);

  // Resume from the server once per mount: adopt the server presence id, and its
  // fields only when the local draft is untouched. Silent on failure: the draft is the truth.
  useEffect(() => {
    if (!persistDraft) return;
    let cancelled = false;
    presenceAPI
      .mine()
      .then((response) => {
        if (cancelled || !response?.presence) return;
        const server = response.presence;
        setDraft((current) => ({
          ...current,
          serverId: server.id,
          ...(current.caredForName.trim() === '' && server.cared_for_name
            ? { caredForName: server.cared_for_name, relationship: server.relationship || current.relationship, callerName: server.caller_name, tone: server.tone || current.tone }
            : {}),
        }));
      })
      .catch(() => {
        /* resume is a convenience; the local draft carries on */
      });
    return () => {
      cancelled = true;
    };
  }, [persistDraft]);

  useEffect(() => {
    if (aboutRec !== 'recording') return;
    const timer = window.setInterval(() => setAboutSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [aboutRec]);

  useEffect(() => {
    return () => {
      aboutStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const patch = (partial: Partial<PresenceDraft>) => setDraft((current) => ({ ...current, ...partial }));

  /** Get (or lazily create) the server-side presence. Null in preview; throws PresenceApiError when creation fails. */
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

  /** Best-effort sync when leaving a step. Never blocks navigation; a failure shows one line, the next success clears it. */
  function syncStep(leaving: StepId) {
    if (!persistDraft) return;
    void (async () => {
      const d = draftRef.current;
      try {
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
        setSyncError(null);
      } catch {
        setSyncError(SYNC_FAILED);
      }
    })();
  }

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
      setAboutError('Preciso do microfone para gravar. Você pode escrever em vez disso.');
    }
  }

  function stopAboutRecording() {
    if (aboutRecorderRef.current?.state === 'recording') aboutRecorderRef.current.stop();
  }

  /** Send the voice note (or typed text) for transcription + extraction, then prefill Review. */
  async function analyzeAbout(input: { audio?: Blob; text?: string }) {
    setAboutError(null);
    setAboutRec('processing');
    const backTo: AboutRec = input.audio ? 'ready' : 'idle';
    let id: string | null;
    try {
      id = await ensureServer();
    } catch {
      setAboutRec(backTo);
      setAboutError(SERVER_UNREACHABLE);
      return;
    }
    if (!id) {
      setAboutRec(backTo);
      setAboutError(persistDraft ? SERVER_UNREACHABLE : 'A análise acontece depois de entrar. A prévia guarda o seu texto.');
      return;
    }
    let result;
    try {
      result = await presenceAPI.about(id, input);
    } catch {
      setAboutRec(backTo);
      setAboutError(ABOUT_FAILED);
      return;
    }
    if (!result?.success) {
      setAboutRec(backTo);
      setAboutError(ABOUT_FAILED);
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
        tone: TONE_VALUES.includes(ex.tone_hint) ? ex.tone_hint : current.tone,
        aboutTranscript: result.transcript,
        aboutCounts: { people: ex.people.length, anchors: ex.anchors.length, boundaries: ex.boundaries.length, facts: ex.facts.length },
      };
    });
    setAboutRec('done');
  }

  // ---------- Navigation ----------
  const goTo = (index: number) => patch({ stepIndex: Math.min(Math.max(index, 0), STEPS.length - 1) });

  function continueFrom(currentIndex: number) {
    syncStep(STEPS[currentIndex].id);
    goTo(currentIndex + 1);
  }

  /** Waits for the presence to be active before leaving: a draft presence cannot answer her link. */
  async function finishSetup() {
    if (!persistDraft) {
      if (onExit) onExit();
      else goTo(0);
      return;
    }
    setFinishError(null);
    setFinishing(true);
    try {
      const d = draftRef.current;
      const id = await ensureServer();
      if (!id) throw new Error('no presence');
      if (d.firstNote.trim() && !noteQueuedRef.current) {
        await presenceAPI.queueNote(id, d.firstNote.trim());
        noteQueuedRef.current = true;
      }
      await presenceAPI.patch(id, { status: 'active' });
      setSyncError(null);
      trackEvent('presence_onboarding_done');
      if (onExit) onExit();
      else goTo(0);
    } catch {
      setFinishError(ACTIVATE_FAILED);
    } finally {
      setFinishing(false);
    }
  }

  const setPerson = (index: number, field: keyof Person, value: string) =>
    patch({ people: people.map((p, i) => (i === index ? { ...p, [field]: value } : p)) });
  const setBoundary = (index: number, value: string) =>
    patch({ boundaries: boundaries.map((b, i) => (i === index ? value : b)) });

  const [menuOpen, setMenuOpen] = useState(false);

  const namedPeople = people.filter((p) => p.name.trim()).length;
  const keptStories = ANCHORS.filter((a) => anchors[a.key]?.trim()).length;
  const relationshipSide = RELATIONSHIPS.find((r) => r.value === relationship)?.side ?? 'Alguém que você ama';

  // The accreting record, in the sidebar. Order is the order it fills in, so
  // it reads as a thing being written rather than a form mirror.
  const plateFacts: Array<{ k: string; v: string; empty: string }> = [
    { k: 'Chama você de', v: callerName.trim(), empty: 'ainda não' },
    { k: 'Juntos', v: toneLabel(tone), empty: 'não escolhido' },
    { k: 'As pessoas dela', v: namedPeople ? plural(namedPeople, 'nomeada', 'nomeadas') : '', empty: 'nenhuma ainda' },
    { k: 'As histórias dela', v: keptStories ? plural(keptStories, 'guardada', 'guardadas') : '', empty: 'nenhuma ainda' },
  ];

  const aboutLine =
    aboutRec === 'recording' ? formatTime(aboutSeconds)
      : aboutRec === 'ready' ? 'Gravado. Use, ou grave de novo.'
        : aboutRec === 'processing' ? 'Ouvindo e anotando…'
          : 'Uns dois minutos, com as suas palavras.';

  const footerLine = step.id === 'relay' ? finishError : syncError;

  return (
    <main className="presence-cosmos pc-app obx" id="main-content">
      <div className="pc-shell">
        <div className="pc-topbar">
          <Link className="pc-side-brand" to="/presence" aria-label="Início da Presença"><Mark /></Link>
          <button
            className="pc-btn pc-btn--ghost"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="obx-side"
          >
            Passo {stepIndex + 1} de {STEPS.length}
          </button>
        </div>

        {/* ------------------------------------------------ the sidebar -- */}
        <aside className={`pc-side${menuOpen ? ' is-open' : ''}`} id="obx-side" aria-label="Seu progresso">
          <Link className="pc-side-brand" to="/presence" aria-label="Início da Presença"><Mark /></Link>

          {/* The steps as plain links: the done ones go back, the rest wait. */}
          <nav className="pc-side-nav" aria-label="Passos da configuração">
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
            <p className={`obx-record-name${caredForName.trim() ? '' : ' is-empty'}`}>{caredForName.trim() || 'O nome dela'}</p>
            <p className="pc-side-note">{relationshipSide}</p>
            <dl className="obx-facts">
              {plateFacts.map((f) => (
                <div className="obx-fact" key={f.k}>
                  <dt>{f.k}</dt>
                  <dd className={f.v ? '' : 'is-empty'}>{f.v || f.empty}</dd>
                </div>
              ))}
            </dl>
            <p className="pc-side-note">Salvo conforme você avança</p>
          </div>

          <button className="pc-side-link" onClick={onExit ?? (() => window.history.back())}>
            {persistDraft ? 'Salvar e sair' : 'Sair da prévia'}
          </button>
        </aside>

        {/* ------------------------------------------------- the column -- */}
        <section className="pc-col" aria-live="polite">
          <div className="obx-step" key={step.id}>
            {step.id === 'start' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">Alguém para conversar com ela, feito por você.</h1>
                  <p className="pc-apphead-line">Uma IA sempre identificada como IA, que escuta sem pressa e traz de volta o que importa.</p>
                </header>
                <section className="pc-appsection">
                  <ul className="pc-list">
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><Clock /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">Uns dez minutos</p>
                        <p className="pc-row-line">Dois deles são você contando sobre ela.</p>
                      </div>
                    </li>
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><BadgeCheck /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">Sempre identificada como IA</p>
                        <p className="pc-row-line">Nunca finge que uma frase veio de você.</p>
                      </div>
                    </li>
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><ShieldCheck /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">Você continua no controle</p>
                        <p className="pc-row-line">Visitas, dinheiro e remédios precisam de uma pessoa. Pause ou apague quando quiser.</p>
                      </div>
                    </li>
                  </ul>
                </section>
              </>
            )}

            {step.id === 'bond' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">Para quem você está fazendo isso?</h1>
                  <p className="pc-apphead-line">Primeiro a relação, não um teste de personalidade.</p>
                </header>
                <section className="pc-appsection">
                  <ul className="pc-list">
                    <li>
                      <label className="pc-row pc-row--plain obx-fieldrow">
                        <span className="pc-row-text"><span className="pc-row-title">A pessoa de quem você cuida</span></span>
                        <input className="pc-input" value={caredForName} placeholder="Sofia" onChange={(event) => patch({ caredForName: event.target.value })} />
                      </label>
                    </li>
                    <li>
                      <label className="pc-row pc-row--plain obx-fieldrow">
                        <span className="pc-row-text"><span className="pc-row-title">Sua relação com ela</span></span>
                        <span className="pc-select">
                          <select className="pc-input" value={relationship} onChange={(event) => patch({ relationship: event.target.value })}>
                            {RELATIONSHIPS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <ChevronDown aria-hidden="true" />
                        </span>
                      </label>
                    </li>
                    <li>
                      <label className="pc-row pc-row--plain obx-fieldrow">
                        <span className="pc-row-text">
                          <span className="pc-row-title">Como ela chama você</span>
                          <span className="pc-row-line">O nome exato que a Presença vai dizer em voz alta.</span>
                        </span>
                        <input className="pc-input" value={callerName} placeholder="Ana" onChange={(event) => patch({ callerName: event.target.value })} />
                      </label>
                    </li>
                  </ul>
                </section>
                <section className="pc-appsection">
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">Como vocês são juntos</h2>
                    <p className="pc-sechead-line">Escolha o que é verdade, não o ideal.</p>
                  </div>
                  <ul className="pc-list">
                    <li className="pc-row pc-row--plain">
                      <div className="obx-chips" role="group" aria-label="Como vocês são juntos">
                        {TONES.map((option) => (
                          <button
                            key={option.value}
                            className="pc-btn pc-btn--ghost obx-chip"
                            aria-pressed={tone === option.value}
                            onClick={() => patch({ tone: option.value })}
                          >
                            {tone === option.value ? <Check size={14} aria-hidden="true" /> : null}
                            {option.label}
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
                  <h1 className="pc-apphead-title">Me conta sobre {displayName} como contaria a uma amiga.</h1>
                  <p className="pc-apphead-line">Quem está por perto, o que ela ama, o que nunca tocar no assunto. Você confere tudo no próximo passo.</p>
                </header>
                {aboutRec === 'done' && aboutCounts ? (
                  <section className="pc-appsection">
                    <ul className="pc-list">
                      <li className="pc-row">
                        <span className="pc-row-icon" aria-hidden="true"><Check /></span>
                        <div className="pc-row-text">
                          <p className="pc-row-title">Entendi</p>
                          <p className="pc-row-line">
                            {plural(aboutCounts.people, 'pessoa', 'pessoas')}
                            {' · '}{plural(aboutCounts.anchors, 'história', 'histórias')}
                            {' · '}{plural(aboutCounts.boundaries, 'limite', 'limites')}
                            {' · '}{plural(aboutCounts.facts, 'fato', 'fatos')}
                          </p>
                        </div>
                        <div className="pc-row-action">
                          <button className="pc-btn pc-btn--ghost" onClick={() => { setAboutRec('idle'); aboutBlobRef.current = null; }}>
                            Refazer
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
                            <p className="pc-row-title">Gravar um áudio</p>
                            <p className="pc-row-line">{aboutLine}</p>
                          </div>
                          <div className="pc-row-action">
                            {aboutRec === 'idle' && (
                              <button className="pc-btn pc-btn--ghost" onClick={startAboutRecording}>Gravar</button>
                            )}
                            {aboutRec === 'recording' && (
                              <button className="pc-btn pc-btn--ghost" onClick={stopAboutRecording}><Square size={12} fill="currentColor" /> Parar</button>
                            )}
                            {aboutRec === 'ready' && (
                              <button className="pc-btn pc-btn--ghost" onClick={() => aboutBlobRef.current && analyzeAbout({ audio: aboutBlobRef.current })}>
                                Usar
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
                            <button className="pc-btn pc-btn--ghost" onClick={startAboutRecording}>Gravar de novo</button>
                          </li>
                        )}
                        {aboutError && (
                          <li className="pc-subrow"><p className="obx-error" role="alert">{aboutError}</p></li>
                        )}
                      </ul>
                    </section>
                    <section className="pc-appsection">
                      <div className="pc-sechead">
                        <h2 className="pc-sechead-title">Ou escreva</h2>
                        <p className="pc-sechead-line">Algumas linhas bastam.</p>
                      </div>
                      <ul className="pc-list">
                        <li className="pc-row pc-row--plain obx-form">
                          <textarea
                            className="pc-input"
                            value={draft.aboutText}
                            placeholder="A Sofia mora sozinha em Santos desde que meu avô faleceu. A filha dela, a Rê, almoça com ela aos domingos. Ela adora falar da casa de praia em Ubatuba e do quibe da mãe dela. Nunca toque no assunto da venda da casa."
                            onChange={(event) => patch({ aboutText: event.target.value })}
                            aria-label="Me conta sobre ela"
                          />
                          <div className="obx-form-actions">
                            <button
                              className="pc-btn pc-btn--ghost"
                              disabled={!draft.aboutText.trim() || aboutRec === 'processing'}
                              onClick={() => analyzeAbout({ text: draft.aboutText.trim() })}
                            >
                              Usar o que escrevi
                            </button>
                          </div>
                        </li>
                      </ul>
                    </section>
                  </>
                )}
                <p className="pc-empty">Você pode pular. A primeira conversa só vai saber menos.</p>
              </>
            )}

            {step.id === 'review' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">{understood ? 'Isto é o que eu entendi.' : `Quem está por perto de ${displayName}.`}</h1>
                  <p className="pc-apphead-line">
                    {understood
                      ? 'Corrija o que estiver errado. A Presença confere isto antes de falar.'
                      : 'A Presença confere isto antes de mencionar alguém.'}
                  </p>
                </header>

                <section className="pc-appsection">
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">As pessoas dela</h2>
                    <p className="pc-sechead-line">Já faleceu? Diga na relação, como “marido (falecido)”.</p>
                    {people.length < 8 && (
                      <button
                        className="pc-iconbtn pc-sechead-add"
                        onClick={() => patch({ people: [...people, { name: '', relation: '', calledBy: '' }] })}
                        aria-label="Adicionar uma pessoa"
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
                            <span className="pc-field-label">Nome</span>
                            <input className="pc-input" value={person.name} placeholder={index === 0 ? 'Ana' : 'Pedro'} onChange={(e) => setPerson(index, 'name', e.target.value)} />
                          </label>
                          <label className="pc-field">
                            <span className="pc-field-label">Relação com ela</span>
                            <input className="pc-input" value={person.relation} placeholder={index === 0 ? 'Filha' : 'Neto'} onChange={(e) => setPerson(index, 'relation', e.target.value)} />
                          </label>
                          <label className="pc-field">
                            <span className="pc-field-label">Ela chama de</span>
                            <input className="pc-input" value={person.calledBy} placeholder={index === 0 ? 'Aninha' : 'Pedrinho'} onChange={(e) => setPerson(index, 'calledBy', e.target.value)} />
                          </label>
                        </div>
                        <button
                          className="pc-iconbtn"
                          onClick={() => patch({ people: people.filter((_, i) => i !== index) })}
                          disabled={people.length <= 1}
                          aria-label={`Remover pessoa ${index + 1}`}
                        >
                          <X />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="pc-appsection">
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">As histórias dela</h2>
                    <p className="pc-sechead-line">O que ela adora contar para você.</p>
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
                    <h2 className="pc-sechead-title">Nunca tocar no assunto</h2>
                    <p className="pc-sechead-line">Visitas, dinheiro e remédios já são protegidos. Adicione o que é só dela.</p>
                    {boundaries.length < 6 && (
                      <button className="pc-iconbtn pc-sechead-add" onClick={() => patch({ boundaries: [...boundaries, ''] })} aria-label="Adicionar um limite">
                        <Plus />
                      </button>
                    )}
                  </div>
                  <ul className="pc-list">
                    {boundaries.map((boundary, index) => (
                      <li className="pc-row pc-row--plain" key={index}>
                        <label className="pc-field">
                          <span className="sr-only">Limite {index + 1}</span>
                          <input className="pc-input" value={boundary} placeholder="A venda da casa de praia" onChange={(e) => setBoundary(index, e.target.value)} />
                        </label>
                        <button
                          className="pc-iconbtn"
                          onClick={() => patch({ boundaries: boundaries.filter((_, i) => i !== index) })}
                          disabled={boundaries.length <= 1}
                          aria-label={`Remover limite ${index + 1}`}
                        >
                          <X />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            {step.id === 'style' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">Duas coisas que um áudio raramente conta.</h1>
                  <p className="pc-apphead-line">Como vocês são de verdade juntos, e as palavras que só vocês dois usam.</p>
                </header>
                <section className="pc-appsection">
                  <ul className="pc-list">
                    <li className="pc-row pc-row--plain">
                      <div className="pc-row-text">
                        <p className="pc-row-title">{QUESTIONS[questionIndex].prompt}</p>
                        <p className="pc-row-line">{QUESTIONS[questionIndex].label} · {questionIndex + 1} de {QUESTIONS.length}</p>
                      </div>
                      <div className="pc-row-action">
                        <button className="pc-btn pc-btn--ghost" onClick={() => setQuestionIndex((index) => (index + 1) % QUESTIONS.length)}>
                          {questionIndex === QUESTIONS.length - 1 ? 'Primeira pergunta' : 'Próxima pergunta'}
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
                        aria-label="Sua resposta"
                      />
                    </li>
                  </ul>
                  <p className="pc-empty">
                    {answeredCount === 0
                      ? 'Nada ainda. Uma resposta sincera já basta para começar.'
                      : `Já aprendi: ${answers.map((answer, index) => (answer.trim() ? QUESTIONS[index].label : null)).filter(Boolean).join(', ')}.`}
                  </p>
                </section>
              </>
            )}

            {step.id === 'relay' && (
              <>
                <header className="pc-apphead">
                  <h1 className="pc-apphead-title">O que volta para você depois de cada conversa.</h1>
                  <p className="pc-apphead-line">Toda conversa com {displayName} vira um resumo curto para você. Sempre identificada como IA.</p>
                </header>
                <section className="pc-appsection">
                  <ul className="pc-list">
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><MessageCircle /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">O que ela contou</p>
                        <p className="pc-row-line">Como ela estava e do que falou, em poucas frases.</p>
                      </div>
                    </li>
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><ShieldCheck /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">O que precisa de uma pessoa</p>
                        <p className="pc-row-line">Dor, um pedido de ajuda ou algo que só a família resolve aparece em separado.</p>
                      </div>
                    </li>
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><User /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">O que ela pediu para passar</p>
                        <p className="pc-row-line">Um recado dela para você chega do jeito que ela disse.</p>
                      </div>
                    </li>
                  </ul>
                </section>
                <section className="pc-appsection">
                  <div className="pc-sechead">
                    <h2 className="pc-sechead-title">Um primeiro recado</h2>
                    <p className="pc-sechead-line">Lido em voz alta na próxima conversa dela, como vindo de você. Nunca reescrito.</p>
                  </div>
                  <ul className="pc-list">
                    <li className="pc-row pc-row--plain obx-form">
                      <textarea
                        className="pc-input"
                        value={firstNote}
                        placeholder="Pergunta quem ensinou ela a nadar."
                        onChange={(event) => patch({ firstNote: event.target.value })}
                        aria-label="Um primeiro recado para a próxima conversa dela"
                      />
                    </li>
                  </ul>
                </section>
              </>
            )}
          </div>

          <footer className="obx-footer">
            <button className="pc-btn pc-btn--ghost" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0 || finishing}>
              <ArrowLeft size={14} /> Voltar
            </button>
            <span className="obx-footer-hint">
              {footerLine ? <span className="obx-error" role="alert">{footerLine}</span> : null}
            </span>
            {stepIndex < STEPS.length - 1 ? (
              <button className="pc-btn pc-btn--primary" onClick={() => continueFrom(stepIndex)}>
                {stepIndex === 0 ? 'Criar a primeira Presença' : 'Continuar'} <ArrowRight size={14} />
              </button>
            ) : (
              <button className="pc-btn pc-btn--primary" onClick={() => void finishSetup()} disabled={finishing}>
                {finishing ? 'Ativando…' : 'Concluir'} <Check size={14} />
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
