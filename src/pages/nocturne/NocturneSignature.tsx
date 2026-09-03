import { NocturneProduct, LiveReadings, LayerBars } from './NocturneProduct';

/** /nocturne/signature — the Soul Signature product page. */
const NocturneSignature = () => (
  <NocturneProduct
    tint="iris"
    plate="/images/nocturne/sig-iris.jpg"
    badge="Private beta — invite only"
    display={<><em>Read</em> yourself.</>}
    lead="Your soul signature, built from evidence."
    body="Five experts read your data from five directions and write one portrait — with every claim traceable to the thing that produced it."
    promptPlaceholder="Why do I work best after midnight?"
    sections={[
      {
        eyebrow: '01 — The evidence',
        display: <>It <em>notices</em>.</>,
        lead: 'Observations, not summaries.',
        body: 'Each reading names its source and its moment. Nothing is asserted that cannot be traced.',
        demo: (
          <LiveReadings
            items={[
              { source: 'SPOTIFY · 23:41 · REPEAT ×4', statement: 'You loop the same three songs when a deadline is close. Focus, for you, sounds like ritual.' },
              { source: 'GITHUB · 02:14 · BRANCH: still-awake', statement: 'Your best commits happen after midnight, in bursts, alone. Rest, for you, is momentum.' },
              { source: 'CALENDAR · TUESDAYS · 6 WEEKS', statement: 'Every Tuesday ends in back-to-back calls, and every Tuesday night your music turns ambient.' },
              { source: 'WHOOP · 09:02 · HRV +23%', statement: 'You recover better on the mornings you move before nine. Your body already knew the schedule.' },
            ]}
          />
        ),
      },
      {
        eyebrow: '02 — The portrait',
        display: <>Five <em>signatures</em>.</>,
        lead: 'One person, read five ways.',
        body: 'Drive, emotion, taste, people, rhythm — each keeps its own color, and each moves as the evidence moves.',
        demo: (
          <LayerBars
            layers={[
              { label: 'Motivation & drive', value: 82, tint: 'ember' },
              { label: 'Personality & emotion', value: 68, tint: 'iris' },
              { label: 'Cultural identity', value: 74, tint: 'verdigris' },
              { label: 'Social dynamics', value: 41, tint: 'orchid' },
              { label: 'Lifestyle & rhythms', value: 59, tint: 'periwinkle' },
            ]}
          />
        ),
      },
      {
        eyebrow: '03 — The honest number',
        display: <>Measured, <em>not</em> claimed.</>,
        lead: 'The twin is scored against you.',
        body: 'A blind battery asks you both the same questions. The score is published with its n, its session count, and its date — or not at all.',
        demo: (
          <div className="n-card--inverted" style={{ padding: 'var(--n-s12)', textAlign: 'center' }}>
            <p className="n-heading" style={{ color: 'var(--n-void)', fontSize: 64, lineHeight: 1 }}>61%</p>
            <p className="n-lead" style={{ marginTop: 12 }}>how often the twin picks the same answer its human does</p>
            <p className="n-micro" style={{ marginTop: 12, color: '#6a6b6b' }}>
              25 self-report items · one session · not a clinical measure
            </p>
          </div>
        ),
      },
    ]}
  />
);

export default NocturneSignature;
