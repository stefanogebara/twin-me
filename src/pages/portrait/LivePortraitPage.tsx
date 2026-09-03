import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '@/services/api/apiBase';
import { toPortraitData } from '@/lib/portraitLive';
import type { PortraitData, Verdict } from '@/data/demoPortrait';
import { PortraitPage } from './PortraitPage';
import '@/styles/presence-cosmos.css';

/**
 * /portrait: the signed-in person's Portrait, from /api/portrait. Verdicts and today's
 * answer post back; the page updates first and the API follows. Ask goes to
 * /api/portrait/ask, which answers from the readings only and returns what it cites.
 */

type State = { status: 'loading' } | { status: 'ready'; data: PortraitData } | { status: 'error'; message: string };

export default function LivePortraitPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Your Portrait · TwinMe';
    return () => { document.title = previousTitle; };
  }, []);

  async function load() {
    const res = await authFetch('/portrait');
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(typeof json?.error === 'string' ? json.error : 'Could not load your Portrait.');
    return toPortraitData(json.data);
  }

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => { if (!cancelled) setState({ status: 'ready', data }); })
      .catch((err) => { if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load your Portrait.' }); });
    return () => { cancelled = true; };
  }, []);

  async function onDeleteSource(platform: string) {
    await authFetch(`/portrait/sources/${encodeURIComponent(platform)}`, { method: 'DELETE' });
    const data = await load().catch(() => null);
    if (data) setState({ status: 'ready', data });
  }

  async function onVerdict(readingId: string, verdict: Verdict) {
    await authFetch(`/portrait/readings/${encodeURIComponent(readingId)}/verdict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verdict }),
    }).catch(() => undefined);
  }

  async function onAnswer(readingIds: string[], answer: string) {
    await authFetch('/portrait/question/answer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ readingIds, answer }),
    }).catch(() => undefined);
  }

  async function onAsk(question: string) {
    const res = await authFetch('/portrait/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 429) return { a: typeof json?.error === 'string' ? json.error : 'That is enough questions for today.', cites: [] };
    if (!res.ok || !json?.success) throw new Error('ask failed');
    const cites = Array.isArray(json.data?.cites) ? json.data.cites.filter((c: unknown): c is string => typeof c === 'string') : [];
    return { a: typeof json.data?.a === 'string' ? json.data.a : '', cites };
  }

  if (state.status === 'loading') {
    return <main className="presence-cosmos pc-portrait pc-pt-empty" id="main-content"><p>Reading what you did.</p></main>;
  }
  if (state.status === 'error') {
    return (
      <main className="presence-cosmos pc-portrait pc-pt-empty" id="main-content">
        <p>{state.message}</p>
        <Link className="pc-btn pc-btn--ghost" to="/today">Back</Link>
      </main>
    );
  }
  if (state.data.readings.length === 0) {
    return (
      <main className="presence-cosmos pc-portrait pc-pt-empty" id="main-content">
        <h1>Nothing to read yet.</h1>
        <p>A reading needs at least two real events behind it. Connect a source and give it a few days.</p>
        <Link className="pc-btn pc-btn--primary" to="/connect">Connect a source</Link>
      </main>
    );
  }
  return <PortraitPage data={state.data} now={new Date()} onVerdict={onVerdict} onAnswer={onAnswer} onAsk={onAsk} onDeleteSource={onDeleteSource} />;
}
