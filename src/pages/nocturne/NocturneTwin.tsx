import { NocturneProduct, ChatDemo, WeekRhythm } from './NocturneProduct';

/** /nocturne/twin — the Twin chat product page. */
const NocturneTwin = () => (
  <NocturneProduct
    tint="periwinkle"
    plate="/images/nocturne/sig-periwinkle.jpg"
    badge="Private beta — invite only"
    display={<><em>Ask</em> anything.</>}
    lead="A twin with your memory, not a chatbot with your name."
    body="It holds your context — every pattern, every source — and answers questions you have never had the data to ask."
    promptPlaceholder="Why am I always drained on Tuesdays?"
    sections={[
      {
        eyebrow: '01 — The exchange',
        display: <>It <em>answers</em> from evidence.</>,
        lead: 'Every answer names what it read.',
        body: 'No confident guessing. The twin cites the platform, the moment, and the pattern behind what it says.',
        demo: (
          <ChatDemo
            question="Why am I always drained on Tuesdays?"
            answer="Your Tuesdays run four back-to-back calls from 13:00, six weeks straight — and every one of those nights your listening turns ambient within the hour. That is not a mood. It is a recovery pattern you have been running without naming it."
            sources={['CALENDAR · 6 WEEKS', 'SPOTIFY · EVENINGS', 'WHOOP · HRV']}
          />
        ),
      },
      {
        eyebrow: '02 — The week',
        display: <>Your <em>real</em> week.</>,
        lead: 'The rhythm your calendar cannot see.',
        body: 'Load is measured from what actually happened — meetings, movement, sleep, output — not from what was scheduled.',
        demo: (
          <WeekRhythm
            days={[
              { day: 'MON', date: 4, peak: '09:20', load: 58 },
              { day: 'TUE', date: 5, peak: '13:00', load: 94 },
              { day: 'WED', date: 6, peak: '10:40', load: 71 },
              { day: 'THU', date: 7, peak: '22:15', load: 66 },
              { day: 'FRI', date: 8, peak: '11:05', load: 48 },
              { day: 'SAT', date: 9, peak: '01:30', load: 32 },
              { day: 'SUN', date: 10, peak: '19:45', load: 24 },
            ]}
          />
        ),
      },
      {
        eyebrow: '03 — The boundary',
        display: <>It <em>forgets</em> on request.</>,
        lead: 'Read-only, revocable, deletable.',
        body: 'The twin can never post, change, or delete anything on your platforms — and everything it holds can be removed in one click.',
        demo: (
          <div className="n-grid-3">
            {[
              ['READ-ONLY', 'It can never post or delete on your behalf.'],
              ['NEVER TRAINED ON', 'Your memories power your twin and nothing else.'],
              ['DELETABLE', 'Any memory, any connection, or everything — instantly.'],
            ].map(([label, copy]) => (
              <div key={label} className="n-card">
                <p className="n-micro" style={{ marginBottom: 10 }}>{label}</p>
                <p className="n-body">{copy}</p>
              </div>
            ))}
          </div>
        ),
      },
    ]}
  />
);

export default NocturneTwin;
