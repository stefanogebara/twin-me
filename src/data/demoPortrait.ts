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
    { platform: 'github', label: 'GitHub', read: '182 items', since: '2026-06-08', kinds: 'work finished and shipped, and when you do it' },
    { platform: 'spotify', label: 'Spotify', read: '246 items', since: '2026-08-26', kinds: 'plays, repeats, new artists' },
    { platform: 'google_gmail', label: 'Gmail', read: '155 items', since: '2026-07-15', kinds: 'metadata only: sender counts, send times, mix' },
    { platform: 'whoop', label: 'Whoop', read: '68 items', since: '2026-08-26', kinds: 'sleep, recovery, workouts' },
    { platform: 'google_calendar', label: 'Calendar', read: '23 items', since: '2026-07-15', kinds: 'aggregates only: events per day, time of day' },
    { platform: 'youtube', label: 'YouTube', read: '4 items', since: '2026-07-15', kinds: 'subscriptions, topics' },
  ],
  question: {
    fromReadings: ['r06', 'r08'],
    evidenceLine: 'Whoop, Thursday: well recovered, but bedtime far from your usual.',
    question: 'Your best days follow long sleep, and your bedtime moves by hours. Is the late night a choice or a spill-over?',
    answers: ['A choice', 'Spill-over'],
    yourAnswer: null,
  },
  signature: [
    { domain: 'motivation', line: 'You work in bursts: days of quiet, then a week of work in one afternoon, by yourself.', from: ['r01', 'r02', 'r11'] },
    { domain: 'personality', line: 'You steady yourself with repetition: the same songs, the same sequence, the same task until it is done.', from: ['r03', 'r08'] },
    { domain: 'cultural', line: 'A new artist is a rabbit hole; your YouTube is football for joy and sociology for the toolkit.', from: ['r04', 'r05'] },
    { domain: 'social', line: 'You keep the circle tight and the evenings yours.', from: ['r09', 'r10'] },
    { domain: 'lifestyle', line: 'Your rhythm follows your recovery score, and you rarely take the rest day it asks for.', from: ['r06', 'r07'] },
  ],
  readings: [
    {
      id: 'r01', domain: 'motivation',
      text: 'You go quiet for days, then finish a week of work in one afternoon.',
      sourceReflection: '424a3f8e-171e-4675-8e74-e3ec9b0f8504',
      evidence: [
        { source: 'github', at: '2026-09-03', event: 'Started a change to one of your projects' },
        { source: 'github', at: '2026-09-03', event: 'Finished it the same day' },
        { source: 'github', at: '2026-09-03', event: 'Started and finished a fix for the restaurant tool' },
        { source: 'github', at: '2026-09-03', event: 'Started and finished a second fix, same tool' },
        { source: 'github', at: '2026-09-03', event: 'Shipped the new design of your own product' },
      ],
      writtenAt: '2026-09-02', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r02', domain: 'motivation',
      text: 'You do your work alone from start to finish; nobody reviews it and you wait for no one.',
      sourceReflection: '3b7b5bd3-d4ce-47cc-96d1-7ca24ee3125d',
      evidence: [
        { source: 'github', at: '2026-09-03', event: 'Started a change to one of your projects' },
        { source: 'github', at: '2026-09-03', event: 'Finished it yourself, minutes later' },
        { source: 'github', at: '2026-09-03', event: 'Started another change to your own product' },
        { source: 'github', at: '2026-06-08', event: '649 pieces of work shipped, none reviewed by anyone else' },
      ],
      writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r03', domain: 'personality',
      text: 'You put the same Drake songs on repeat to get into deep work.',
      sourceReflection: 'b813486d-928b-4f58-ad3d-e19a86e7d85c',
      evidence: [
        { source: 'spotify', at: '2026-09-03 09:35', event: 'Pipe Down, Drake' },
        { source: 'spotify', at: '2026-09-03 09:37', event: "Yebba's Heartbreak, Drake" },
        { source: 'spotify', at: '2026-09-03 09:44', event: "God's Plan, Drake" },
        { source: 'spotify', at: '2026-09-03 10:10', event: 'Pipe Down, Drake, again' },
        { source: 'github', at: '2026-09-03', event: 'Started a piece of work right after' },
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
      text: 'After a long night of sleep you go straight into a full morning of work.',
      sourceReflection: '84a9f752-5282-4e25-9341-48cf55e97464',
      evidence: [
        { source: 'whoop', at: '2026-09-03 09:32', event: 'Slept 8.4 hours, well rested' },
        { source: 'whoop', at: '2026-09-03 09:32', event: 'Recovered well, resting heart rate 50' },
        { source: 'github', at: '2026-09-03', event: 'Six pieces of work finished before lunch' },
      ],
      writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r07', domain: 'lifestyle',
      text: 'You train even on the days your body asks for rest.',
      sourceReflection: '82f1b383-1d86-42f8-aa28-7233b3fd3724',
      evidence: [
        { source: 'whoop', at: '2026-09-02 11:01', event: 'A restless night: woke 16 times, bedtime far from usual' },
        { source: 'whoop', at: '2026-09-02 14:02', event: 'Kayaking, a hard session, heart rate up to 178' },
        { source: 'whoop', at: '2026-09-02 18:32', event: 'A second, lighter session the same evening' },
      ],
      writtenAt: '2026-09-02', supportedAt: '2026-09-02', verdict: null,
    },
    {
      id: 'r08', domain: 'personality',
      text: 'Your bedtime moves by hours from night to night; your best mornings come after the long sleeps.',
      sourceReflection: '59c71640-945b-41dc-9829-a7ff0d4083f5',
      evidence: [
        { source: 'whoop', at: '2026-09-02', event: 'Bedtime far from your usual' },
        { source: 'whoop', at: '2026-09-03', event: 'Bedtime closer to usual, woke 10 times' },
        { source: 'whoop', at: '2026-09-03', event: 'Recovery climbing, 52% to 73%' },
      ],
      writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null,
    },
    {
      id: 'r09', domain: 'social',
      text: 'You keep your circle small: a handful of people a month, and almost all of it about work.',
      sourceReflection: 'f2f577ee-f1e3-4eaa-a5bf-a2d138378243',
      evidence: [
        { source: 'google_gmail', at: '2026-09-03', event: '5 different people wrote to you this month' },
        { source: 'google_gmail', at: '2026-09-03', event: 'Every email this week was about work' },
        { source: 'google_gmail', at: '2026-09-03', event: 'Most of this week\'s mail came from one work tool' },
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
      text: 'You stop around half past ten at night, and let the inbox pile up while you build.',
      sourceReflection: '03c501b7-c6b8-4734-8418-857e2063a3a6',
      evidence: [
        { source: 'google_gmail', at: '2026-09-03 11:11', event: '6 new emails in 8 minutes, most from a work tool' },
        { source: 'google_gmail', at: '2026-09-03 08:02', event: 'You send email almost only on weekdays' },
        { source: 'github', at: '2026-09-02', event: 'Late nights and Sundays are when you do the most, then a hard stop' },
      ],
      writtenAt: '2026-09-02', supportedAt: '2026-09-03', verdict: null,
    },
  ],
  ask: [
    { q: 'What do I do when I have a lot to ship?', a: 'I go quiet for days, then finish everything in one afternoon, by myself, with Drake on repeat.', cites: ['r01', 'r02', 'r03'] },
    { q: 'Am I resting enough?', a: 'Not really. I train on low-recovery days and my bedtime moves by hours. My best days are the ones after a long sleep, and I know it.', cites: ['r06', 'r07', 'r08'] },
    { q: 'Who do I actually talk to?', a: 'A few people, mostly about the work. My evenings are booked for me, not for messages.', cites: ['r09', 'r10'] },
  ],
};
