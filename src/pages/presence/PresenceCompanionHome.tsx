/**
 * The companion's page: what the acompanhante or the cuidadora sees.
 *
 * She sees who the presence is for and when it calls, what needs a person from
 * the calls, and the notes; she can leave a note. The conversations stay with
 * the family: the server does not send them here (README 7.3), and the page
 * has nowhere to show them.
 */
import { useState } from 'react';
import { AlertCircle, Clock, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { presenceAPI, PresenceApiError, type CompanionOverview, type PresenceNote } from '@/services/api/presenceAPI';
import '@/styles/presence-cosmos.css';
import '@/styles/presence-home.css';

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

const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const NOTE_STATE: Record<PresenceNote['status'], string> = {
  queued: 'Esperando a próxima ligação dela',
  delivered: 'Entregue',
  archived: 'Arquivado',
};

function formatDays(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'todos os dias';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'de segunda a sexta';
  return [...set].sort((a, b) => a - b).map((d) => DAY_SHORT[d]).join(', ');
}

function whenLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

export default function PresenceCompanionHome({ overview, reload }: { overview: CompanionOverview; reload: () => Promise<void> }) {
  const { presence, notes, needs } = overview;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = presence.cared_for_name?.trim() || 'ela';
  const caller = presence.caller_name?.trim() || 'a família';
  const paused = presence.status === 'paused';

  const items = needs
    .flatMap((n) => (n.needs_family || []).map((item) => ({ item, urgent: n.urgency === 'high', when: n.created_at })))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent))
    .slice(0, 8);

  const sendNote = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      await presenceAPI.queueNote(presence.id, body);
      setDraft('');
      await reload();
    } catch (err) {
      setError(err instanceof PresenceApiError ? 'Não deu para deixar o recado. Tente de novo.' : 'Sem conexão. Tente de novo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="presence-cosmos pc-app dsh" id="main-content">
      <div className="pc-shell">
        <div className="pc-topbar">
          <Link className="pc-side-brand" to="/presence" aria-label="Presença"><Mark /></Link>
        </div>
        <aside className="pc-side" id="dsh-nav">
          <Link className="pc-side-brand" to="/presence" aria-label="Presença"><Mark /></Link>
          <nav className="pc-side-nav" aria-label="A Presença dela">
            <Link className="pc-side-link" to="/presence/home" aria-current="page">Início</Link>
            <a className="pc-side-link" href="#needs">Precisa de alguém</a>
            <a className="pc-side-link" href="#notes">Recados</a>
          </nav>
        </aside>

        <div className="pc-col">
          <header className="pc-apphead">
            <h1 className="pc-apphead-title">{name}</h1>
            <p className="pc-apphead-line">
              {paused ? 'Ligações pausadas' : `Ligações às ${String(presence.call_hour ?? 10).padStart(2, '0')}:00, ${formatDays(presence.call_days ?? [0, 1, 2, 3, 4, 5, 6])}`}
              {' · '}você acompanha com {caller}
            </p>
          </header>

          <section className="pc-appsection" id="needs">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">Precisa de alguém</h2>
              <p className="pc-sechead-line">O que ela disse nas ligações que uma pessoa precisa resolver.</p>
            </div>
            <ul className="pc-list">
              {items.length === 0 ? (
                <li className="pc-row pc-row--plain"><p className="pc-empty">Nada por enquanto.</p></li>
              ) : items.map((entry, index) => (
                <li className="pc-row" key={index}>
                  <span className="pc-row-icon" aria-hidden="true">{entry.urgent ? <AlertCircle /> : <Clock />}</span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">{entry.urgent ? <><span className="dsh-who">Urgente:</span> </> : null}{entry.item}</p>
                    <p className="pc-row-line">{whenLabel(entry.when)}</p>
                  </div>
                  <span />
                </li>
              ))}
            </ul>
          </section>

          <section className="pc-appsection" id="notes">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title">Recados para ela</h2>
              <p className="pc-sechead-line">Lidos em voz alta na próxima ligação.</p>
            </div>
            <ul className="pc-list">
              <li className="pc-row pc-row--plain dsh-form">
                <textarea
                  className="pc-input"
                  value={draft}
                  placeholder="Conte que ela almoçou bem hoje."
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Recado para a próxima conversa"
                />
                <div className="dsh-form-actions">
                  <button className="pc-btn pc-btn--ghost" onClick={sendNote} disabled={!draft.trim() || sending}>
                    {sending ? <Loader2 className="pc-spin" size={14} /> : null} Deixar recado
                  </button>
                </div>
                {error ? <p className="dsh-detail" role="alert">{error}</p> : null}
              </li>
              {notes.slice(0, 6).map((note) => (
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
        </div>
      </div>
    </main>
  );
}
