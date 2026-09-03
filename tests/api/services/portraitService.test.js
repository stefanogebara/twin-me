/**
 * portraitService — the pure half (Portrait spec, 2026-09-03)
 * ==========================================================
 * plainEvent is the language rule made code: evidence speaks the person's language,
 * never the platform's, and Calendar and Gmail never show a name. buildPortrait turns
 * rows into the PortraitData the page renders and drops readings without receipts.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/database.js', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('../../../api/services/memoryStreamService.js', () => ({ addMemory: vi.fn() }));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { plainEvent, buildPortrait, readingsTouchedBy, isSecondPerson } = await import('../../../api/services/portraitService.js');

const ev = (id, platform, content, created_at) => ({ id, memory_type: 'platform_data', content, metadata: { platform }, created_at });

describe('plainEvent speaks the person\'s language', () => {
  const cases = [
    ['spotify', "Listened to 'Pipe Down' by Drake at 9:35 AM", 'Pipe Down, Drake'],
    ['spotify', 'Discovered new artist: PARTYNEXTDOOR', 'A new artist: PARTYNEXTDOOR'],
    ['github', 'Opened PR #22 in roca from branch "claude/cards-v2"', 'Started a change to roca'],
    ['github', 'Merged PR #129 in restaurant-ai-mcp from branch "fix/colunas"', 'Finished a change to restaurant-ai-mcp'],
    ['whoop', 'Slept 8.4 hours (well-rested) — sleep performance 80%', 'Slept 8.4 hours, well rested'],
    ['whoop', 'Recovery score: 81% (high recovery), HRV 134ms, resting heart rate 50bpm, SpO2 92%, skin temp 33.3°C', 'Recovery 81%, high recovery'],
    ['whoop', 'Latest Whoop workout: Kayaking — strain 12.5/21 (moderate), avg HR 140bpm, max HR 178bpm, ~533 kcal', 'Kayaking, a moderate session'],
    ['whoop', 'Sleep details: respiratory rate 17 breaths/min, 16 disturbances, consistency 27%, 21% REM, 30% deep sleep', 'A restless night, woke 16 times, bedtime far from usual'],
    ['whoop', 'Whoop recovery trending up (52% → 73%)', 'Recovery climbing, 52% to 73%'],
    ['google_calendar', "Calendar schedule for Thu 2026-09-03: 2 events (Murilo Personal, Álvaro psicólogo) — evening-loaded scheduling", 'Thu: 2 events, evening heavy'],
    ['google_calendar', "Has a meeting 'Álvaro psicólogo' from 7:00 PM to 8:00 PM on Thu 2026-09-03", 'An appointment Thu at 7:00 PM'],
    ['google_gmail', 'Inbox grew by 6 unread emails in the last 8 minutes; most frequent sender: github.com (19)', '6 new emails in 8 minutes, most from one sender'],
    ['google_gmail', 'Your email mix this week: dev 100% — reveals attention allocation across communication types', 'Every email this week was about work'],
    ['google_gmail', 'Most frequent email senders this week: github.com (19), vercel.com (1)', 'Most mail this week came from one sender, 19 emails'],
    ['google_gmail', 'Receives email from 5 distinct senders/organizations in the past month', '5 different people wrote to you this month'],
    ['google_gmail', 'Sending rhythm: emails almost exclusively on weekdays (11% weekend sends from recent activity)', 'You send email almost only on weekdays'],
    ['youtube', 'YouTube subscription topics: Sport (9), Association football (8)', 'What you follow: Sport (9), Association football (8)'],
  ];
  it.each(cases)('%s: %s', (platform, content, expected) => {
    expect(plainEvent(ev('x', platform, content, '2026-09-03T09:35:00Z')).event).toBe(expected);
  });

  it('never leaks a calendar title or a sender name', () => {
    const cal = plainEvent(ev('c', 'google_calendar', "Has a meeting 'Álvaro psicólogo' from 7:00 PM to 8:00 PM on Thu 2026-09-03", '2026-09-03T10:00:00Z'));
    expect(cal.event).not.toMatch(/Álvaro|psicólogo/);
    const mail = plainEvent(ev('g', 'google_gmail', 'Most frequent email senders this week: github.com (19), vercel.com (1)', '2026-09-03T10:00:00Z'));
    expect(mail.event).not.toMatch(/github\.com|vercel/);
  });

  it('keeps the source and the minute, and softens unknown shapes', () => {
    const e = plainEvent(ev('u', 'spotify', 'Some new shape — with a dash', '2026-09-03T09:35:12Z'));
    expect(e).toEqual({ source: 'spotify', at: '2026-09-03 09:35', event: 'Some new shape, with a dash', translated: true });
  });
});

describe('buildPortrait', () => {
  const events = new Map([
    ['e1', ev('e1', 'spotify', "Listened to 'Pipe Down' by Drake at 9:35 AM", '2026-09-03T09:35:00Z')],
    ['e2', ev('e2', 'spotify', "Listened to 'Pipe Down' by Drake at 10:10 AM", '2026-09-03T10:10:00Z')],
    ['e3', ev('e3', 'github', 'Opened PR #22 in roca', '2026-09-01T11:00:00Z')],
  ]);
  const reflections = [
    { id: 'r1', content: 'You put the same songs on repeat to get into deep work.', created_at: '2026-09-03T12:00:00Z', metadata: { expert: 'personality_psychologist', observation_ids: ['e1', 'e2', 'e3'] } },
    { id: 'r2', content: 'You start work in bursts.', created_at: '2026-09-02T12:00:00Z', metadata: { expert: 'code_architect', observation_ids: ['e3', 'e2'] } },
    { id: 'r3', content: 'No receipts here.', created_at: '2026-09-02T12:00:00Z', metadata: { expert: 'social_dynamics', observation_ids: ['e1'] } },
    { id: 'r4', content: 'Old style reflection without ids.', created_at: '2026-08-02T12:00:00Z', metadata: { expert: 'cultural_identity' } },
  ];
  const connections = [
    { platform: 'spotify', status: 'connected', content_volume: 246, connected_at: '2026-08-26T10:00:00Z' },
    { platform: 'reddit', status: 'disconnected', content_volume: 0, connected_at: '2026-04-18T10:00:00Z' },
  ];
  const now = new Date('2026-09-04T12:00:00Z');
  const portrait = buildPortrait({ owner: 'Stefano', reflections, eventsById: events, connections, now });

  it('keeps only readings with at least two resolvable events, mapped to a domain', () => {
    expect(portrait.readings.map((r) => [r.id, r.domain, r.evidence.length])).toEqual([
      ['r1', 'personality', 3], ['r2', 'motivation', 2],
    ]);
  });

  it('dates a reading by when it was written and when it was last supported', () => {
    const r1 = portrait.readings[0];
    expect(r1.writtenAt).toBe('2026-09-03');
    expect(r1.supportedAt).toBe('2026-09-03');
    expect(r1.evidence[0]).toEqual({ source: 'spotify', at: '2026-09-03 10:10', event: 'Pipe Down, Drake', translated: true });
    expect(r1.verdict).toBeNull();
  });

  it('writes the signature from the strongest reading, the line that has receipts under it', () => {
    const personality = portrait.signature.find((s) => s.domain === 'personality');
    expect(personality.line).toBe('You put the same songs on repeat to get into deep work.');
    expect(personality.from).toEqual(['r1']);
    const motivation = portrait.signature.find((s) => s.domain === 'motivation');
    expect(motivation.line).toBe('You start work in bursts.');
    expect(portrait.signature.find((s) => s.domain === 'social')).toBeUndefined();
  });

  it('asks today about the thinnest fresh reading, with its first receipt as the evidence line', () => {
    expect(portrait.question.fromReadings).toEqual(['r2']);
    expect(portrait.question.evidenceLine).toBe('Spotify, 2026-09-03 10:10: Pipe Down, Drake.');
    expect(portrait.question.question).toContain('You start work in bursts.');
  });

  it('lists only connected sources, in the person\'s words', () => {
    expect(portrait.sources).toEqual([
      { platform: 'spotify', label: 'Spotify', read: '246 items', since: '2026-08-26', kinds: 'plays, repeats, new artists' },
    ]);
  });
});

describe('readingsTouchedBy', () => {
  it('finds the readings that leaned on deleted events', () => {
    const reflections = [
      { id: 'r1', metadata: { observation_ids: ['e1', 'e2'] } },
      { id: 'r2', metadata: { observation_ids: ['e3'] } },
      { id: 'r3', metadata: {} },
    ];
    expect(readingsTouchedBy(reflections, ['e2', 'zzz']).map((r) => r.id)).toEqual(['r1']);
    expect(readingsTouchedBy(reflections, [])).toEqual([]);
  });
});

describe('second person first', () => {
  it('recognises readings addressed to the person', () => {
    expect(isSecondPerson('You loop the same songs.')).toBe(true);
    expect(isSecondPerson('Your bedtime moves by hours.')).toBe(true);
    expect(isSecondPerson('This person uses TypeScript.')).toBe(false);
    expect(isSecondPerson('They build tools.')).toBe(false);
  });

  it('orders the ledger with second-person readings ahead of third-person ones', () => {
    const events = new Map([
      ['a', ev('a', 'spotify', 'x', '2026-09-03T09:00:00Z')],
      ['b', ev('b', 'spotify', 'y', '2026-09-03T10:00:00Z')],
    ]);
    const portrait = buildPortrait({ owner: 'S', eventsById: events, now: new Date('2026-09-04T00:00:00Z'), reflections: [
      { id: 'third', content: 'This person works late.', created_at: '2026-09-03T12:00:00Z', metadata: { expert: 'code_architect', observation_ids: ['a', 'b'] } },
      { id: 'second', content: 'You work late.', created_at: '2026-09-02T12:00:00Z', metadata: { expert: 'motivation_analyst', observation_ids: ['a', 'b'] } },
    ] });
    expect(portrait.readings.map((r) => r.id)).toEqual(['second', 'third']);
  });
});

describe('the plain rewrite', () => {
  const events = new Map([
    ['a', ev('a', 'github', 'Opened PR #22 in roca', '2026-09-03T09:00:00Z')],
    ['b', ev('b', 'github', 'Merged PR #23 in roca', '2026-09-03T10:00:00Z')],
  ]);

  it('reads the plain sentence when the row carries one, and the original when it does not', () => {
    const portrait = buildPortrait({
      owner: 'S', eventsById: events, now: new Date('2026-09-04T00:00:00Z'), reflections: [
        { id: 'r1', content: 'This person merges their PRs the same day they open them.', created_at: '2026-09-03T12:00:00Z',
          metadata: { expert: 'code_architect', observation_ids: ['a', 'b'], plain: 'You finish a piece of work the same day you start it.' } },
        { id: 'r2', content: 'You keep the evenings yours.', created_at: '2026-09-02T12:00:00Z',
          metadata: { expert: 'social_dynamics', observation_ids: ['a', 'b'] } },
      ],
    });
    expect(portrait.readings.map((r) => r.text)).toEqual([
      'You finish a piece of work the same day you start it.',
      'You keep the evenings yours.',
    ]);
  });
});

describe('signature lines keep their receipts', () => {
  const events = new Map([
    ['a', ev('a', 'spotify', 'x', '2026-09-03T09:00:00Z')],
    ['b', ev('b', 'spotify', 'y', '2026-09-03T10:00:00Z')],
  ]);

  it('speaks a domain\'s own reading, and stays silent where there is none', () => {
    const portrait = buildPortrait({
      owner: 'S', eventsById: events, now: new Date('2026-09-04T00:00:00Z'),
      reflections: [{ id: 'r1', content: 'You loop the same two songs to lock in.', created_at: '2026-09-03T12:00:00Z',
        metadata: { expert: 'cultural_identity', observation_ids: ['a', 'b'] } }],
    });
    const line = (d) => portrait.signature.find((s) => s.domain === d)?.line;
    expect(line('cultural')).toBe('You loop the same two songs to lock in.');
    expect(line('social')).toBeUndefined();
  });
});

describe('a receipt the page cannot say plainly', () => {
  // A shape no rule covers, carrying vocabulary that belongs to the platform.
  const raw = (id, at) => ev(id, 'github', 'Repository roca now has 12 open pull requests awaiting review', at);
  const said = (id, at) => ev(id, 'github', `Merged PR #1 in roca`, at);

  it('never reaches the person', () => {
    const events = new Map([
      ['a', said('a', '2026-09-03T09:00:00Z')],
      ['b', said('b', '2026-09-03T10:00:00Z')],
      ['c', raw('c', '2026-09-03T11:00:00Z')],
    ]);
    const portrait = buildPortrait({
      owner: 'S', eventsById: events, now: new Date('2026-09-04T00:00:00Z'),
      reflections: [{ id: 'r1', content: 'You finish what you start.', created_at: '2026-09-03T12:00:00Z',
        metadata: { expert: 'code_architect', observation_ids: ['a', 'b', 'c'] } }],
    });
    const shown = portrait.readings[0].evidence.map((e) => e.event);
    expect(shown).toEqual(['Finished a change to roca', 'Finished a change to roca']);
    expect(shown.join(' ')).not.toMatch(/branch|commits/i);
  });

  it('takes the reading with it when too few are left', () => {
    const events = new Map([
      ['a', said('a', '2026-09-03T09:00:00Z')],
      ['c', raw('c', '2026-09-03T11:00:00Z')],
    ]);
    const portrait = buildPortrait({
      owner: 'S', eventsById: events, now: new Date('2026-09-04T00:00:00Z'),
      reflections: [{ id: 'r1', content: 'You finish what you start.', created_at: '2026-09-03T12:00:00Z',
        metadata: { expert: 'code_architect', observation_ids: ['a', 'c'] } }],
    });
    expect(portrait.readings).toEqual([]);
  });

  it('says the shapes the real data actually has', () => {
    const cases = [
      ['github', 'Created branch \'claude/cards\' in roca', 'Started a change to roca'],
      ['github', 'GitHub rhythm: weekday coder, peak day is Monday (1198 contributions), 25% weekends', 'You work on weekdays, Mondays most of all'],
      ['github', 'Most active GitHub month in the past year: February 2026 with 1543 contributions', 'Your busiest month was February 2026'],
      ['spotify', 'Extended listening session (5 tracks recently)', 'A long listen, 5 songs in a row'],
      ['spotify', 'Top artist this week: Drake', 'Most played this week: Drake'],
      ['spotify', 'Late-night listening session (after midnight)', 'Listening after midnight'],
      ['youtube', 'Has 1 YouTube playlist: Stefano hot songs (avg 1 videos each)', 'A playlist of your own: Stefano hot songs'],
    ];
    for (const [platform, content, expected] of cases) {
      const out = plainEvent(ev('x', platform, content, '2026-09-03T09:00:00Z'));
      expect(out.event, content).toBe(expected);
      expect(out.translated, content).toBe(true);
    }
  });
});

describe('a stanza is meant to be read', () => {
  it('keeps only its strongest few, however many the engine wrote', () => {
    const events = new Map([
      ['a', ev('a', 'spotify', "Listened to 'x' by y at 9:00 AM", '2026-09-03T09:00:00Z')],
      ['b', ev('b', 'spotify', "Listened to 'z' by y at 10:00 AM", '2026-09-03T10:00:00Z')],
    ]);
    const reflections = Array.from({ length: 9 }, (_, i) => ({
      id: `r${i}`, content: `You do the thing, take ${i}.`, created_at: `2026-09-0${(i % 3) + 1}T12:00:00Z`,
      metadata: { expert: 'cultural_identity', observation_ids: ['a', 'b'] },
    }));
    const portrait = buildPortrait({ owner: 'S', reflections, eventsById: events, now: new Date('2026-09-04T00:00:00Z') });
    expect(portrait.readings.length).toBe(4);
    expect(new Set(portrait.readings.map((r) => r.domain))).toEqual(new Set(['cultural']));
  });
});
