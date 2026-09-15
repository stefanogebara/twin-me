import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Link2,
  Loader2,
  MessageCircle,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  User,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import {
  presenceAPI,
  PresenceApiError,
  type PresenceConversation,
  type PresenceNote,
  type PresenceConversationDetail,
  type PresenceOverview,
  type PresenceReadiness,
} from '@/services/api/presenceAPI';
import '@/styles/presence-cosmos.css';
import '@/styles/presence-home.css';

/**
 * /presence/home — the family's page, in the register (rows, not cards).
 *
 * Composition (see src/styles/presence-home.css for the reasoning):
 *   sidebar — plain links to the sections, and setup; a menu on phones
 *   title   — her name, and the old plate's ledger as one grey line
 *   column  — her link first (the page's one primary action), then what needs
 *             a person, what came back, what you can say, who is who, the
 *             voice, and last the settings (pause, delete)
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
const NAV = [
  { href: '#conversations', label: 'Conversas' },
  { href: '#notes', label: 'Recados' },
  { href: '#people', label: 'Pessoas' },
  { href: '#voice', label: 'Voz' },
  { href: '#settings', label: 'Configurações' },
];

export default function PresenceHome() {
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
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [openConv, setOpenConv] = useState<string | null>(null);
  const [convDetail, setConvDetail] = useState<Record<string, PresenceConversationDetail>>({});
  const [menuOpen, setMenuOpen] = useState(false);
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
      const [data, ready] = await Promise.all([
        presenceAPI.overview(mine.presence.id),
        presenceAPI.readiness(mine.presence.id),
      ]);
      if (data?.presence) {
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
        <Link className="pc-side-link" to="/presence/home" aria-current="page">Início</Link>
        {NAV.map((item) => (
          <a className="pc-side-link" href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>
        ))}
        <Link className="pc-side-link" to="/presence/onboarding">Sobre ela</Link>
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
              <p className="pc-empty dsh-loading">Carregando a Presença dela</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  const { presence, people, voice, notes, conversations, facts } = overview;
  const asks = facts.filter((f) => f.confidence === 'ask');
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

  const linkLine = paused
    ? 'As ligações estão pausadas. O link dela volta a funcionar quando você retomar.'
    : callUrl
      ? 'Pronta para as ligações. Abra no celular dela, ou mande para quem estiver com ela.'
      : isReady
        ? 'Pronta para as ligações. Crie o link que ela vai usar.'
        : 'O link abre quando ela souber o suficiente para a primeira conversa.';

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

          {asks.length > 0 && (
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

          {needsYou.length > 0 && (
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

          <section className="pc-appsection" id="voice">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">A sua voz</h2>
              <p className="pc-sechead-line">Como soam as ligações dela.</p>
            </div>
            {voiceReady ? (
              <ul className="pc-list">
                <li className="pc-row">
                  <span className="pc-row-icon" aria-hidden="true"><Mic /></span>
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
                  <p className="pc-row-line">Enquanto estiver pausada, o link dela não funciona.</p>
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
        </div>
      </div>
    </main>
  );
}
