import { NocturneProduct, Readings, LayerBars, Rows } from './NocturneProduct';

/** /nocturne/signature — the Soul Signature product page. */
const NocturneSignature = () => (
  <NocturneProduct
    plate="/images/nocturne/sig-iris.jpg"
    badge="Private beta"
    title="Read yourself."
    line="Your soul signature, built from evidence."
    promptPlaceholder="Why do I work best after midnight?"
    sections={[
      {
        id: 'evidence',
        title: 'It notices.',
        line: 'Every reading names its source and its moment.',
        demo: (
          <Readings
            items={[
              { source: 'Spotify, 23:41', statement: 'You loop the same three songs when a deadline is close.' },
              { source: 'GitHub, 02:14', statement: 'Your best work happens after midnight, in short bursts.' },
              { source: 'Calendar, six Tuesdays', statement: 'Tuesdays end in back-to-back calls, and that night your music turns quiet.' },
              { source: 'Whoop, 09:02', statement: 'You recover better on the mornings you move before nine.' },
            ]}
          />
        ),
      },
      {
        id: 'portrait',
        title: 'Five signatures.',
        line: 'One person, read five ways, moving as the evidence moves.',
        demo: (
          <LayerBars
            layers={[
              { label: 'Motivation and drive', value: 82, tint: 'ember' },
              { label: 'Personality and emotion', value: 68, tint: 'iris' },
              { label: 'Cultural identity', value: 74, tint: 'verdigris' },
              { label: 'Social dynamics', value: 41, tint: 'orchid' },
              { label: 'Lifestyle and rhythms', value: 59, tint: 'periwinkle' },
            ]}
          />
        ),
      },
      {
        id: 'number',
        title: 'Measured, not claimed.',
        line: 'The twin is scored against you, with its sample and its date.',
        demo: (
          <Rows
            label="The honest number"
            items={[
              { title: '61% the same answer', line: 'How often the twin picks the answer its person picks, over 25 questions.' },
              { title: 'One session, not a clinical measure', line: 'Published with its sample and date, or not at all.' },
            ]}
          />
        ),
      },
    ]}
  />
);

export default NocturneSignature;
