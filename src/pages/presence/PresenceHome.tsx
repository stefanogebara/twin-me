import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Copy, Link2, Loader2, RefreshCw, Trash2 } from 'lucide-react';
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
 * /presence/home — the family relay, in the room the rest of Presence is set in.
 *
 * Composition (see src/styles/presence-home.css for the reasoning):
 *   plate  — sticky: her name, the ledger of what she has, and the call link,
 *            which is the only dark action on the page
 *   spine  — one column, ordered by who has to act: what needs a person, then
 *            what came back, then what you can say, then what you rarely touch
 *
 * The readiness "knows" list was removed rather than restyled: the plate's fact
 * ledger already states people, stories and voice, so the list repeated the
 * page back to itself. What is missing still shows, because that is actionable.
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
  queued: 'Your voice build is queued. Until it is ready, calls use a warm standard voice.',
  samples_recorded: 'Samples recorded. Finish the voice step in setup to queue the build.',
  failed: 'The last voice build failed. Record another sample in setup to retry.',
  revoked: 'You removed your voice. Calls use a warm standard voice; record again anytime.',
};

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

  if (state !== 'ready' || !overview) {
    return (
      <main className="presence-cosmos dsh" id="main-content">
        <header className="dsh-nav">
          <Link className="dsh-nav-brand" to="/presence" aria-label="Presence home"><Mark /></Link>
          <span />
          <span />
        </header>
        <p className="dsh-loading">Opening the room</p>
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

  const voiceLine = voice?.status === 'ready'
    ? `Your cloned voice is live on her calls${voice.sample_count ? ` (${voice.sample_count} sample${voice.sample_count === 1 ? '' : 's'})` : ''}. Add samples in setup to improve it.`
    : (voice?.status && VOICE_STATE[voice.status]) || 'No voice recorded yet — calls use a warm standard voice. Record yours in setup.';

  /** The plate's ledger. Every line states a real count or says plainly that
   *  there is none; nothing here is a placeholder pretending to be data. */
  const plateFacts = [
    { k: 'Conversations', v: conversations.length ? String(conversations.length) : '', empty: 'none yet' },
    { k: 'Notes waiting', v: queuedNotes.length ? String(queuedNotes.length) : '', empty: 'none' },
    { k: 'Her people', v: people.length ? `${people.length} named` : '', empty: 'none yet' },
    {
      k: 'Voice',
      v: voice?.status === 'ready' ? 'Yours' : voice?.status === 'queued' ? 'Building' : '',
      empty: 'standard',
    },
  ];

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

  return (
    <main className="presence-cosmos dsh" id="main-content">
      <header className="dsh-nav">
        <Link className="dsh-nav-brand" to="/presence" aria-label="Presence home"><Mark /></Link>
        <p className="dsh-nav-here">Family relay</p>
        <Link className="dsh-exit" to="/presence/onboarding">Edit setup</Link>
      </header>

      <div className="dsh-frame">
        <aside className="dsh-plate">
          <div>
            <p className="dsh-plate-eyebrow">Her Presence</p>
            <h1 className="dsh-plate-name">{name}</h1>
          </div>

          <dl className="dsh-facts">
            {plateFacts.map((f) => (
              <div className="dsh-fact" key={f.k}>
                <dt>{f.k}</dt>
                <dd className={f.v ? undefined : 'is-empty'}>{f.v || f.empty}</dd>
              </div>
            ))}
          </dl>

          <div className="dsh-link">
            {callUrl ? (
              <>
                <span className="dsh-link-url">{callUrl}</span>
                <div className="dsh-link-row">
                  <button className="pc-btn pc-btn--primary" onClick={copyLink}>
                    {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy her link'}
                  </button>
                  <button className="pc-btn pc-btn--ghost" onClick={rotateLink} disabled={linkBusy}>
                    {linkBusy ? <Loader2 className="pc-spin" size={16} /> : <RefreshCw size={16} />} New link
                  </button>
                </div>
                <p className="dsh-note">Open it on her phone or tablet, or send it to whoever is with her. One tap starts the conversation.</p>
              </>
            ) : isReady ? (
              <>
                <p className="dsh-note">Create the link she will use to talk with your Presence.</p>
                <button className="pc-btn pc-btn--primary" onClick={rotateLink} disabled={linkBusy}>
                  {linkBusy ? <Loader2 className="pc-spin" size={16} /> : <Link2 size={16} />} Create her call link
                </button>
              </>
            ) : (
              <p className="dsh-note">
                The link unlocks once she knows enough for a real first conversation. It takes a couple of minutes.
              </p>
            )}
          </div>

          {readiness && (
            <>
              <p className={`dsh-plate-foot${readiness.ready ? ' is-live' : ''}`}>
                <span className="tick" aria-hidden="true" />
                {readiness.ready ? 'Ready for calls' : 'Not ready yet'} · {readiness.score}% context
              </p>
              {!readiness.ready && readiness.missing.length > 0 && (
                <div className="dsh-link">
                  <ul className="dsh-needs">
                    {readiness.missing.map((line, index) => (
                      <li className="dsh-need" key={`m${index}`}>
                        <ArrowRight size={15} aria-hidden="true" /> {line}
                      </li>
                    ))}
                  </ul>
                  <Link className="pc-btn pc-btn--ghost" to="/presence/onboarding">
                    Tell her more in setup <ArrowRight size={16} />
                  </Link>
                </div>
              )}
            </>
          )}
        </aside>

        <div className="dsh-spine">
          {asks.length > 0 && (
            <section className="dsh-sec">
              <h2 className="dsh-h">She mentioned someone I don't <em>know</em></h2>
              <div className="dsh-card dsh-card--asks">
                <p className="dsh-sub">Answer in a few words and they join her family map. The Presence never guesses who people are.</p>
                {asks.map((ask) => {
                  const who = askName(ask.question);
                  const draft = askDrafts[ask.id] || { relation: '', calledBy: '' };
                  return (
                    <div className="dsh-ask" key={ask.id}>
                      <p className="dsh-ask-q">Who is “{who}”?</p>
                      <div className="dsh-two">
                        <label className="dsh-field">
                          <span className="lab">Relation to her</span>
                          <input
                            className="dsh-input"
                            value={draft.relation}
                            placeholder="Daughter"
                            onChange={(e) => setAskDrafts((d) => ({ ...d, [ask.id]: { ...draft, relation: e.target.value } }))}
                          />
                        </label>
                        <label className="dsh-field">
                          <span className="lab">She calls them</span>
                          <input
                            className="dsh-input"
                            value={draft.calledBy}
                            placeholder={who}
                            onChange={(e) => setAskDrafts((d) => ({ ...d, [ask.id]: { ...draft, calledBy: e.target.value } }))}
                          />
                        </label>
                      </div>
                      <div className="dsh-actions">
                        <button className="pc-btn pc-btn--ghost" disabled={askBusy === ask.id} onClick={() => resolveAsk(ask.id, 'add')}>
                          {askBusy === ask.id ? <Loader2 className="pc-spin" size={16} /> : <Check size={16} />} Add to her people
                        </button>
                        <button className="pc-btn pc-btn--ghost" disabled={askBusy === ask.id} onClick={() => resolveAsk(ask.id, 'dismiss')}>
                          Not now
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {needsYou.length > 0 && (
            <section className="dsh-sec">
              <h2 className="dsh-h">This needs a <em>person</em></h2>
              <div className="dsh-card">
                <ul className="dsh-needs">
                  {needsYou.slice(0, 5).map((item, index) => (
                    <li className="dsh-need" key={index}>
                      <ArrowRight size={15} aria-hidden="true" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section className="dsh-sec">
            <h2 className="dsh-h">What came <em>back</em></h2>
            <div className="dsh-card">
              {conversations.length === 0 ? (
                <p className="dsh-empty">
                  Nothing here yet. When she talks with the Presence, a short summary lands here — and anything
                  that needs a real person is pulled out on top.
                </p>
              ) : (
                conversations.map((c: PresenceConversation) => (
                  <article className="dsh-conv" key={c.id}>
                    <p className="dsh-conv-meta">
                      <span>{formatWhen(c.started_at)}</span>
                      <span className="sep" aria-hidden="true">·</span>
                      <span>{formatDuration(c.duration_seconds)}</span>
                      <span className="sep" aria-hidden="true">·</span>
                      <span>{c.turn_count} turns</span>
                    </p>
                    <p className="dsh-conv-sum">{c.summary || (c.status === 'recorded' ? 'Summarizing…' : 'No summary available.')}</p>
                    {(c.needs_family || []).length > 0 && (
                      <ul className="dsh-needs">
                        {(c.needs_family || []).map((item, index) => (
                          <li className="dsh-need" key={index}>
                            <ArrowRight size={15} aria-hidden="true" /> {item}
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.turn_count > 0 && (
                      <button className="dsh-conv-toggle" onClick={() => toggleConversation(c.id)} aria-expanded={openConv === c.id}>
                        {openConv === c.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        <span>{openConv === c.id ? 'Hide the conversation' : 'Read the conversation'}</span>
                      </button>
                    )}
                    {openConv === c.id && (
                      convDetail[c.id] ? (
                        <div className="dsh-transcript">
                          {convDetail[c.id].transcript.map((turn, index) => (
                            <div className={`dsh-turn${turn.role === 'assistant' ? ' is-ai' : ''}`} key={index}>
                              <span className="who">{turn.role === 'user' ? name : 'Presence'}</span>
                              <p>{turn.content}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="dsh-empty">Loading the conversation…</p>
                      )
                    )}
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="dsh-sec">
            <h2 className="dsh-h">Say something into her next <em>conversation</em></h2>
            <div className="dsh-card">
              <textarea
                className="dsh-textarea"
                value={noteDraft}
                placeholder="Tell her the baby said her name this morning."
                onChange={(event) => setNoteDraft(event.target.value)}
                aria-label="Note for the next conversation"
              />
              <div className="dsh-actions">
                <button className="pc-btn pc-btn--ghost" onClick={sendNote} disabled={!noteDraft.trim() || noteSending}>
                  {noteSending ? <Loader2 className="pc-spin" size={16} /> : null} Queue note
                </button>
                <span className="dsh-empty">Read aloud as coming from you, never rewritten.</span>
              </div>
              {notes.length > 0 && (
                <ul className="dsh-rows">
                  {notes.slice(0, 6).map((note: PresenceNote) => (
                    <li className={`dsh-row${note.status !== 'queued' ? ' is-done' : ''}`} key={note.id}>
                      <span>{note.body}</span>
                      <span className="dsh-tag">{note.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <div className="dsh-two">
            <section className="dsh-sec">
              <h2 className="dsh-h">Who is <em>who</em></h2>
              <div className="dsh-card dsh-card--quiet">
                {people.length === 0 ? (
                  <p className="dsh-empty">No people yet — add them in setup so she is never confused.</p>
                ) : (
                  <ul className="dsh-rows">
                    {people.map((p) => (
                      <li className="dsh-row" key={p.id}>
                        <span>{p.name}{p.relation ? ` · ${p.relation}` : ''}</span>
                        <span className="dsh-tag dsh-tag--name">{p.called_by || '—'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="dsh-sec">
              <h2 className="dsh-h">Your <em>voice</em></h2>
              <div className="dsh-card dsh-card--quiet">
                <p className="dsh-empty">{voiceLine}</p>
                {voice?.status === 'ready' && (
                  <button className="pc-btn pc-btn--ghost" style={{ justifySelf: 'start' }} onClick={removeVoice} disabled={voiceBusy}>
                    {voiceBusy ? <Loader2 className="pc-spin" size={16} /> : <Trash2 size={16} />} Remove my voice
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
