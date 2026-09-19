/**
 * /presence/join/:token — an invite link, opened by the person it was sent to.
 *
 * ProtectedRoute has already made them sign in (and brought them back here).
 * The page accepts the invite once, says whose Presence they joined and as
 * what, and offers the one way on. A link that does not exist, was already
 * used, or expired says so and sends them back to whoever invited them.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { presenceAPI, PresenceApiError, type PresenceRole } from '@/services/api/presenceAPI';
import LedgerOrb from '@/components/LedgerOrb';
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

const ROLE_LINE: Record<PresenceRole, string> = {
  owner: 'Esta Presença já é sua.',
  family: 'Você vê as conversas dela, deixa recados e responde ao que ela pede.',
  companion: 'Você vê o que ela precisa e deixa recados. As conversas ficam com a família.',
};

type State =
  | { kind: 'joining' }
  | { kind: 'joined'; name: string; role: PresenceRole }
  | { kind: 'gone' }
  | { kind: 'used' }
  | { kind: 'failed' };

export default function PresenceJoinPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'joining' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const joined = await presenceAPI.join(token);
        if (!cancelled) setState({ kind: 'joined', name: joined.cared_for_name?.trim() || 'ela', role: joined.role });
      } catch (err) {
        if (cancelled) return;
        const status = err instanceof PresenceApiError ? err.status : 0;
        setState({ kind: status === 404 ? 'gone' : status === 410 ? 'used' : 'failed' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="presence-cosmos pc-app dsh" id="main-content">
      <div className="pc-shell">
        <div className="pc-topbar">
          <Link className="pc-side-brand" to="/presence" aria-label="Presença"><Mark /></Link>
        </div>
        {/* The shell is a two-column grid; the brand column keeps the page where the others sit. */}
        <aside className="pc-side" id="dsh-nav">
          <Link className="pc-side-brand" to="/presence" aria-label="Presença"><Mark /></Link>
        </aside>
        <div className="pc-col">
          {state.kind === 'joining' && (
            <div className="pc-loading" role="status" aria-live="polite">
              <LedgerOrb state="connecting" size={64} label="Entrando" />
              <p className="pc-empty">Entrando na Presença…</p>
            </div>
          )}

          {state.kind === 'joined' && (
            <header className="pc-apphead">
              <h1 className="pc-apphead-title">Você entrou na Presença de {state.name}.</h1>
              <p className="pc-apphead-line">{ROLE_LINE[state.role]}</p>
              <div className="dsh-form-actions">
                <Link className="pc-btn pc-btn--primary" to="/presence/home">Abrir a Presença dela</Link>
              </div>
            </header>
          )}

          {state.kind === 'gone' && (
            <header className="pc-apphead">
              <h1 className="pc-apphead-title">Este convite não existe.</h1>
              <p className="pc-apphead-line">Confira o link com quem convidou você.</p>
            </header>
          )}

          {state.kind === 'used' && (
            <header className="pc-apphead">
              <h1 className="pc-apphead-title">Este convite já foi usado ou venceu.</h1>
              <p className="pc-apphead-line">Peça um novo para quem convidou você. Cada link vale sete dias.</p>
            </header>
          )}

          {state.kind === 'failed' && (
            <header className="pc-apphead">
              <h1 className="pc-apphead-title">Não consegui entrar agora.</h1>
              <p className="pc-apphead-line">Espere um instante e abra o link de novo.</p>
            </header>
          )}
        </div>
      </div>
    </main>
  );
}
