import React, { useMemo, useState } from 'react';
import { ArrowUp, Check, ChevronDown } from 'lucide-react';
import { DOMAIN_HUE, DOMAIN_LABEL, SOURCE_LABEL, type PortraitData, type Reading, type Verdict } from '../../data/demoPortrait';
import { deriveState, supportLine, groupReadings, daysSince, findScripted, type ReadingState } from '../../lib/portrait';
import '../../styles/presence-cosmos.css';

/**
 * The Portrait: the product's one page, in Cosmos. Three bands (today's question, the
 * signature, the ledger of readings with evidence and verdicts), Ask pinned above, the
 * Sources strip at the foot. Spec: .claude/plans/2026-09-03-portrait/README.md.
 *
 * Verdicts and the question's answer are local state here: this page renders a static
 * export. The product wires the same props to the API.
 */

const STATE_LABEL: Record<ReadingState, string> = {
  new: 'New this week', standing: 'Standing', fading: 'Fading', disputed: 'Disputed',
};

function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" /><circle cx="14" cy="5" r="2.7" /><circle cx="23" cy="5" r="2.7" /><circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" /><circle cx="14" cy="23" r="2.7" /><circle cx="5" cy="23" r="2.7" /><circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

function ReadingRow({ reading, now, verdict, onVerdict, open, onToggle, lit }: {
  reading: Reading; now: Date; verdict: Verdict; onVerdict: (v: Verdict) => void; open: boolean; onToggle: () => void; lit: boolean;
}) {
  const state = deriveState({ ...reading, verdict }, now);
  const age = daysSince(reading.supportedAt, now);
  return (
    <article className={`pc-pt-row ${open ? 'is-open' : ''} ${lit ? 'is-lit' : ''}`} id={`reading-${reading.id}`}>
      <button type="button" className="pc-pt-row-head" onClick={onToggle} aria-expanded={open}>
        <i style={{ background: DOMAIN_HUE[reading.domain] }} aria-hidden="true" />
        <p>{reading.text}</p>
        <span>{supportLine(reading)}{state === 'fading' ? ` · last supported ${age} days ago` : ''}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="pc-pt-row-body">
          <div className="pc-demo-log" aria-label="Evidence">
            {reading.evidence.map((e, i) => (
              <div key={i} className="pc-demo-row is-in">
                <span>{SOURCE_LABEL[e.source] ?? e.source} · {e.at}</span>
                <p>{e.event}</p>
              </div>
            ))}
          </div>
          <div className="pc-pt-verdict" role="group" aria-label="Your verdict">
            <small>{verdict ? 'Your verdict' : 'Not yet reviewed'}</small>
            {(['true', 'partly', 'wrong'] as const).map((v) => (
              <button key={v} type="button" className={`pc-btn pc-btn--ghost ${verdict === v ? 'is-active' : ''}`} onClick={() => onVerdict(verdict === v ? null : v)}>
                {verdict === v ? <Check size={14} /> : null}{v === 'true' ? 'True' : v === 'partly' ? 'Partly' : 'Wrong'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function PortraitPage({ data, now, banner }: { data: PortraitData; now: Date; banner?: React.ReactNode }) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(() => Object.fromEntries(data.readings.map((r) => [r.id, r.verdict])));
  const [open, setOpen] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(data.question.yourAnswer);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState<{ a: string; cites: string[] } | null>(null);
  const [lit, setLit] = useState<string[]>([]);

  const readings = useMemo(() => data.readings.map((r) => ({ ...r, verdict: verdicts[r.id] ?? null })), [data.readings, verdicts]);
  const groups = useMemo(() => groupReadings(readings, now), [readings, now]);
  const sourceCount = data.sources.length;

  function ask(q: string) {
    const hit = findScripted(data.ask, q);
    if (!hit) {
      setReply({ a: `I do not know that yet. Nothing in the ${sourceCount} sources I read supports an answer.`, cites: [] });
      setLit([]);
      return;
    }
    setReply({ a: hit.a, cites: hit.cites });
    setLit(hit.cites);
    setOpen(hit.cites[0]);
    document.getElementById(`reading-${hit.cites[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <main className="presence-cosmos pc-portrait" id="main-content">
      {banner}
      <header className="pc-pt-nav">
        <Mark />
        <nav aria-label="Portrait"><a href="#portrait" className="is-active">Portrait</a><a href="#ask">Ask</a><a href="#sources">Sources</a></nav>
      </header>

      <section className="pc-pt-ask" id="ask" aria-label="Ask your twin">
        <form className="pc-search" onSubmit={(e) => { e.preventDefault(); ask(query); }}>
          <label className="pc-search-field">
            <input className="pc-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask your twin. It answers with what it read." aria-label="Ask your twin" />
          </label>
          <button type="submit" className="pc-search-icons" aria-label="Ask"><ArrowUp size={18} /></button>
        </form>
        <div className="pc-pt-ask-hints">
          {data.ask.map((s) => <button key={s.q} type="button" onClick={() => { setQuery(s.q); ask(s.q); }}>{s.q}</button>)}
        </div>
      </section>
      {reply ? (
        <section className="pc-pt-reply" aria-live="polite">
          <div className="pc-demo-answer is-in">
            <span>Your twin</span>
            <p>{reply.a}</p>
            {reply.cites.length ? (
              <div className="pc-demo-chips is-in">
                {reply.cites.map((id) => <b key={id}>Reading {id.replace('r', '')}</b>)}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="pc-pt-question" aria-labelledby="pc-pt-q-title">
        <p className="pc-spec-n">Today's question</p>
        <p className="pc-pt-evidence-line">{data.question.evidenceLine}</p>
        <h2 id="pc-pt-q-title">{data.question.question}</h2>
        {answer ? (
          <p className="pc-pt-answered"><Check size={14} /> In your words: {answer}. Saved as the heaviest memory of the day.</p>
        ) : (
          <div className="pc-pt-answers">
            {data.question.answers.map((a) => <button key={a} type="button" className="pc-btn pc-btn--primary" onClick={() => setAnswer(a)}>{a}</button>)}
            <button type="button" className="pc-btn pc-btn--canvas" onClick={() => setAnswer('skipped')}>Skip</button>
          </div>
        )}
      </section>

      <section className="pc-pt-signature" id="portrait" aria-labelledby="pc-pt-sig-title">
        <h1 id="pc-pt-sig-title">{data.owner}'s signature.</h1>
        <ol>
          {data.signature.map((s) => {
            const from = readings.filter((r) => s.from.includes(r.id) && deriveState(r, now) !== 'disputed');
            const sources = new Set(from.flatMap((r) => r.evidence.map((e) => e.source))).size;
            return (
              <li key={s.domain}>
                <i style={{ background: DOMAIN_HUE[s.domain] }} aria-hidden="true" />
                <div>
                  <p>{s.line}</p>
                  <small>{DOMAIN_LABEL[s.domain]} · from {from.length} reading{from.length === 1 ? '' : 's'}, {sources} source{sources === 1 ? '' : 's'}</small>
                  <span>{s.from.map((id) => <a key={id} href={`#reading-${id}`} onClick={() => setOpen(id)}>{id.replace('r', '#')}</a>)}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="pc-pt-ledger" aria-labelledby="pc-pt-ledger-title">
        <h2 id="pc-pt-ledger-title" className="pc-h2 pc-h2--sm">The readings.</h2>
        {groups.map((g) => (
          <div key={g.state} className="pc-pt-group">
            <p className="pc-spec-n">{STATE_LABEL[g.state]} · {g.readings.length}</p>
            {g.readings.map((r) => (
              <ReadingRow key={r.id} reading={r} now={now} verdict={verdicts[r.id] ?? null}
                onVerdict={(v) => setVerdicts((s) => ({ ...s, [r.id]: v }))}
                open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} lit={lit.includes(r.id)} />
            ))}
          </div>
        ))}
      </section>

      <section className="pc-pt-sources" id="sources" aria-labelledby="pc-pt-src-title">
        <h2 id="pc-pt-src-title" className="pc-h2 pc-h2--sm">Sources.</h2>
        <div className="pc-pt-source-list">
          {data.sources.map((s) => (
            <div key={s.platform} className="pc-pt-source">
              <strong>{s.label}</strong>
              <span>{s.read} · since {s.since}</span>
              <small>{s.kinds}</small>
              <em>Read only</em>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default PortraitPage;
