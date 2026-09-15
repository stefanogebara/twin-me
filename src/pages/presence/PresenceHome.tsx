import { useCallback, useEffect, useState } from 'react';
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
  Plus,
  RefreshCw,
  Trash2,
  User,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  presenceAPI,
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
 *             a person, what came back, what you can say, who is who, the voice
 *
 * The readiness "knows" list was removed rather than restyled: the ledger
 * already states people, stories and voice, so the list repeated the page back
 * to itself. What is missing still shows, because that is actionable.
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
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

const VOICE_STATE: Record<string, string> = {
  queued: 'Building. Until then her calls use a standard voice.',
  samples_recorded: 'Samples recorded. Finish the voice step in setup.',
  failed: 'The last build failed. Record another sample in setup.',
  revoked: 'You removed it. Her calls use a standard voice.',
};

const NOTE_STATE: Record<PresenceNote['status'], string> = {
  queued: 'Waiting for her next call',
  delivered: 'Delivered',
  archived: 'Archived',
};

/** The sidebar: plain links, the current one underlined. */
const NAV = [
  { href: '#conversations', label: 'Conversations' },
  { href: '#notes', label: 'Notes' },
  { href: '#people', label: 'People' },
  { href: '#voice', label: 'Voice' },
];

export default function PresenceHome() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<PresenceOverview | null>(null);
  const [readiness, setReadiness] = useState<PresenceReadiness | null>(null);
  const [state, setState] = useState<'loading' | 'none' | 'ready'>('loading');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [askDrafts, setAskDrafts] = useState<Record<string, { relation: string; calledBy: string }>>({});
  const [askBusy, setAskBusy] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [openConv, setOpenConv] = useState<string | null>(null);
  const [convDetail, setConvDetail] = useState<Record<string, PresenceConversationDetail>>({});
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state === 'none') navigate('/presence/onboarding', { replace: true });
  }, [state, navigate]);

  const sidebar = (
    <aside className={`pc-side${menuOpen ? ' is-open' : ''}`} id="dsh-nav">
      <Link className="pc-side-brand" to="/presence" aria-label="Presence"><Mark /></Link>
      <nav className="pc-side-nav" aria-label="Her Presence">
        <Link className="pc-side-link" to="/presence/home" aria-current="page">Home</Link>
        {NAV.map((item) => (
          <a className="pc-side-link" href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>
        ))}
        <Link className="pc-side-link" to="/presence/onboarding">Setup</Link>
      </nav>
    </aside>
  );

  const topbar = (
    <div className="pc-topbar">
      <Link className="pc-side-brand" to="/presence" aria-label="Presence"><Mark /></Link>
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
            <p className="pc-empty dsh-loading">Loading her Presence</p>
          </div>
        </div>
      </main>
    );
  }

  const { presence, people, voice, notes, conversations, facts } = overview;
  const asks = facts.filter((f) => f.confidence === 'ask');
  const askName = (question: string) => (question.match(/Who is "(.+?)"\?/) || [])[1] || question;
  const name = presence.cared_for_name?.trim() || 'Your Presence';
  const callUrl = presence.call_token ? `${window.location.origin}/call/${presence.call_token}` : null;
  const queuedNotes = notes.filter((n) => n.status === 'queued');
  const needsYou = conversations.flatMap((c) => c.needs_family || []);
  const isReady = readiness?.ready ?? false;
  const voiceReady = voice?.status === 'ready';

  const voiceLine = voiceReady
    ? `Her calls use your voice${voice?.sample_count ? ` (${voice.sample_count} sample${voice.sample_count === 1 ? '' : 's'})` : ''}.`
    : (voice?.status && VOICE_STATE[voice.status]) || 'Her calls use a standard voice until you record yours.';

  /** The old plate's ledger, as the title's one grey line. Every part states a
   *  real count or says plainly that there is none. */
  const ledger = [
    conversations.length ? `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}` : 'No conversations yet',
    queuedNotes.length ? `${queuedNotes.length} note${queuedNotes.length === 1 ? '' : 's'} waiting` : null,
    people.length ? `${people.length} ${people.length === 1 ? 'person' : 'people'}` : 'No people yet',
    voiceReady ? 'your voice' : voice?.status === 'queued' ? 'voice building' : 'standard voice',
  ].filter(Boolean).join(' · ');

  async function rotateLink() {
    setLinkBusy(true);
    const result = await presenceAPI.createCallLink(presence.id);
    if (result?.call_path) await load();
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
    const draft = askDrafts[factId] || { relation: '', calledBy: '' };
    await presenceAPI.answerAsk(presence.id, factId, { action, relation: draft.relation, called_by: draft.calledBy });
    await load();
    setAskBusy(null);
  }

  async function removeVoice() {
    if (!window.confirm('Remove your cloned voice? Her calls will use a standard voice until you record again.')) return;
    setVoiceBusy(true);
    await presenceAPI.revokeVoice(presence.id);
    await load();
    setVoiceBusy(false);
  }

  /** Open one conversation and fetch its transcript once. */
  async function toggleConversation(conversationId: string) {
    if (openConv === conversationId) {
      setOpenConv(null);
      return;
    }
    setOpenConv(conversationId);
    if (convDetail[conversationId]) return;
    const result = await presenceAPI.conversation(presence.id, conversationId);
    if (result?.conversation) {
      setConvDetail((current) => ({ ...current, [conversationId]: result.conversation }));
    }
  }

  async function sendNote() {
    const body = noteDraft.trim();
    if (!body || noteSending) return;
    setNoteSending(true);
    const result = await presenceAPI.queueNote(presence.id, body);
    if (result) {
      setNoteDraft('');
      await load();
    }
    setNoteSending(false);
  }

  const linkLine = callUrl
    ? 'Ready for calls. Open it on her phone, or send it to whoever is with her.'
    : isReady
      ? 'Ready for calls. Make the link she will use.'
      : 'It unlocks once she knows enough for a first call.';

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
              <h2 className="pc-sechead-title">Her link</h2>
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
                      <p className="pc-row-line">One tap starts the conversation.</p>
                    </div>
                    <div className="pc-row-action">
                      <button className="pc-btn pc-btn--primary" onClick={copyLink}>
                        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </li>
                  <li className="pc-row">
                    <span className="pc-row-icon" aria-hidden="true"><RefreshCw /></span>
                    <div className="pc-row-text">
                      <p className="pc-row-title">Make a new link</p>
                      <p className="pc-row-line">The old one stops working.</p>
                    </div>
                    <div className="pc-row-action">
                      <button className="pc-btn pc-btn--ghost" onClick={rotateLink} disabled={linkBusy}>
                        {linkBusy ? <Loader2 className="pc-spin" size={14} /> : null} New link
                      </button>
                    </div>
                  </li>
                </>
              ) : isReady ? (
                <li className="pc-row">
                  <span className="pc-row-icon" aria-hidden="true"><Link2 /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">Her call link</p>
                    <p className="pc-row-line">One tap on it starts a conversation.</p>
                  </div>
                  <div className="pc-row-action">
                    <button className="pc-btn pc-btn--primary" onClick={rotateLink} disabled={linkBusy}>
                      {linkBusy ? <Loader2 className="pc-spin" size={14} /> : null} Create link
                    </button>
                  </div>
                </li>
              ) : (
                readiness && (
                  <>
                    <li className="pc-row">
                      <span className="pc-row-icon" aria-hidden="true"><Link2 /></span>
                      <div className="pc-row-text">
                        <p className="pc-row-title">Not ready yet</p>
                        <p className="pc-row-line">{readiness.score}% of what she needs</p>
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
                          <span className="pc-row-title">Tell her more</span>
                          <span className="pc-row-line">In setup, a couple of minutes.</span>
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
                <h2 className="pc-sechead-title">Who is this?</h2>
                <p className="pc-sechead-line">She mentioned someone new. The Presence never guesses.</p>
              </div>
              <ul className="pc-list">
                {asks.map((ask) => {
                  const who = askName(ask.question);
                  const draft = askDrafts[ask.id] || { relation: '', calledBy: '' };
                  return (
                    <li key={ask.id}>
                      <div className="pc-row pc-row--plain">
                        <div className="pc-row-text">
                          <p className="pc-row-title">Who is “{who}”?</p>
                          <p className="pc-row-line">Answer and they join her people.</p>
                        </div>
                        <span />
                      </div>
                      <div className="pc-subrow dsh-form">
                        <div className="dsh-form-fields">
                          <label className="pc-field">
                            <span className="pc-field-label">Relation to her</span>
                            <input
                              className="pc-input"
                              value={draft.relation}
                              placeholder="Daughter"
                              onChange={(e) => setAskDrafts((d) => ({ ...d, [ask.id]: { ...draft, relation: e.target.value } }))}
                            />
                          </label>
                          <label className="pc-field">
                            <span className="pc-field-label">She calls them</span>
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
                            Not now
                          </button>
                          <button className="pc-btn pc-btn--ghost" disabled={askBusy === ask.id} onClick={() => resolveAsk(ask.id, 'add')}>
                            {askBusy === ask.id ? <Loader2 className="pc-spin" size={14} /> : <Check size={14} />} Add to her people
                          </button>
                        </div>
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
                <h2 className="pc-sechead-title">Needs a person</h2>
                <p className="pc-sechead-line">Things only family can do.</p>
              </div>
              <ul className="pc-list">
                {needsYou.slice(0, 5).map((item, index) => (
                  <li className="pc-row" key={index}>
                    <span className="pc-row-icon" aria-hidden="true"><AlertCircle /></span>
                    <div className="pc-row-text">
                      <p className="pc-row-title">{item}</p>
                    </div>
                    <span />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="pc-appsection" id="conversations">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">Conversations</h2>
              <p className="pc-sechead-line">What came back from her calls.</p>
            </div>
            {conversations.length === 0 ? (
              <div className="pc-list">
                <p className="pc-empty">No calls yet. A short summary of each one lands here.</p>
              </div>
            ) : (
              <ul className="pc-list">
                {conversations.map((c: PresenceConversation) => {
                  const summary = c.summary || (c.status === 'recorded' ? 'Summarizing…' : 'No summary available.');
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
                              aria-label={open ? 'Hide the conversation' : `Read the conversation (${c.turn_count} turns)`}
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
                                <span className="dsh-who">{turn.role === 'user' ? name : 'Presence'}</span>
                                <p className="dsh-detail">{turn.content}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="pc-subrow">
                            <p className="pc-row-line">Loading the conversation…</p>
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
              <h2 className="pc-sechead-title">Notes for her</h2>
              <p className="pc-sechead-line">Read aloud on her next call, as coming from you.</p>
            </div>
            <ul className="pc-list">
              <li className="pc-row pc-row--plain dsh-form">
                <textarea
                  className="pc-input"
                  value={noteDraft}
                  placeholder="Tell her the baby said her name this morning."
                  onChange={(event) => setNoteDraft(event.target.value)}
                  aria-label="Note for the next conversation"
                />
                <div className="dsh-form-actions">
                  <button className="pc-btn pc-btn--ghost" onClick={sendNote} disabled={!noteDraft.trim() || noteSending}>
                    {noteSending ? <Loader2 className="pc-spin" size={14} /> : null} Queue note
                  </button>
                </div>
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
              <h2 className="pc-sechead-title">Her people</h2>
              <p className="pc-sechead-line">Who she talks about, and what she calls them.</p>
              <Link className="pc-iconbtn pc-sechead-add" to="/presence/onboarding" aria-label="Add people in setup">
                <Plus />
              </Link>
            </div>
            {people.length === 0 ? (
              <div className="pc-list">
                <p className="pc-empty">No people yet. Add them in setup.</p>
              </div>
            ) : (
              <ul className="pc-list">
                {people.map((p) => (
                  <li className="pc-row" key={p.id}>
                    <span className="pc-row-icon" aria-hidden="true"><User /></span>
                    <div className="pc-row-text">
                      <p className="pc-row-title">{p.name}</p>
                      <p className="pc-row-line">
                        {[p.relation, p.called_by ? `“${p.called_by}”` : ''].filter(Boolean).join(' · ') || 'No relation yet'}
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
              <h2 className="pc-sechead-title">Your voice</h2>
              <p className="pc-sechead-line">What her calls sound like.</p>
            </div>
            <ul className="pc-list">
              {voiceReady ? (
                <li className="pc-row">
                  <span className="pc-row-icon" aria-hidden="true"><Mic /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">Your voice</p>
                    <p className="pc-row-line">{voiceLine}</p>
                  </div>
                  <div className="pc-row-action">
                    <button className="pc-btn pc-btn--danger" onClick={removeVoice} disabled={voiceBusy}>
                      {voiceBusy ? <Loader2 className="pc-spin" size={14} /> : <Trash2 size={14} />} Remove
                    </button>
                  </div>
                </li>
              ) : (
                <li>
                  <Link className="pc-row pc-row--link" to="/presence/onboarding">
                    <span className="pc-row-icon" aria-hidden="true"><Mic /></span>
                    <span className="pc-row-text">
                      <span className="pc-row-title">{voice?.status === 'queued' ? 'Building your voice' : 'Standard voice'}</span>
                      <span className="pc-row-line">{voiceLine}</span>
                    </span>
                    <ChevronRight className="pc-chevron" aria-hidden="true" />
                  </Link>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
