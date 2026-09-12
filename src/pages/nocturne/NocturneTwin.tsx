import { NocturneProduct, ChatDemo, WeekRhythm, Rows } from './NocturneProduct';

/** /nocturne/twin — the Twin chat product page. */
const NocturneTwin = () => (
  <NocturneProduct
    plate="/images/nocturne/sig-periwinkle.jpg"
    badge="Private beta"
    title="Ask anything."
    line="A twin with your memory, not a chatbot with your name."
    promptPlaceholder="Why am I always drained on Tuesdays?"
    sections={[
      {
        id: 'exchange',
        title: 'It answers from evidence.',
        line: 'Every answer names what it read.',
        demo: (
          <ChatDemo
            question="Why am I always drained on Tuesdays?"
            answer="Your Tuesdays run four calls in a row from 13:00, six weeks running, and every one of those nights your music turns quiet within the hour. That is a way of recovering you have never named."
            sources="From your calendar, your evening music and your sleep."
          />
        ),
      },
      {
        id: 'week',
        title: 'Your real week.',
        line: 'Measured from what happened, not from what was scheduled.',
        demo: (
          <WeekRhythm
            days={[
              { day: 'Mon', date: 4, peak: '09:20', load: 58 },
              { day: 'Tue', date: 5, peak: '13:00', load: 94 },
              { day: 'Wed', date: 6, peak: '10:40', load: 71 },
              { day: 'Thu', date: 7, peak: '22:15', load: 66 },
              { day: 'Fri', date: 8, peak: '11:05', load: 48 },
              { day: 'Sat', date: 9, peak: '01:30', load: 32 },
              { day: 'Sun', date: 10, peak: '19:45', load: 24 },
            ]}
          />
        ),
      },
      {
        id: 'boundary',
        title: 'It forgets on request.',
        line: 'Read-only, revocable, deletable.',
        demo: (
          <Rows
            label="What the twin will never do"
            items={[
              { title: 'Read-only', line: 'It can never post or delete anything for you.' },
              { title: 'Never trained on', line: 'Your memories power your twin and nothing else.' },
              { title: 'Deletable', line: 'Any memory, any connection, or everything, at once.' },
            ]}
          />
        ),
      },
    ]}
  />
);

export default NocturneTwin;
