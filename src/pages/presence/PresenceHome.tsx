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

/**
 * /presence/home — the family dashboard.
 *
 * One screen, four jobs: share/rotate the call link, send notes into the next
 * conversation, read what came back (summaries + "needs you" items), and see the
 * state of the family map and voice. Cosmos vocabulary throughout; empty states
 * are honest about what has and hasn't happened yet.
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
      <main className="presence-cosmos pc-ob" id="main-content">
        <header className="pc-ob-nav">
          <Link className="pc-brand" to="/presence"><Mark /></Link>
          <span />
          <span />
        </header>
        <section className="pc-ob-stage"><p className="pc-ob-sub">Loading…</p></section>
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
    <main className="presence-cosmos pc-ob" id="main-content">
      <header className="pc-ob-nav">
        <Link className="pc-brand" to="/presence" aria-label="Presence home"><Mark /></Link>
        <span className="pc-ob-eyebrow">Family relay</span>
        <Link className="pc-ob-exit" to="/presence/onboarding">Edit setup</Link>
      </header>

      <div className="pc-dash">
        <div className="pc-dash-head">
          <h1>{name}.</h1>
          <p>
            {conversations.length === 0
              ? 'No conversations yet — share the call link with her to start.'
              : `${conversations.length} conversation${conversations.length > 1 ? 's' : ''} · ${queuedNotes.length} note${queuedNotes.length === 1 ? '' : 's'} waiting for the next one`}
            {voice?.status === 'queued' ? ' · voice build queued' : ''}
          </p>
        </div>

        {readiness && (
          <div className="pc-ob-card is-wide" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <h2>What she knows</h2>
              <span className="pc-ob-tag">{readiness.ready ? 'Ready for calls' : 'Not ready yet'} · {readiness.score}% context</span>
            </div>
            {readiness.knows.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {readiness.knows.map((line, index) => (
                  <div className="pc-dash-empty" style={{ color: 'var(--c-ink)', display: 'flex', gap: 8 }} key={`k${index}`}><Check size={16} /> {line}</div>
                ))}
              </div>
            )}
            {readiness.missing.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {readiness.missing.map((line, index) => (
                  <div className="pc-dash-empty" style={{ display: 'flex', gap: 8 }} key={`m${index}`}><ArrowRight size={16} /> {line}</div>
                ))}
              </div>
            )}
            {!readiness.ready && (
              <Link className="pc-btn pc-btn--primary" style={{ justifySelf: 'start' }} to="/presence/onboarding">
                Tell her more in setup <ArrowRight size={16} />
              </Link>
            )}
          </div>
        )}

        {asks.length > 0 && (
          <div className="pc-ob-card is-wide" style={{ display: 'grid', gap: 14 }}>
            <h2>She mentioned someone I don't know</h2>
            <p className="pc-dash-empty">Answer in a few words and they join her family map. The Presence never guesses who people are.</p>
            {asks.map((ask) => {
              const name = askName(ask.question);
              const draft = askDrafts[ask.id] || { relation: '', calledBy: '' };
              return (
                <div className="pc-ob-card" key={ask.id} style={{ background: 'var(--c-paper)', display: 'grid', gap: 12 }}>
                  <p style={{ fontSize: 17, fontWeight: 500 }}>Who is “{name}”?</p>
                  <div className="pc-ob-grid">
                    <label className="pc-ob-field">
                      <span>Relation to her</span>
                      <input value={draft.relation} placeholder="Daughter" onChange={(e) => setAskDrafts((d) => ({ ...d, [ask.id]: { ...draft, relation: e.target.value } }))} />
                    </label>
                    <label className="pc-ob-field">
                      <span>She calls them</span>
                      <input value={draft.calledBy} placeholder={name} onChange={(e) => setAskDrafts((d) => ({ ...d, [ask.id]: { ...draft, calledBy: e.target.value } }))} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="pc-btn pc-btn--primary" disabled={askBusy === ask.id} onClick={() => resolveAsk(ask.id, 'add')}>
                      {askBusy === ask.id ? <Loader2 className="pc-spin" size={16} /> : <Check size={16} />} Add to her people
                    </button>
                    <button className="pc-btn pc-btn--ghost" disabled={askBusy === ask.id} onClick={() => resolveAsk(ask.id, 'dismiss')}>Not now</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {needsYou.length > 0 && (
          <div className="pc-ob-card is-wide" style={{ display: 'grid', gap: 10 }}>
            <h2>Needs you</h2>
            {needsYou.slice(0, 5).map((item, index) => (
              <span className="pc-need" key={index}><ArrowRight size={15} /> {item}</span>
            ))}
          </div>
        )}

        <div className="pc-dash-grid">
          <div className="pc-ob-card">
            <h2>Her call link</h2>
            {callUrl ? (
              <>
                <div className="pc-dash-link-row">
                  <span className="pc-dash-token" title={callUrl}>{callUrl}</span>
                  <button className="pc-btn pc-btn--primary" onClick={copyLink}>
                    {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="pc-dash-empty">
                  Open it on her phone or tablet, or send it to whoever is with her. One tap starts the conversation.
                </p>
                <button className="pc-btn pc-btn--ghost" onClick={rotateLink} disabled={linkBusy} style={{ justifySelf: 'start' }}>
                  {linkBusy ? <Loader2 className="pc-spin" size={16} /> : <RefreshCw size={16} />} New link
                </button>
              </>
            ) : isReady ? (
              <>
                <p className="pc-dash-empty">Create the link she will use to talk with your Presence.</p>
                <button className="pc-btn pc-btn--primary" onClick={rotateLink} disabled={linkBusy} style={{ justifySelf: 'start' }}>
                  {linkBusy ? <Loader2 className="pc-spin" size={16} /> : <Link2 size={16} />} Create call link
                </button>
              </>
            ) : (
              <p className="pc-dash-empty">
                The link unlocks once she knows enough for a real first conversation — see “What she knows” above. It takes a couple of minutes.
              </p>
            )}
          </div>

          <div className="pc-ob-card">
            <h2>Send a note into her next conversation</h2>
            <textarea
              className="pc-ob-textarea"
              style={{ minHeight: 88 }}
              value={noteDraft}
              placeholder="Tell her the baby said her name this morning."
              onChange={(event) => setNoteDraft(event.target.value)}
              aria-label="Note for the next conversation"
            />
            <div className="pc-dash-compose-foot">
              <span className="pc-dash-empty">Read aloud as coming from you, never rewritten.</span>
              <button className="pc-btn pc-btn--primary" onClick={sendNote} disabled={!noteDraft.trim() || noteSending}>
                {noteSending ? <Loader2 className="pc-spin" size={16} /> : null} Queue note
              </button>
            </div>
            {notes.length > 0 && (
              <div>
                {notes.slice(0, 6).map((note: PresenceNote) => (
                  <div className={`pc-note-row ${note.status !== 'queued' ? 'is-delivered' : ''}`} key={note.id}>
                    <span>{note.body}</span>
                    <span className="pc-ob-tag">{note.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pc-ob-card is-wide">
            <h2>Conversations</h2>
            {conversations.length === 0 ? (
              <p className="pc-dash-empty">
                Nothing here yet. When she talks with the Presence, a short summary lands here — and
                anything that needs a real person is pulled out on top.
              </p>
            ) : (
              conversations.map((c: PresenceConversation) => (
                <div className="pc-conv" key={c.id}>
                  <div className="pc-conv-meta">
                    <span>{formatWhen(c.started_at)}</span>
                    <span>{formatDuration(c.duration_seconds)} · {c.turn_count} turns</span>
                  </div>
                  <p>{c.summary || (c.status === 'recorded' ? 'Summarizing…' : 'No summary available.')}</p>
                  {(c.needs_family || []).map((item, index) => (
                    <span className="pc-need" key={index}><ArrowRight size={15} /> {item}</span>
                  ))}
                  {c.turn_count > 0 && (
                    <button className="pc-conv-toggle" onClick={() => toggleConversation(c.id)} aria-expanded={openConv === c.id}>
                      {openConv === c.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      {openConv === c.id ? 'Hide the conversation' : 'Read the conversation'}
                    </button>
                  )}
                  {openConv === c.id && (
                    convDetail[c.id] ? (
                      <div className="pc-transcript-read">
                        {convDetail[c.id].transcript.map((turn, index) => (
                          <div className={turn.role === 'assistant' ? 'is-ai' : ''} key={index}>
                            <span>{turn.role === 'user' ? name : 'Presence'}</span>
                            <p>{turn.content}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="pc-dash-empty">Loading the conversation…</p>
                    )
                  )}
                </div>
              ))
            )}
          </div>

          <div className="pc-ob-card">
            <h2>Who is who</h2>
            {people.length === 0 ? (
              <p className="pc-dash-empty">No people yet — add them in setup so she is never confused.</p>
            ) : (
              people.map((p) => (
                <div className="pc-note-row" key={p.id}>
                  <span>{p.name}{p.relation ? ` · ${p.relation}` : ''}</span>
                  <span className="pc-ob-tag">{p.called_by || '—'}</span>
                </div>
              ))
            )}
          </div>

          <div className="pc-ob-card">
            <h2>Voice</h2>
            <p className="pc-dash-empty">
              {voice?.status === 'queued' && 'Your voice build is queued. Until it is ready, calls use a warm standard voice.'}
              {voice?.status === 'samples_recorded' && 'Samples recorded. Finish the voice step in setup to queue the build.'}
              {voice?.status === 'ready' && `Your cloned voice is live on her calls${voice.sample_count ? ` (${voice.sample_count} sample${voice.sample_count === 1 ? '' : 's'})` : ''}. Add samples in setup to improve it.`}
              {voice?.status === 'failed' && 'The last voice build failed. Record another sample in setup to retry.'}
              {voice?.status === 'revoked' && 'You removed your voice. Calls use a warm standard voice; record again anytime.'}
              {!voice && 'No voice recorded yet — calls use a warm standard voice. Record yours in setup.'}
            </p>
            {voice?.status === 'ready' && (
              <button className="pc-btn pc-btn--ghost" style={{ justifySelf: 'start' }} onClick={removeVoice} disabled={voiceBusy}>
                {voiceBusy ? <Loader2 className="pc-spin" size={16} /> : <Trash2 size={16} />} Remove my voice
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
