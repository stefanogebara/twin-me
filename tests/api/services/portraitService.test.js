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

const { plainEvent, buildPortrait } = await import('../../../api/services/portraitService.js');

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
    expect(e).toEqual({ source: 'spotify', at: '2026-09-03 09:35', event: 'Some new shape, with a dash' });
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
  const wikiPages = [{ domain: 'personality', content_md: '# Personality\n\nYou steady yourself with repetition. More text here.' }];
  const now = new Date('2026-09-04T12:00:00Z');
  const portrait = buildPortrait({ owner: 'Stefano', reflections, eventsById: events, connections, wikiPages, now });

  it('keeps only readings with at least two resolvable events, mapped to a domain', () => {
    expect(portrait.readings.map((r) => [r.id, r.domain, r.evidence.length])).toEqual([
      ['r1', 'personality', 3], ['r2', 'motivation', 2],
    ]);
  });

  it('dates a reading by when it was written and when it was last supported', () => {
    const r1 = portrait.readings[0];
    expect(r1.writtenAt).toBe('2026-09-03');
    expect(r1.supportedAt).toBe('2026-09-03');
    expect(r1.evidence[0]).toEqual({ source: 'spotify', at: '2026-09-03 10:10', event: 'Pipe Down, Drake' });
    expect(r1.verdict).toBeNull();
  });

  it('writes the signature from the wiki page when there is one, else from the strongest reading', () => {
    const personality = portrait.signature.find((s) => s.domain === 'personality');
    expect(personality.line).toBe('You steady yourself with repetition.');
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
