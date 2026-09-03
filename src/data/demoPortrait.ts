/**
 * Stefano's Portrait, the approved static export for /demo (2026-09-03).
 * Readings are one sentence each, rewritten from real reflections (sourceReflection is
 * the user_memories id). Evidence is matched by hand to raw platform events. Calendar is
 * aggregates only; Gmail is counts and rhythms only. Verdicts are null: not yet reviewed.
 * Spec: .claude/plans/2026-09-03-portrait/README.md
 */
export type Domain = 'motivation' | 'personality' | 'cultural' | 'social' | 'lifestyle';
export type Verdict = 'true' | 'partly' | 'wrong' | null;
export type Evidence = { source: string; at: string; event: string };
export type Reading = {
  id: string;
  domain: Domain;
  text: string;
  sourceReflection: string;
  evidence: Evidence[];
  writtenAt: string;
  supportedAt: string;
  verdict: Verdict;
  verdictNote?: string;
};
export type SignatureLine = { domain: Domain; line: string; from: string[] };
export type Question = { fromReadings: string[]; evidenceLine: string; question: string; answers: string[]; yourAnswer: string | null };
export type AskScript = { q: string; a: string; cites: string[] };
export type SourceRow = { platform: string; label: string; read: string; since: string; kinds: string };
export type PortraitData = {
  owner: string;
  sources: SourceRow[];
  question: Question;
  signature: SignatureLine[];
  readings: Reading[];
  ask: AskScript[];
};

export const DOMAIN_HUE: Record<Domain, string> = {
  motivation: '#dd8f4c', personality: '#847dff', cultural: '#55a08e', social: '#dd90d8', lifestyle: '#90b8f0',
};
export const DOMAIN_LABEL: Record<Domain, string> = {
  motivation: 'Motivation', personality: 'Personality', cultural: 'Cultural', social: 'Social', lifestyle: 'Lifestyle',
};
export const SOURCE_LABEL: Record<string, string> = {
  github: 'GitHub', spotify: 'Spotify', google_gmail: 'Gmail', whoop: 'Whoop', google_calendar: 'Calendar', youtube: 'YouTube',
};

