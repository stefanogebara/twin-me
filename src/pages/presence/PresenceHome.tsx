import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Link2,
  Loader2,
  MessageCircle,
  MessageSquare,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { TWIN_WHATSAPP_LINK } from '@/lib/whatsappConstants';
import {
  presenceAPI,
  PresenceApiError,
  whatsappLink,
  type PresenceCall,
  type PresenceConversation,
  type PresenceNote,
  type PresenceConversationDetail,
  type PresenceOverview,
  type PresenceReadiness,
  type CompanionOverview,
  type PresenceMember,
} from '@/services/api/presenceAPI';
import LedgerOrb from '@/components/LedgerOrb';
import BrandMark from '@/components/brand/Mark';
import PresenceCompanionHome from './PresenceCompanionHome';
import '@/styles/presence-cosmos.css';
import '@/styles/presence-home.css';

/**
 * /presence/home — the family's page, in the register (rows, not cards).
 *
 * Composition (see src/styles/presence-home.css for the reasoning):
 *   sidebar — plain links to the sections, and setup; a menu on phones
 *   title   — her name, and the old plate's ledger as one grey line
 *   column  — her link first (the tablet fallback), then the calls (her
 *             mobile, the hour, the last ten), the family's WhatsApp, what
 *             needs a person, what came back, what you can say, who is who,
 *             the voice, and last the settings (pause, delete)
 *
 * Every string a family member reads is Brazilian Portuguese: the family is
 * Brazilian, and the server already speaks Portuguese in readiness lines,
 * summaries and needs_family. Code and identifiers stay English.
 *
 * The readiness "knows" list was removed rather than restyled: the ledger
 * already states people, stories and voice, so the list repeated the page back
 * to itself. What is missing still shows, because that is actionable.
 *
 * Failures: presenceAPI throws PresenceApiError. Each action keeps one error
 * line, shown right under the row that failed, keyed in `errors`.
 */

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

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s.toString().padStart(2, '0')} s` : `${s} s`;
}

const NOTE_STATE: Record<PresenceNote['status'], string> = {
  queued: 'Esperando a próxima ligação dela',
  delivered: 'Entregue',
  archived: 'Arquivado',
};

const CALL_STATUS: Record<PresenceCall['status'], string> = {
  dialing: 'chamando',
  answered: 'atendeu',
  no_answer: 'não atendeu',
  busy: 'ocupado',
  failed: 'falhou',
  completed: 'conversaram',
};

/** 0 = Sunday, as the server stores call_days. */
const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const WEEKDAYS = [1, 2, 3, 4, 5];
const CALL_HOURS = Array.from({ length: 15 }, (_, i) => 7 + i);
const DEFAULT_HOUR = 10;
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const WHATSAPP_OPENER = 'Oi, quero receber os resumos da Presença.';

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

function formatDays(days: number[]) {
  const set = Array.from(new Set(days)).sort((a, b) => a - b);
  if (set.length === 7) return 'todos os dias';
  if (set.join() === WEEKDAYS.join()) return 'de segunda a sexta';
  return set.map((d) => DAY_SHORT[d]).join(', ');
}

/** Weekday (0 = Sunday), hour and minute of `now` on her wall clock. Falls
 *  back to the viewer's clock when the zone name is one Intl rejects. */
function wallClock(now: Date, timeZone: string) {
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { ...options, timeZone }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
  }
  const get = (type: Intl.DateTimeFormatPart['type']) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday: weekday < 0 ? now.getDay() : weekday, hour: Number(get('hour')) % 24, minute: Number(get('minute')) };
}

/** "hoje às 10:00", "amanhã às 10:00" or "sexta às 10:00": the next call after
 *  now, on her clock. Null when no day is chosen. */
function nextCallLabel(hour: number, days: number[], timeZone: string, now = new Date()) {
  if (days.length === 0) return null;
  const clock = wallClock(now, timeZone);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = (clock.weekday + offset) % 7;
    if (!days.includes(day)) continue;
    if (offset === 0 && clock.hour >= hour) continue;
    const when = offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : DAY_LONG[day];
    return `${when} às ${hourLabel(hour)}`;
  }
  return null;
}

/** The server wants E.164 with no spaces; people type "+55 11 98888 7777". */
const compactPhone = (raw: string) => raw.replace(/[\s().-]/g, '');

const SAVE_FAILED = 'Não deu para salvar. Tente de novo.';
const NOT_READY = 'Ela ainda não está pronta para a primeira conversa.';

/** The one line under a failed action. A 409 on the call link means she is
 *  not ready; the server's own line (its missing list) follows when it is a
 *  sentence and not a bare status. */
function errorLine(err: unknown, action: 'link' | 'other') {
  if (action === 'link' && err instanceof PresenceApiError && err.status === 409) {
    const detail = err.message && !/^HTTP \d+$/.test(err.message) ? ` ${err.message}` : '';
    return `${NOT_READY}${detail}`;
  }
  return SAVE_FAILED;
}

/** The sidebar: plain links, the current one underlined. */
/**
 * The family's app is six pages (2026-09-19): one route each, the sidebar is real
 * navigation, and each page carries the sections named here. Hoje is the front:
 * the next call, what needs a person, the last conversation.
 */
export type PresencePage = 'home' | 'calls' | 'conversations' | 'notes' | 'people' | 'settings';
const PAGES: Array<{ id: PresencePage; path: string; label: string }> = [
  { id: 'home', path: '/presence/home', label: 'Hoje' },
  { id: 'calls', path: '/presence/calls', label: 'Ligações' },
  { id: 'conversations', path: '/presence/conversations', label: 'Conversas' },
  { id: 'notes', path: '/presence/notes', label: 'Recados' },
  { id: 'people', path: '/presence/people', label: 'Pessoas' },
  { id: 'settings', path: '/presence/settings', label: 'Configurações' },
];
const SECTIONS: Record<PresencePage, string[]> = {
  home: ['needs'],
  calls: ['calls'],
  conversations: ['conversations'],
  notes: ['notes'],
  people: ['asks', 'people'],
  settings: ['link', 'whatsapp', 'voice', 'settings', 'members'],
};

const ROLE_LABEL: Record<PresenceMember['role'], string> = { owner: 'Você', family: 'Familiar', companion: 'Cuidadora' };
export default function PresenceHome({ page = 'home' }: { page?: PresencePage }) {
  const navigate = useNavigate();
  const { trackEvent } = useAnalytics();
  const [overview, setOverview] = useState<PresenceOverview | null>(null);
  const [readiness, setReadiness] = useState<PresenceReadiness | null>(null);
  const [state, setState] = useState<'loading' | 'none' | 'ready' | 'error'>('loading');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [askDrafts, setAskDrafts] = useState<Record<string, { relation: string; calledBy: string }>>({});
  const [askBusy, setAskBusy] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  /** A companion's reduced page; the full overview stays null then. */
  const [companion, setCompanion] = useState<CompanionOverview | null>(null);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [inviteBusy, setInviteBusy] = useState<'family' | 'companion' | null>(null);
  const [inviteLink, setInviteLink] = useState<{ url: string; role: 'family' | 'companion' } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const isOwner = (overview?.role ?? 'owner') === 'owner';
  const show = (id: string) => SECTIONS[page].includes(id);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [openConv, setOpenConv] = useState<string | null>(null);
  const [convDetail, setConvDetail] = useState<Record<string, PresenceConversationDetail>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [hourDraft, setHourDraft] = useState(DEFAULT_HOUR);
  const [daysDraft, setDaysDraft] = useState<number[]>(WEEKDAYS);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waCode, setWaCode] = useState('');
  const [waSent, setWaSent] = useState(false);
  const [waBusy, setWaBusy] = useState<'request' | 'verify' | 'unlink' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const openedTracked = useRef(false);

  const setError = useCallback((key: string, line: string | null) => {
    setErrors((current) => {
      const next = { ...current };
      if (line) next[key] = line;
      else delete next[key];
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const mine = await presenceAPI.mine();
      if (!mine?.presence) {
        setState('none');
        return;
      }
      if (mine.role === 'companion') {
        // The companion's page: no readiness mirror, no conversations.
        const data = await presenceAPI.overview(mine.presence.id);
        if (data.role === 'companion') {
          setCompanion(data);
          setState('ready');
        } else {
          setState('none');
        }
        return;
      }
      const [data, ready] = await Promise.all([
        presenceAPI.overview(mine.presence.id),
        presenceAPI.readiness(mine.presence.id),
      ]);
      if (data.role !== 'companion' && data?.presence) {
        setOverview(data);
        setReadiness(ready);
        setState('ready');
      } else {
        setState('none');
      }
    } catch {
      setState((current) => (current === 'ready' ? current : 'error'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const presenceId = overview?.presence.id ?? null;
  useEffect(() => {
    if (!presenceId || !isOwner) return;
    let cancelled = false;
    void presenceAPI.members(presenceId)
      .then((res) => { if (!cancelled) setMembers(res.members || []); })
      .catch((err) => { if (!cancelled) setError('members', err instanceof PresenceApiError ? 'Não consegui carregar quem acompanha.' : 'Sem conexão.'); });
    return () => { cancelled = true; };
  }, [presenceId, isOwner, setError]);

  const makeInvite = useCallback(async (role: 'family' | 'companion') => {
    if (!presenceId) return;
    setInviteBusy(role);
    setError('members', null);
    setInviteCopied(false);
    try {
      const res = await presenceAPI.invite(presenceId, role);
      setInviteLink({ url: `${window.location.origin}${res.join_path}`, role });
    } catch (err) {
      setError('members', err instanceof PresenceApiError ? 'Não consegui fazer o convite. Tente de novo.' : 'Sem conexão. Tente de novo.');
    } finally {
      setInviteBusy(null);
    }
  }, [presenceId, setError]);

  const copyInvite = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink.url);
      setInviteCopied(true);
    } catch {
      setError('members', 'Não consegui copiar. Selecione o link e copie.');
    }
  }, [inviteLink, setError]);

  const dropMember = useCallback(async (userId: string) => {
    if (!presenceId) return;
    setError('members', null);
    try {
      await presenceAPI.removeMember(presenceId, userId);
      setMembers((current) => current.filter((m) => m.user_id !== userId));
    } catch (err) {
      setError('members', err instanceof PresenceApiError ? 'Não consegui remover. Tente de novo.' : 'Sem conexão. Tente de novo.');
    }
  }, [presenceId, setError]);

  useEffect(() => {
    if (state === 'none') navigate('/presence/onboarding', { replace: true });
  }, [state, navigate]);

  useEffect(() => {
    if (state !== 'ready' || openedTracked.current) return;
    openedTracked.current = true;
    trackEvent('presence_home_opened');
  }, [state, trackEvent]);

  const sidebar = (
    <aside className={`pc-side${menuOpen ? ' is-open' : ''}`} id="dsh-nav">
      <Link className="pc-side-brand" to="/presence" aria-label="Presença"><Mark /></Link>
      <nav className="pc-side-nav" aria-label="A Presença dela">
        {PAGES.map((item) => (
          <Link className="pc-side-link" to={item.path} key={item.id} aria-current={item.id === page ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{item.label}</Link>
        ))}
        {isOwner ? <Link className="pc-side-link" to="/presence/onboarding">Sobre ela</Link> : null}
      </nav>
    </aside>
  );

  const topbar = (
    <div className="pc-topbar">
      <Link className="pc-side-brand" to="/presence" aria-label="Presença"><Mark /></Link>
      <button
        className="pc-btn pc-btn--ghost"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-controls="dsh-nav"
      >
        Menu
      </button>
    </div>
  );

  if (state === 'ready' && companion) {
    return <PresenceCompanionHome overview={companion} reload={load} />;
  }

  if (state !== 'ready' || !overview) {
    return (
      <main className="presence-cosmos pc-app dsh" id="main-content">
        <div className="pc-shell">
          {topbar}
          {sidebar}
          <div className="pc-col">
            {state === 'error' ? (
              <p className="pc-empty">Não consegui carregar. Recarregue a página.</p>
            ) : (
              <div className="pc-loading" role="status" aria-live="polite">
                <LedgerOrb state="breathing" size={64} label="Carregando" />
                <p className="pc-empty">Carregando a Presença dela</p>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  const { presence, people, voice, notes, conversations, facts, calls, whatsapp } = overview;
  const asks = facts.filter((f) => f.confidence === 'ask');
  const elderPhone = presence.elder_phone?.trim() || null;
  const callHour = presence.call_hour ?? DEFAULT_HOUR;
  const callDays = presence.call_days ?? WEEKDAYS;
  const callTimezone = presence.call_timezone || DEFAULT_TIMEZONE;
  const askName = (question: string) => (question.match(/(?:Quem é|Who is) "(.+?)"\?/) || [])[1] || question;
  const name = presence.cared_for_name?.trim() || 'A sua Presença';
  const callUrl = presence.call_token ? `${window.location.origin}/call/${presence.call_token}` : null;
  const queuedNotes = notes.filter((n) => n.status === 'queued');
  const isReady = readiness?.ready ?? false;
  const voiceReady = voice?.status === 'ready';
  const paused = presence.status === 'paused';

  /** What only a person can do, across her calls: the urgent ones first, then
   *  in the order the calls came, capped at five. Array.sort is stable. */
  const needsYou = conversations
    .flatMap((c) => (c.needs_family || []).map((item) => ({ item, urgent: c.urgency === 'high' })))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent))
    .slice(0, 5);

  const voiceLine = voiceReady
    ? `As ligações dela usam a sua voz${voice?.sample_count ? ` (${voice.sample_count} ${voice.sample_count === 1 ? 'amostra' : 'amostras'})` : ''}.`
    : 'Em breve: a sua voz nas ligações dela. Por enquanto, ela ouve uma voz padrão, calorosa.';

  /** The old plate's ledger, as the title's one grey line. Every part states a
   *  real count or says plainly that there is none. */
  const ledger = [
    paused ? 'ligações pausadas' : null,
    conversations.length ? `${conversations.length} ${conversations.length === 1 ? 'conversa' : 'conversas'}` : 'nenhuma conversa ainda',
    queuedNotes.length ? `${queuedNotes.length} ${queuedNotes.length === 1 ? 'recado esperando' : 'recados esperando'}` : null,
    people.length ? `${people.length} ${people.length === 1 ? 'pessoa' : 'pessoas'}` : 'nenhuma pessoa ainda',
    voiceReady ? 'a sua voz' : 'voz padrão',
  ].filter(Boolean).join(' · ');

  async function rotateLink() {
    setLinkBusy(true);
    setError('link', null);
    try {
      const result = await presenceAPI.createCallLink(presence.id);
      trackEvent('presence_link_created', { rotated: Boolean(callUrl) });
      if (result?.call_path) await load();
    } catch (err) {
      setError('link', errorLine(err, 'link'));
    }
    setLinkBusy(false);
  }

  async function copyLink() {
    if (!callUrl) return;
    try {
      await navigator.clipboard.writeText(callUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the URL is visible to select */
    }
  }

  async function resolveAsk(factId: string, action: 'add' | 'dismiss') {
    setAskBusy(factId);
    setError(`ask:${factId}`, null);
    const draft = askDrafts[factId] || { relation: '', calledBy: '' };
    try {
      await presenceAPI.answerAsk(presence.id, factId, { action, relation: draft.relation, called_by: draft.calledBy });
      trackEvent('presence_ask_resolved', { action });
      await load();
    } catch (err) {
      setError(`ask:${factId}`, errorLine(err, 'other'));
    }
    setAskBusy(null);
  }

  async function removeVoice() {
    if (!window.confirm('Remover a sua voz? As ligações dela passam a usar uma voz padrão.')) return;
    setVoiceBusy(true);
    setError('voice', null);
    try {
      await presenceAPI.revokeVoice(presence.id);
      trackEvent('presence_voice_revoked');
      await load();
    } catch (err) {
      setError('voice', errorLine(err, 'other'));
    }
    setVoiceBusy(false);
  }

  async function togglePaused() {
    const next = paused ? 'active' : 'paused';
    setStatusBusy(true);
    setError('status', null);
    try {
      await presenceAPI.patch(presence.id, { status: next });
      trackEvent(next === 'paused' ? 'presence_paused' : 'presence_resumed');
      await load();
    } catch (err) {
      setError('status', errorLine(err, 'other'));
    }
    setStatusBusy(false);
  }

  async function removePresence() {
    if (!window.confirm('Apagar a Presença? As conversas dela e o link deixam de existir para a família.')) return;
    setDeleteBusy(true);
    setError('delete', null);
    try {
      await presenceAPI.remove(presence.id);
      trackEvent('presence_deleted');
      navigate('/presence');
      return;
    } catch (err) {
      setError('delete', errorLine(err, 'other'));
    }
    setDeleteBusy(false);
  }

  /** Open one conversation and fetch its transcript once. */
  async function toggleConversation(conversationId: string) {
    if (openConv === conversationId) {
      setOpenConv(null);
      return;
    }
    setOpenConv(conversationId);
    if (convDetail[conversationId]) return;
    setError(`conv:${conversationId}`, null);
    try {
      const result = await presenceAPI.conversation(presence.id, conversationId);
      if (result?.conversation) {
        setConvDetail((current) => ({ ...current, [conversationId]: result.conversation }));
      }
    } catch {
      setError(`conv:${conversationId}`, 'Não consegui carregar a conversa. Tente de novo.');
    }
  }

  async function sendNote() {
    const body = noteDraft.trim();
    if (!body || noteSending) return;
    setNoteSending(true);
    setError('note', null);
    try {
      await presenceAPI.queueNote(presence.id, body);
      trackEvent('presence_note_sent');
      setNoteDraft('');
      await load();
    } catch (err) {
      setError('note', errorLine(err, 'other'));
    }
    setNoteSending(false);
  }

  function openPhoneEditor() {
    setPhoneDraft(elderPhone || '');
    setError('phone', null);
    setPhoneOpen((open) => !open);
  }

  /** PATCH elder_phone. A 400 is the server saying what is wrong with the
   *  number, so its line shows; anything else is the page's own line. */
  async function savePhone(value: string | null) {
    setPhoneBusy(true);
    setError('phone', null);
    try {
      await presenceAPI.patch(presence.id, { elder_phone: value });
      trackEvent('presence_phone_saved', { removed: value === null });
      setPhoneOpen(false);
      await load();
    } catch (err) {
      const serverLine = err instanceof PresenceApiError && err.status === 400 && !/^HTTP \d+$/.test(err.message);
      setError('phone', serverLine ? err.message : SAVE_FAILED);
    }
    setPhoneBusy(false);
  }

  function openEmergencyEditor() {
    setEmergencyName(presence.emergency_name || '');
    setEmergencyPhone(presence.emergency_phone || '');
    setError('emergency', null);
    setEmergencyOpen((open) => !open);
  }

  /** PATCH emergency_name and emergency_phone; null clears both. */
  async function saveEmergency(clear = false) {
    setEmergencyBusy(true);
    setError('emergency', null);
    try {
      await presenceAPI.patch(presence.id, clear
        ? { emergency_name: null, emergency_phone: null }
        : { emergency_name: emergencyName.trim() || null, emergency_phone: compactPhone(emergencyPhone) || null });
      trackEvent('presence_emergency_saved', { removed: clear });
      setEmergencyOpen(false);
      await load();
    } catch (err) {
      const serverLine = err instanceof PresenceApiError && err.status === 400 && !/^HTTP \d+$/.test(err.message);
      setError('emergency', serverLine ? err.message : SAVE_FAILED);
    }
    setEmergencyBusy(false);
  }

  function openScheduleEditor() {
    setHourDraft(callHour);
    setDaysDraft(callDays);
    setError('schedule', null);
    setScheduleOpen((open) => !open);
  }

  function toggleDay(day: number) {
    setDaysDraft((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b)));
  }

  async function saveSchedule() {
    if (daysDraft.length === 0) return;
    setScheduleBusy(true);
    setError('schedule', null);
    try {
      await presenceAPI.patch(presence.id, { call_hour: hourDraft, call_days: daysDraft });
      trackEvent('presence_schedule_saved', { call_hour: hourDraft, days: daysDraft.length });
      setScheduleOpen(false);
      await load();
    } catch (err) {
      setError('schedule', errorLine(err, 'other'));
    }
    setScheduleBusy(false);
  }

  /** The code is a WhatsApp session message: it only arrives inside the 24-hour
   *  window the person opens by writing to the number first (step 1). */
  async function requestWhatsAppCode() {
    const phone = compactPhone(waPhone);
    if (!phone || waBusy) return;
    setWaBusy('request');
    setError('wa:request', null);
    setError('wa:verify', null);
    try {
      await whatsappLink.request(phone);
      trackEvent('presence_whatsapp_link_requested');
      setWaSent(true);
    } catch (err) {
      const status = err instanceof PresenceApiError ? err.status : 0;
      setError(
        'wa:request',
        status === 429
          ? 'Espere um minuto e tente de novo.'
          : status === 502
            ? 'O código não chegou. Abra a conversa no WhatsApp primeiro (passo 1) e tente de novo.'
            : status === 400
              ? 'Número inválido. Use o código do país, como +55 11 98888 7777.'
              : 'Não deu para enviar o código. Tente de novo.',
      );
    }
    setWaBusy(null);
  }

  /** whatsappLink.verify throws on a wrong code (the server answers 400, or
   *  429 after too many tries), so `success: false` only reaches the body
   *  branch defensively. */
  async function verifyWhatsAppCode() {
    const phone = compactPhone(waPhone);
    const code = waCode.trim();
    if (!phone || !/^\d{6}$/.test(code) || waBusy) return;
    setWaBusy('verify');
    setError('wa:verify', null);
    try {
      const result = await whatsappLink.verify(phone, code);
      if (result?.success) {
        trackEvent('presence_whatsapp_linked');
        setWaPhone('');
        setWaCode('');
        setWaSent(false);
        await load();
      } else {
        setError('wa:verify', 'Código errado ou vencido.');
      }
    } catch (err) {
      const status = err instanceof PresenceApiError ? err.status : 0;
      setError(
        'wa:verify',
        status === 429
          ? 'Muitas tentativas. Peça um código novo.'
          : status === 400
            ? 'Código errado ou vencido.'
            : 'Não deu para confirmar. Tente de novo.',
      );
    }
    setWaBusy(null);
  }

  async function unlinkWhatsApp() {
    if (!window.confirm('Desconectar o WhatsApp? Você deixa de receber a mensagem depois de cada ligação.')) return;
    setWaBusy('unlink');
    setError('wa:unlink', null);
    try {
      await whatsappLink.unlink();
      trackEvent('presence_whatsapp_unlinked');
      await load();
    } catch (err) {
      setError('wa:unlink', errorLine(err, 'other'));
    }
    setWaBusy(null);
  }

  const linkLine = paused
    ? 'As ligações estão pausadas. O link dela volta a funcionar quando você retomar.'
    : callUrl || isReady
      ? 'Para tablet ou computador. As ligações vão para o celular dela.'
      : 'O link abre quando ela souber o suficiente para a primeira conversa.';

  const nextCall = nextCallLabel(callHour, callDays, callTimezone);
  const nextCallLine = !elderPhone
    ? 'Cadastre o celular dela para as ligações começarem.'
    : paused
      ? 'As ligações estão pausadas.'
      : nextCall
        ? nextCall
        : 'Escolha os dias das ligações.';

  const assentLine = presence.elder_assent_at
    ? `Ela disse sim em ${new Date(presence.elder_assent_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}.`
    : 'Na primeira ligação a Presença se apresenta e pergunta se pode conversar com ela. Avise ela antes.';

  const waOpenerUrl = `${TWIN_WHATSAPP_LINK}?text=${encodeURIComponent(WHATSAPP_OPENER)}`;

  const errorRow = (key: string) =>
    errors[key] ? (
      <li className="pc-subrow" role="alert">
        <p className="dsh-detail">{errors[key]}</p>
      </li>
    ) : null;

  return (
    <main className="presence-cosmos pc-app dsh" id="main-content">
      <div className="pc-shell">
        {topbar}
        {sidebar}

        <div className="pc-col">
          <header className="pc-apphead">
            <h1 className="pc-apphead-title">{name}</h1>
            <p className="pc-apphead-line">{ledger}</p>
          </header>

          {page === 'home' && (
            <section className="pc-appsection" id="today">
              <div className="pc-sechead">
                <h2 className="pc-sechead-title">Hoje</h2>
                <p className="pc-sechead-line">O que está para acontecer, e o que já aconteceu.</p>
              </div>
              <ul className="pc-list">
                <li className="pc-row">
                  <span className="pc-row-icon" aria-hidden="true"><CalendarClock /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">Próxima ligação</p>
                    <p className="pc-row-line">{nextCallLine}</p>
                  </div>
                  <Link className="pc-row-action pc-row-go" to="/presence/calls" aria-label="Ligações"><ChevronRight size={16} /></Link>
                </li>
                <li className="pc-row">
                  <span className="pc-row-icon" aria-hidden="true"><MessageCircle /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">Última conversa</p>
                    <p className="pc-row-line">{conversations[0] ? `${formatWhen(conversations[0].started_at)} · ${conversations[0].summary.slice(0, 72)}${conversations[0].summary.length > 72 ? '…' : ''}` : 'Nenhuma conversa ainda.'}</p>
                  </div>
                  <Link className="pc-row-action pc-row-go" to="/presence/conversations" aria-label="Conversas"><ChevronRight size={16} /></Link>
                </li>
                <li className="pc-row">
                  <span className="pc-row-icon" aria-hidden="true"><MessageSquare /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">Recados</p>
                    <p className="pc-row-line">{queuedNotes.length ? `${queuedNotes.length} ${queuedNotes.length === 1 ? 'recado esperando' : 'recados esperando'} a próxima ligação.` : 'Nenhum recado esperando.'}</p>
                  </div>
                  <Link className="pc-row-action pc-row-go" to="/presence/notes" aria-label="Recados"><ChevronRight size={16} /></Link>
                </li>
              </ul>
            </section>
          )}

          {isOwner && (
          <>
          {show('link') && (
<section className="pc-appsection" id="link">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">O link dela</h2>
              <p className="pc-sechead-line">{linkLine}</p>
            </div>
            <ul className="pc-list">
              {callUrl ? (
                <>
                  <li className="pc-row">
                    <span className="pc-row-icon" aria-hidden="true"><Link2 /></span>
                    <div className="pc-row-text">
                      {/* The token is long and must not clip: a truncated URL is a URL
                          you cannot read back to someone over the phone. */}
                      <p className="pc-row-title">{callUrl}</p>
                      <p className="pc-row-line">Um toque começa a conversa.</p>
                    </div>
                    <div className="pc-row-action">
                      <button className="pc-btn pc-btn--primary" onClick={copyLink}>
                        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </li>
                  <li className="pc-row">
                    <span className="pc-row-icon" aria-hidden="true"><RefreshCw /></span>
                    <div className="pc-row-text">
                      <p className="pc-row-title">Fazer um link novo</p>
                      <p className="pc-row-line">O antigo deixa de funcionar.</p>
                    </div>
                    <div className="pc-row-action">
                      <button className="pc-btn pc-btn--ghost" onClick={rotateLink} disabled={linkBusy}>
                        {linkBusy ? <Loader2 className="pc-spin" size={14} /> : null} Link novo
                      </button>
                    </div>
                  </li>
                  {errorRow('link')}
                </>
              ) : isReady ? (
                <>
                  <li className="pc-row">
                    <span className="pc-row-icon" aria-hidden="true"><Link2 /></span>
                    <div className="pc-row-text">
                      <p className="pc-row-title">O link de ligação dela</p>
                      <p className="pc-row-line">Um toque nele começa uma conversa.</p>
                    </div>
                    <div className="pc-row-action">
                      <button className="pc-btn pc-btn--primary" onClick={rotateLink} disabled={linkBusy}>
                        {linkBusy ? <Loader2 className="pc-spin" size={14} /> : null} Criar link
                      </button>
                    </div>
                  </li>
                  {errorRow('link')}
                </>
              ) : (
                readiness && (
                  <>
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><Link2 /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">Ainda não está pronta</p>
                        <p className="pc-row-line">{readiness.score}% do que ela precisa</p>
                      </div>
                      <span />
                    </li>
                    {readiness.missing.map((line, index) => (
                      <li className="pc-subrow" key={`m${index}`}>
                        <p className="dsh-detail">{line}</p>
                      </li>
                    ))}
                    <li>
                      <Link className="pc-row pc-row--link" to="/presence/onboarding">
                        <span className="pc-row-icon" aria-hidden="true"><Plus /></span>
                        <span className="pc-row-text">
                          <span className="pc-row-title">Conte mais sobre ela</span>
                          <span className="pc-row-line">Leva uns minutos.</span>
                        </span>
                        <ChevronRight className="pc-chevron" aria-hidden="true" />
                      </Link>
                    </li>
                  </>
                )
              )}
            </ul>
          </section>
)}

                    </>
          )}

          {show('calls') && (
<section className="pc-appsection" id="calls">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">Ligações</h2>
              <p className="pc-sechead-line">A Presença liga para o celular dela na hora combinada.</p>
            </div>
            <ul className="pc-list">
              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true"><Phone /></span>
                <div className="pc-row-text">
                  <p className="pc-row-title">Celular dela</p>
                  <p className="pc-row-line">{elderPhone || 'Não cadastrado'}</p>
                </div>
                {isOwner ? (
                  <div className="pc-row-action">
                    <button className="pc-btn pc-btn--ghost" onClick={openPhoneEditor} aria-expanded={phoneOpen} aria-controls="dsh-phone-form">
                      {elderPhone ? 'Alterar' : 'Cadastrar'}
                    </button>
                  </div>
                ) : <span />}
              </li>
              {phoneOpen && (
                <li className="pc-subrow dsh-form" id="dsh-phone-form">
                  <label className="pc-field">
                    <span className="pc-field-label">Celular dela</span>
                    <input
                      className="pc-input"
                      type="tel"
                      inputMode="tel"
                      value={phoneDraft}
                      placeholder="+55 11 98888 7777"
                      onChange={(e) => setPhoneDraft(e.target.value)}
                    />
                  </label>
                  <div className="dsh-form-actions">
                    {elderPhone ? (
                      <button className="pc-btn pc-btn--ghost" disabled={phoneBusy} onClick={() => savePhone(null)}>
                        Remover
                      </button>
                    ) : null}
                    <button className="pc-btn pc-btn--ghost" disabled={phoneBusy || !compactPhone(phoneDraft)} onClick={() => savePhone(compactPhone(phoneDraft))}>
                      {phoneBusy ? <Loader2 className="pc-spin" size={14} /> : <Check size={14} />} Salvar
                    </button>
                  </div>
                  {errors.phone ? <p className="dsh-detail" role="alert">{errors.phone}</p> : null}
                </li>
              )}
              {!phoneOpen ? errorRow('phone') : null}

              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true"><AlertCircle /></span>
                <div className="pc-row-text">
                  <p className="pc-row-title">Contato de emergência</p>
                  <p className="pc-row-line">{presence.emergency_name ? `Se ela falar de dor forte ou queda, ela ouve que ${presence.emergency_name} vai saber agora.` : 'Quem ela ouve que vai saber, se falar de dor forte ou queda.'}</p>
                </div>
                {isOwner ? (
                  <div className="pc-row-action">
                    <button className="pc-btn pc-btn--ghost" onClick={openEmergencyEditor} aria-expanded={emergencyOpen} aria-controls="dsh-emergency-form">
                      {presence.emergency_name ? 'Alterar' : 'Definir'}
                    </button>
                  </div>
                ) : <span />}
              </li>
              {emergencyOpen && (
                <li className="pc-subrow dsh-form" id="dsh-emergency-form">
                  <label className="pc-field">
                    <span className="pc-field-label">Nome, como ela conhece</span>
                    <input className="pc-input" type="text" value={emergencyName} placeholder="Ana" onChange={(e) => setEmergencyName(e.target.value)} />
                  </label>
                  <label className="pc-field">
                    <span className="pc-field-label">Telefone</span>
                    <input className="pc-input" type="tel" inputMode="tel" value={emergencyPhone} placeholder="+55 11 98888 7777" onChange={(e) => setEmergencyPhone(e.target.value)} />
                  </label>
                  <div className="dsh-form-actions">
                    {presence.emergency_name ? (
                      <button className="pc-btn pc-btn--ghost" disabled={emergencyBusy} onClick={() => saveEmergency(true)}>Remover</button>
                    ) : null}
                    <button className="pc-btn pc-btn--ghost" disabled={emergencyBusy || !emergencyName.trim()} onClick={() => saveEmergency()}>
                      {emergencyBusy ? <Loader2 className="pc-spin" size={14} /> : <Check size={14} />} Salvar
                    </button>
                  </div>
                  {errors.emergency ? <p className="dsh-detail" role="alert">{errors.emergency}</p> : null}
                </li>
              )}
              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true"><Clock /></span>
                <div className="pc-row-text">
                  <p className="pc-row-title">Horário</p>
                  <p className="pc-row-line">{hourLabel(callHour)}, {formatDays(callDays)}</p>
                </div>
                {isOwner ? (
                  <div className="pc-row-action">
                    <button className="pc-btn pc-btn--ghost" onClick={openScheduleEditor} aria-expanded={scheduleOpen} aria-controls="dsh-schedule-form">
                      Alterar
                    </button>
                  </div>
                ) : <span />}
              </li>
              {scheduleOpen && (
                <li className="pc-subrow dsh-form" id="dsh-schedule-form">
                  <label className="pc-field">
                    <span className="pc-field-label">Hora</span>
                    <span className="pc-select">
                      <select className="pc-input" value={hourDraft} onChange={(e) => setHourDraft(Number(e.target.value))}>
                        {CALL_HOURS.map((hour) => (
                          <option key={hour} value={hour}>{hourLabel(hour)}</option>
                        ))}
                      </select>
                      <ChevronDown aria-hidden="true" />
                    </span>
                  </label>
                  <div className="pc-field">
                    <span className="pc-field-label">Dias</span>
                    <div className="pc-ob-chips" role="group" aria-label="Dias das ligações">
                      {DAY_SHORT.map((label, day) => (
                        <button
                          type="button"
                          key={day}
                          className={`pc-ob-chip${daysDraft.includes(day) ? ' is-selected' : ''}`}
                          aria-pressed={daysDraft.includes(day)}
                          onClick={() => toggleDay(day)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="dsh-form-actions">
                    <button className="pc-btn pc-btn--ghost" disabled={scheduleBusy || daysDraft.length === 0} onClick={saveSchedule}>
                      {scheduleBusy ? <Loader2 className="pc-spin" size={14} /> : <Check size={14} />} Salvar
                    </button>
                  </div>
                  {errors.schedule ? <p className="dsh-detail" role="alert">{errors.schedule}</p> : null}
                </li>
              )}
              {!scheduleOpen ? errorRow('schedule') : null}

              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true"><UserCheck /></span>
                <div className="pc-row-text">
                  <p className="pc-row-title">Primeira ligação</p>
                  <p className="pc-row-line">{assentLine}</p>
                </div>
                <span />
              </li>

              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true"><CalendarClock /></span>
                <div className="pc-row-text">
                  <p className="pc-row-title">Próxima ligação</p>
                  <p className="pc-row-line">{nextCallLine}</p>
                </div>
                <span />
              </li>
            </ul>

            <div className="pc-sechead">
              <h2 className="pc-sechead-title">Últimas ligações</h2>
              <p className="pc-sechead-line">As dez mais recentes.</p>
            </div>
            {calls.length === 0 ? (
              <div className="pc-list">
                <p className="pc-empty">Nenhuma ligação ainda.</p>
              </div>
            ) : (
              <ul className="pc-list">
                {calls.map((call) => (
                  <li className="pc-row" key={call.id}>
                    <span className="pc-row-icon" aria-hidden="true">
                      {call.direction === 'inbound' ? <PhoneIncoming /> : <PhoneOutgoing />}
                    </span>
                    <div className="pc-row-text">
                      <p className="pc-row-title">
                        {call.direction === 'inbound' ? 'Ela ligou · ' : ''}
                        {formatWhen(call.scheduled_for)} · {CALL_STATUS[call.status] || call.status}
                      </p>
                      {call.attempt > 1 ? <p className="pc-row-line">{call.attempt}ª tentativa</p> : null}
                    </div>
                    <span />
                  </li>
                ))}
              </ul>
            )}
          </section>
)}

          {show('whatsapp') && (
<section className="pc-appsection" id="whatsapp">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">WhatsApp</h2>
              <p className="pc-sechead-line">Depois de cada ligação, um resumo chega no seu WhatsApp.</p>
            </div>
            {whatsapp.linked ? (
              <ul className="pc-list">
                <li className="pc-row">
                  <span className="pc-row-icon" aria-hidden="true"><BrandMark name="whatsapp" size={20} /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">Conectado ao número terminado em {whatsapp.phone_last4}.</p>
                    <p className="pc-row-line">Você recebe uma mensagem depois de cada ligação. Responda a mensagem e ela ouve na próxima.</p>
                  </div>
                  <div className="pc-row-action">
                    <button className="pc-btn pc-btn--ghost" onClick={unlinkWhatsApp} disabled={waBusy === 'unlink'}>
                      {waBusy === 'unlink' ? <Loader2 className="pc-spin" size={14} /> : null} Desconectar
                    </button>
                  </div>
                </li>
                {errorRow('wa:unlink')}
              </ul>
            ) : (
              <ul className="pc-list">
                <li className="pc-row pc-row--plain dsh-form">
                  <div className="pc-row-text">
                    <p className="pc-row-title">1. Abra a conversa com a Presença no WhatsApp</p>
                    <p className="pc-row-line">Isso abre a janela de 24 horas para o código chegar.</p>
                  </div>
                  <div className="dsh-form-actions">
                    <a className="pc-btn pc-btn--ghost" href={waOpenerUrl} target="_blank" rel="noopener noreferrer">
                      Abrir conversa
                    </a>
                  </div>
                </li>
                <li className="pc-row pc-row--plain dsh-form">
                  <label className="pc-field">
                    <span className="pc-field-label">2. Seu número</span>
                    <input
                      className="pc-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={waPhone}
                      placeholder="+55 11 98888 7777"
                      onChange={(e) => setWaPhone(e.target.value)}
                    />
                  </label>
                  <div className="dsh-form-actions">
                    <button className="pc-btn pc-btn--ghost" onClick={requestWhatsAppCode} disabled={waBusy !== null || !compactPhone(waPhone)}>
                      {waBusy === 'request' ? <Loader2 className="pc-spin" size={14} /> : null} Enviar código
                    </button>
                  </div>
                  {errors['wa:request'] ? (
                    <p className="dsh-detail" role="alert">{errors['wa:request']}</p>
                  ) : waSent ? (
                    <p className="dsh-detail" role="status">Código enviado no WhatsApp.</p>
                  ) : null}
                </li>
                <li className="pc-row pc-row--plain dsh-form">
                  <label className="pc-field">
                    <span className="pc-field-label">3. Código</span>
                    <input
                      className="pc-input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={waCode}
                      placeholder="123456"
                      onChange={(e) => setWaCode(e.target.value.replace(/\D/g, ''))}
                    />
                  </label>
                  <div className="dsh-form-actions">
                    <button className="pc-btn pc-btn--ghost" onClick={verifyWhatsAppCode} disabled={waBusy !== null || !compactPhone(waPhone) || waCode.length !== 6}>
                      {waBusy === 'verify' ? <Loader2 className="pc-spin" size={14} /> : <Check size={14} />} Confirmar
                    </button>
                  </div>
                  {errors['wa:verify'] ? <p className="dsh-detail" role="alert">{errors['wa:verify']}</p> : null}
                </li>
              </ul>
            )}
          </section>
)}

          {asks.length > 0 && show('asks') && (
<section className="pc-appsection" id="asks">
              <div className="pc-sechead">
                <h2 className="pc-sechead-title">Quem é essa pessoa?</h2>
                <p className="pc-sechead-line">Ela falou de alguém novo. A Presença nunca adivinha.</p>
              </div>
              <ul className="pc-list">
                {asks.map((ask) => {
                  const who = askName(ask.question);
                  const draft = askDrafts[ask.id] || { relation: '', calledBy: '' };
                  return (
                    <li key={ask.id}>
                      <div className="pc-row pc-row--plain">
                        <div className="pc-row-text">
                          <p className="pc-row-title">Quem é “{who}”?</p>
                          <p className="pc-row-line">Responda e a pessoa entra na lista dela.</p>
                        </div>
                        <span />
                      </div>
                      <div className="pc-subrow dsh-form">
                        <div className="dsh-form-fields">
                          <label className="pc-field">
                            <span className="pc-field-label">Relação com ela</span>
                            <input
                              className="pc-input"
                              value={draft.relation}
                              placeholder="Filha"
                              onChange={(e) => setAskDrafts((d) => ({ ...d, [ask.id]: { ...draft, relation: e.target.value } }))}
                            />
                          </label>
                          <label className="pc-field">
                            <span className="pc-field-label">Como ela chama</span>
                            <input
                              className="pc-input"
                              value={draft.calledBy}
                              placeholder={who}
                              onChange={(e) => setAskDrafts((d) => ({ ...d, [ask.id]: { ...draft, calledBy: e.target.value } }))}
                            />
                          </label>
                        </div>
                        <div className="dsh-form-actions">
                          <button className="pc-btn pc-btn--ghost" disabled={askBusy === ask.id} onClick={() => resolveAsk(ask.id, 'dismiss')}>
                            Agora não
                          </button>
                          <button className="pc-btn pc-btn--ghost" disabled={askBusy === ask.id} onClick={() => resolveAsk(ask.id, 'add')}>
                            {askBusy === ask.id ? <Loader2 className="pc-spin" size={14} /> : <Check size={14} />} Adicionar às pessoas dela
                          </button>
                        </div>
                        {errors[`ask:${ask.id}`] ? <p className="dsh-detail" role="alert">{errors[`ask:${ask.id}`]}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {needsYou.length > 0 && show('needs') && (
<section className="pc-appsection" id="needs">
              <div className="pc-sechead">
                <h2 className="pc-sechead-title">Precisa de você</h2>
                <p className="pc-sechead-line">Coisas que só a família pode fazer.</p>
              </div>
              <ul className="pc-list">
                {needsYou.map((entry, index) => (
                  <li className="pc-row" key={index}>
                    <span className="pc-row-icon" aria-hidden="true"><AlertCircle /></span>
                    <div className="pc-row-text">
                      <p className="dsh-detail">
                        {entry.urgent ? <><span className="dsh-who">Urgente:</span> </> : null}
                        {entry.item}
                      </p>
                    </div>
                    <span />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {show('conversations') && (
<section className="pc-appsection" id="conversations">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">Conversas</h2>
              <p className="pc-sechead-line">O que veio das ligações dela.</p>
            </div>
            {conversations.length === 0 ? (
              <div className="pc-list">
                <p className="pc-empty">Nenhuma ligação ainda. Um resumo curto de cada uma aparece aqui.</p>
              </div>
            ) : (
              <ul className="pc-list">
                {conversations.map((c: PresenceConversation) => {
                  const summary = c.summary || (c.status === 'recorded' ? 'Resumindo…' : 'Sem resumo.');
                  const open = openConv === c.id;
                  return (
                    <li key={c.id}>
                      <div className="pc-row">
                        <span className="pc-row-icon" aria-hidden="true"><MessageCircle /></span>
                        <div className="pc-row-text">
                          <p className="pc-row-title">{formatWhen(c.started_at)} · {formatDuration(c.duration_seconds)}</p>
                          <p className={`pc-row-line${open ? '' : ' pc-row-line--clip'}`}>{summary}</p>
                        </div>
                        <div className="pc-row-action">
                          {c.turn_count > 0 ? (
                            <button
                              className="pc-iconbtn"
                              onClick={() => toggleConversation(c.id)}
                              aria-expanded={open}
                              aria-label={open ? 'Fechar a conversa' : `Ler a conversa (${c.turn_count} ${c.turn_count === 1 ? 'fala' : 'falas'})`}
                            >
                              {open ? <ChevronUp /> : <ChevronDown />}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {(c.needs_family || []).map((item, index) => (
                        <div className="pc-subrow" key={`n${index}`}>
                          <p className="dsh-detail">{item}</p>
                        </div>
                      ))}
                      {open && (
                        convDetail[c.id] ? (
                          convDetail[c.id].transcript.map((turn, index) => (
                            <div className={`pc-subrow dsh-turn${turn.role === 'assistant' ? ' is-ai' : ''}`} key={index}>
                              <div>
                                <span className="dsh-who">{turn.role === 'user' ? name : 'Presença'}</span>
                                <p className="dsh-detail">{turn.content}</p>
                              </div>
                            </div>
                          ))
                        ) : errors[`conv:${c.id}`] ? (
                          <div className="pc-subrow" role="alert">
                            <p className="dsh-detail">{errors[`conv:${c.id}`]}</p>
                          </div>
                        ) : (
                          <div className="pc-subrow">
                            <p className="pc-row-line">Carregando a conversa…</p>
                          </div>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
)}

          {show('notes') && (
<section className="pc-appsection" id="notes">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">Recados para ela</h2>
              <p className="pc-sechead-line">Lidos em voz alta na próxima ligação, como vindos de você.</p>
            </div>
            <ul className="pc-list">
              <li className="pc-row pc-row--plain dsh-form">
                <textarea
                  className="pc-input"
                  value={noteDraft}
                  placeholder="Conte que o bebê falou o nome dela hoje de manhã."
                  onChange={(event) => setNoteDraft(event.target.value)}
                  aria-label="Recado para a próxima conversa"
                />
                <div className="dsh-form-actions">
                  <button className="pc-btn pc-btn--ghost" onClick={sendNote} disabled={!noteDraft.trim() || noteSending}>
                    {noteSending ? <Loader2 className="pc-spin" size={14} /> : null} Deixar recado
                  </button>
                </div>
                {errors.note ? <p className="dsh-detail" role="alert">{errors.note}</p> : null}
              </li>
              {notes.slice(0, 6).map((note: PresenceNote) => (
                <li className="pc-row pc-row--plain" key={note.id}>
                  <div className="pc-row-text">
                    <p className="pc-row-title">{note.body}</p>
                    <p className="pc-row-line">{NOTE_STATE[note.status] || note.status}</p>
                  </div>
                  <span />
                </li>
              ))}
            </ul>
          </section>
)}

          {show('people') && (
<section className="pc-appsection" id="people">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">As pessoas dela</h2>
              <p className="pc-sechead-line">De quem ela fala, e como chama cada um.</p>
              <Link className="pc-iconbtn pc-sechead-add" to="/presence/onboarding" aria-label="Adicionar pessoas no cadastro">
                <Plus />
              </Link>
            </div>
            {people.length === 0 ? (
              <div className="pc-list">
                <p className="pc-empty">Nenhuma pessoa ainda. Adicione no cadastro.</p>
              </div>
            ) : (
              <ul className="pc-list">
                {people.map((p) => (
                  <li className="pc-row" key={p.id}>
                    <span className="pc-row-icon" aria-hidden="true"><User /></span>
                    <div className="pc-row-text">
                      <p className="pc-row-title">{p.name}</p>
                      <p className="pc-row-line">
                        {[p.relation, p.called_by ? `“${p.called_by}”` : ''].filter(Boolean).join(' · ') || 'Sem relação ainda'}
                      </p>
                    </div>
                    <span />
                  </li>
                ))}
              </ul>
            )}
          </section>
)}

          {isOwner && (
          <>
          {show('voice') && (
<section className="pc-appsection" id="voice">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">A sua voz</h2>
              <p className="pc-sechead-line">Como soam as ligações dela.</p>
            </div>
            {voiceReady ? (
              <ul className="pc-list">
                <li className="pc-row">
                  <span className="pc-row-icon" aria-hidden="true"><BrandMark name="elevenlabs" size={18} /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">A sua voz</p>
                    <p className="pc-row-line">{voiceLine}</p>
                  </div>
                  <div className="pc-row-action">
                    <button className="pc-btn pc-btn--danger" onClick={removeVoice} disabled={voiceBusy}>
                      {voiceBusy ? <Loader2 className="pc-spin" size={14} /> : <Trash2 size={14} />} Remover a minha voz
                    </button>
                  </div>
                </li>
                {errorRow('voice')}
              </ul>
            ) : (
              <div className="pc-list">
                <p className="pc-empty">{voiceLine}</p>
              </div>
            )}
          </section>
)}

                    </>
          )}

          {isOwner && (
          <>
          {show('settings') && (
<section className="pc-appsection" id="settings">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">Configurações</h2>
              <p className="pc-sechead-line">Pausar por um tempo, ou apagar de vez.</p>
            </div>
            <ul className="pc-list">
              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true">{paused ? <Play /> : <Pause />}</span>
                <div className="pc-row-text">
                  <p className="pc-row-title">{paused ? 'Retomar as ligações' : 'Pausar as ligações'}</p>
                  <p className="pc-row-line">Enquanto estiver pausada, ela não recebe ligações e o link não funciona.</p>
                </div>
                <div className="pc-row-action">
                  <button className="pc-btn pc-btn--ghost" onClick={togglePaused} disabled={statusBusy}>
                    {statusBusy ? <Loader2 className="pc-spin" size={14} /> : null} {paused ? 'Retomar' : 'Pausar'}
                  </button>
                </div>
              </li>
              {errorRow('status')}
              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true"><Trash2 /></span>
                <div className="pc-row-text">
                  <p className="pc-row-title">Apagar a Presença</p>
                  <p className="pc-row-line">As conversas dela e o link deixam de existir para a família.</p>
                </div>
                <div className="pc-row-action">
                  <button className="pc-btn pc-btn--danger" onClick={removePresence} disabled={deleteBusy}>
                    {deleteBusy ? <Loader2 className="pc-spin" size={14} /> : <Trash2 size={14} />} Apagar
                  </button>
                </div>
              </li>
              {errorRow('delete')}
            </ul>
          </section>
)}

          {show('members') && (
<section className="pc-appsection" id="members">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">Quem acompanha</h2>
              <p className="pc-sechead-line">A família vê as conversas. A cuidadora vê só o que ela precisa.</p>
            </div>
            <ul className="pc-list">
              {members.map((m) => (
                <li className="pc-row" key={m.id}>
                  <span className="pc-row-icon" aria-hidden="true"><Users /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">{ROLE_LABEL[m.role]}</p>
                    <p className="pc-row-line">{m.role === 'owner' ? 'Quem criou a Presença.' : `Entrou em ${new Date(m.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}.`}</p>
                  </div>
                  {m.role === 'owner' ? <span /> : (
                    <div className="pc-row-action">
                      <button className="pc-btn pc-btn--ghost" onClick={() => dropMember(m.user_id)}>Remover</button>
                    </div>
                  )}
                </li>
              ))}
              <li className="pc-row pc-row--plain dsh-form">
                <div className="dsh-form-actions">
                  <button className="pc-btn pc-btn--ghost" onClick={() => makeInvite('family')} disabled={inviteBusy !== null}>
                    {inviteBusy === 'family' ? <Loader2 className="pc-spin" size={14} /> : null} Convidar familiar
                  </button>
                  <button className="pc-btn pc-btn--ghost" onClick={() => makeInvite('companion')} disabled={inviteBusy !== null}>
                    {inviteBusy === 'companion' ? <Loader2 className="pc-spin" size={14} /> : null} Convidar cuidadora
                  </button>
                </div>
                {inviteLink ? (
                  <>
                    <p className="pc-row-title">{inviteLink.url}</p>
                    <p className="pc-row-line">{inviteLink.role === 'family' ? 'Convite de familiar.' : 'Convite de cuidadora.'} Vale sete dias, para uma pessoa.</p>
                    <div className="dsh-form-actions">
                      <a
                        className="pc-btn pc-btn--primary"
                        href={`https://wa.me/?text=${encodeURIComponent(`Quer acompanhar a ${name} comigo na Presença? Entre por este link: ${inviteLink.url}`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <BrandMark name="whatsapp" size={14} /> Mandar no WhatsApp
                      </a>
                      <button className="pc-btn pc-btn--ghost" onClick={copyInvite}>
                        {inviteCopied ? <Check size={14} /> : <Copy size={14} />} {inviteCopied ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </>
                ) : null}
                {errors.members ? <p className="dsh-detail" role="alert">{errors.members}</p> : null}
              </li>
            </ul>
          </section>
)}
          </>
          )}

                  </div>
      </div>
    </main>
  );
}