export const DEMO_PORTRAIT: PortraitData = {
  owner: 'Stefano',
  sources: [
    { platform: 'github', label: 'GitHub', read: '182 items', since: '2026-06-08', kinds: 'PRs opened and merged, branches, commit rhythm' },
    { platform: 'spotify', label: 'Spotify', read: '246 items', since: '2026-08-26', kinds: 'plays, repeats, new artists' },
    { platform: 'google_gmail', label: 'Gmail', read: '155 items', since: '2026-07-15', kinds: 'metadata only: sender counts, send times, mix' },
    { platform: 'whoop', label: 'Whoop', read: '68 items', since: '2026-08-26', kinds: 'sleep, recovery, HRV, workouts' },
    { platform: 'google_calendar', label: 'Calendar', read: '23 items', since: '2026-07-15', kinds: 'aggregates only: events per day, time of day' },
    { platform: 'youtube', label: 'YouTube', read: '4 items', since: '2026-07-15', kinds: 'subscriptions, topics' },
  ],
  question: {
    fromReadings: ['r06', 'r08'],
    evidenceLine: 'Whoop, Thursday: recovery 81%, sleep consistency 49%.',
    question: 'Your best days follow long sleep, and your bedtime moves by hours. Is the late night a choice or a spill-over?',
    answers: ['A choice', 'Spill-over'],
    yourAnswer: null,
  },
  signature: [
    { domain: 'motivation', line: 'You work in bursts: days of silence, then five merges in an afternoon, alone, on your own branches.', from: ['r01', 'r02', 'r11'] },
    { domain: 'personality', line: 'You steady yourself with repetition: the same songs, the same sequence, the same task until it is done.', from: ['r03', 'r08'] },
    { domain: 'cultural', line: 'A new artist is a rabbit hole; your YouTube is football for joy and sociology for the toolkit.', from: ['r04', 'r05'] },
    { domain: 'social', line: 'You keep the circle tight and the evenings yours.', from: ['r09', 'r10'] },
    { domain: 'lifestyle', line: 'Your rhythm follows your recovery score, and you rarely take the rest day it asks for.', from: ['r06', 'r07'] },
  ],
  readings: [
    {
      id: 'r01', domain: 'motivation',
      text: 'You go days without a commit, then merge five or more PRs in a single day.',
      sourceReflection: '424a3f8e-171e-4675-8e74-e3ec9b0f8504',
      evidence: [
        { source: 'github', at: '2026-09-03', event: 'Opened PR #22 in roca from branch claude/cards-v2' },
        { source: 'github', at: '2026-09-03', event: 'Merged PR #22 in roca' },
        { source: 'github', at: '2026-09-03', event: 'Opened and merged PR #129 in restaurant-ai-mcp (fix/colunas-de-restaurant-config)' },
        { source: 'github', at: '2026-09-03', event: 'Opened and merged PR #131 in restaurant-ai-mcp (fix/colunas-de-service-records)' },
        { source: 'github', at: '2026-09-03', event: 'Merged PR #274 in twin-me (design/nocturne)' },
      ],
      writtenAt: '2026-09-02', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r02', domain: 'motivation',
      text: 'You open and merge your own PRs; GitHub is your deployment checklist, not a place to collaborate.',
      sourceReflection: '3b7b5bd3-d4ce-47cc-96d1-7ca24ee3125d',
      evidence: [
        { source: 'github', at: '2026-09-03', event: 'Opened PR #23 in roca from branch claude/card-quem-responde' },
        { source: 'github', at: '2026-09-03', event: 'Merged PR #23 in roca' },
        { source: 'github', at: '2026-09-03', event: 'Opened PR #275 in twin-me from branch design/token-guard' },
        { source: 'github', at: '2026-06-08', event: 'Profile: 649 PRs, 0 reviews given' },
      ],
      writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r03', domain: 'personality',
      text: 'You put the same Drake songs on loop to lock into deep coding.',
      sourceReflection: 'b813486d-928b-4f58-ad3d-e19a86e7d85c',
      evidence: [
        { source: 'spotify', at: '2026-09-03 09:35', event: 'Pipe Down, Drake' },
        { source: 'spotify', at: '2026-09-03 09:37', event: "Yebba's Heartbreak, Drake" },
        { source: 'spotify', at: '2026-09-03 09:44', event: "God's Plan, Drake" },
        { source: 'spotify', at: '2026-09-03 10:10', event: 'Pipe Down, Drake, again' },
        { source: 'github', at: '2026-09-03', event: 'Opened PR #22 in roca' },
      ],
      writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r04', domain: 'cultural',
      text: 'A new artist is a rabbit hole: you find PARTYNEXTDOOR in the morning and stay in his whole vibe.',
      sourceReflection: '5362e4a5-aeb5-45bf-93fa-205ff84b598f',
      evidence: [
        { source: 'spotify', at: '2026-09-03 09:56', event: 'Discovered new artist: PARTYNEXTDOOR' },
        { source: 'spotify', at: '2026-09-03 09:56', event: 'DIE TRYING, PARTYNEXTDOOR' },
        { source: 'spotify', at: '2026-09-02 17:50', event: 'BbY WOW, KAROL G, twice in four minutes' },
      ],
      writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r05', domain: 'cultural',
      text: 'Your YouTube is a split screen: football and streamers for joy, sociology and AI lectures for the toolkit.',
      sourceReflection: '8e3ec930-7edb-4b7f-a18a-a44c9401aeb7',
      evidence: [
        { source: 'youtube', at: '2026-09-03', event: 'Subscription topics: Sport 9, Association football 8, Lifestyle (sociology) 8, Knowledge 5, Technology 4' },
        { source: 'youtube', at: '2026-09-02', event: '132 channels, including CazéTV, Claude, Neymar Jr, Andrej Karpathy, Vida com IA' },
        { source: 'youtube', at: '2026-09-02', event: 'Average subscription tenure 67 months; oldest 115 months' },
      ],
      writtenAt: '2026-08-31', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r06', domain: 'lifestyle',
      text: 'Your work rhythm follows your recovery score: after 8.4 hours of sleep you go straight into a sprint of branches.',
      sourceReflection: '84a9f752-5282-4e25-9341-48cf55e97464',
      evidence: [
        { source: 'whoop', at: '2026-09-03 09:32', event: 'Slept 8.4 hours, sleep performance 80%' },
        { source: 'whoop', at: '2026-09-03 09:32', event: 'Recovery 81%, HRV 134 ms, resting HR 50' },
        { source: 'github', at: '2026-09-03', event: 'Six PRs opened or merged before 13:00' },
      ],
      writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r07', domain: 'lifestyle',
      text: 'You push through moderate workouts on low-recovery days and rarely take a true rest day.',
      sourceReflection: '82f1b383-1d86-42f8-aa28-7233b3fd3724',
      evidence: [
        { source: 'whoop', at: '2026-09-02 11:01', event: 'Sleep consistency 27%, 16 disturbances' },
        { source: 'whoop', at: '2026-09-02 14:02', event: 'Kayaking, strain 12.5 of 21, max HR 178' },
        { source: 'whoop', at: '2026-09-02 18:32', event: 'Second session the same day, strain 4.4, recovery day' },
      ],
      writtenAt: '2026-09-02', supportedAt: '2026-09-02', verdict: null,
    },
    {
      id: 'r08', domain: 'personality',
      text: 'Your bedtime moves by hours from night to night; your best recovery comes after the long ones.',
      sourceReflection: '59c71640-945b-41dc-9829-a7ff0d4083f5',
      evidence: [
        { source: 'whoop', at: '2026-09-02', event: 'Sleep consistency 27%' },
        { source: 'whoop', at: '2026-09-03', event: 'Sleep consistency 49%, 10 disturbances' },
        { source: 'whoop', at: '2026-09-03', event: 'Recovery trending up, 52% to 73%' },
      ],
      writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r09', domain: 'social',
      text: 'You keep the circle tight: a handful of senders a month, and almost all of it is about the work.',
      sourceReflection: 'f2f577ee-f1e3-4eaa-a5bf-a2d138378243',
      evidence: [
        { source: 'google_gmail', at: '2026-09-03', event: '5 distinct senders in the past month' },
        { source: 'google_gmail', at: '2026-09-03', event: 'Email mix this week: dev 100%' },
        { source: 'google_gmail', at: '2026-09-03', event: 'Most frequent sender this week: github.com, 19 of 20' },
      ],
      writtenAt: '2026-09-02', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r10', domain: 'social',
      text: 'You give your evenings the same weight as your work: two appointments for yourself on Thursday, nothing else after half past four.',
      sourceReflection: 'aafcbcb0-6d65-463a-82bb-9428891191ce',
      evidence: [
        { source: 'google_calendar', at: '2026-09-03', event: 'Thursday: 2 events, evening-loaded' },
        { source: 'google_calendar', at: '2026-09-02', event: 'Wednesday: 2 events, afternoon-focused' },
      ],
      writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r11', domain: 'motivation',
      text: 'You keep a hard stop around 22:30 and let the inbox fill with GitHub while you build.',
      sourceReflection: '03c501b7-c6b8-4734-8418-857e2063a3a6',
      evidence: [
        { source: 'google_gmail', at: '2026-09-03 11:11', event: 'Inbox grew by 6 unread in 8 minutes, most from github.com' },
        { source: 'google_gmail', at: '2026-09-03 08:02', event: 'Sends almost only on weekdays, 11% at weekends' },
        { source: 'github', at: '2026-09-02', event: 'Commits spike late night and Sundays, then a disciplined cutoff' },
      ],
      writtenAt: '2026-09-02', supportedAt: '2026-09-03', verdict: null,
    },
  ],
  ask: [
    { q: 'What do I do when I have a lot to ship?', a: 'I go quiet for days, then open and merge everything in one afternoon, on my own branches, with Drake on repeat.', cites: ['r01', 'r02', 'r03'] },
    { q: 'Am I resting enough?', a: 'Not really. I train on low-recovery days and my bedtime moves by hours. My best days are the ones after a long sleep, and I know it.', cites: ['r06', 'r07', 'r08'] },
    { q: 'Who do I actually talk to?', a: 'A few people, mostly about the work. My evenings are booked for me, not for messages.', cites: ['r09', 'r10'] },
  ],
};
