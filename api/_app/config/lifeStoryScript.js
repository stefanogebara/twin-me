/**
 * Story Chapters — Life-Story Interview Script
 * =============================================
 * Script-as-data for the chaptered life-story interview (Plan:
 * .claude/plans/2026-08-01-twin-interview/README.md).
 *
 * Modeled on the American Voices Project protocol used in Park et al. 2024
 * ("Generative Agent Simulations of 1,000 People"): a maximally broad
 * life-story opener, then topical blocks. Their lesion ablation shows
 * ~20-25 minutes of self-report retains ~95% of the predictive signal of
 * the full 2-hour interview — this script budgets ~30 scripted minutes,
 * split into 3-5 minute chapters because TwinMe's own 12-question interview
 * saw dropout at Q5-7 (see onboarding-calibration.js header).
 *
 * Contract (pinned by tests/api/services/lifeStoryScript.test.js):
 * - each chapter: { id, title, intro, estimatedMinutes, questions[] }
 * - each question: { id, text, objective, turnBudget? }
 *   - text: asked VERBATIM as the first ask (paper protocol)
 *   - objective: the learning goal steering the follow-up engine
 *   - turnBudget: max dynamic follow-ups (default DEFAULT_TURN_BUDGET)
 */

export const DEFAULT_TURN_BUDGET = 2;

export const LIFE_STORY_CHAPTERS = [
  {
    id: 'your_story',
    title: 'Your Story',
    intro: 'The broad strokes first. There are no wrong answers here — just tell it the way you remember it.',
    estimatedMinutes: 5,
    questions: [
      {
        id: 'ys_life_story',
        text: 'Tell me the story of your life — from your childhood, to education, to family and relationships, and to any major life events. The broad strokes, the way you would tell it.',
        objective: 'Get the arc of their life in their own words: where they grew up, key transitions, the people and events they choose to mention first',
        turnBudget: 3,
      },
      {
        id: 'ys_turning_point',
        text: 'Looking back, what was a real turning point — a moment after which things were different?',
        objective: 'Identify a formative event and what changed in them because of it',
      },
      {
        id: 'ys_younger_self',
        text: 'What would surprise the person you were ten years ago about who you are now?',
        objective: 'Surface self-perceived change over time and what they consider their biggest evolution',
      },
    ],
  },
  {
    id: 'work_purpose',
    title: 'Work & Purpose',
    intro: 'Not the resume version — the real one.',
    estimatedMinutes: 4,
    questions: [
      {
        id: 'wp_path',
        text: 'How did you end up doing what you do now? Walk me through the path, including the detours.',
        objective: 'Understand their career arc and whether it was chosen, drifted into, or fought for',
      },
      {
        id: 'wp_drive',
        text: 'What is something you keep coming back to, even when nobody is asking you to?',
        objective: 'Find the intrinsic pull — the work or pursuit they return to without external reward',
      },
      {
        id: 'wp_success',
        text: 'What does success actually look like to you — not the version you would put on LinkedIn?',
        objective: 'Learn their private definition of success and how it differs from the public one',
      },
      {
        id: 'wp_decisions',
        text: 'When you face a big decision, how do you actually make it — gut, analysis, or talking it out?',
        objective: 'Capture their decision-making style with a concrete recent example',
      },
    ],
  },
  {
    id: 'people',
    title: 'People',
    intro: 'The people who make you who you are.',
    estimatedMinutes: 4,
    questions: [
      {
        id: 'pe_family',
        text: 'Tell me about your family — the one you grew up in, and what family means to you now.',
        objective: 'Understand family structure, closeness, and how upbringing shaped their relational patterns',
      },
      {
        id: 'pe_circle',
        text: 'Who really knows you? Describe your closest circle and what those people understand about you that others do not.',
        objective: 'Map relationship depth vs breadth and what intimacy looks like for them',
      },
      {
        id: 'pe_conflict',
        text: 'How do you handle it when someone you care about disagrees with you on something that matters?',
        objective: 'Learn their conflict style: avoid, engage, persuade, accommodate',
      },
    ],
  },
  {
    id: 'values_beliefs',
    title: 'Values & Beliefs',
    intro: 'What you stand for, and where it came from.',
    estimatedMinutes: 4,
    questions: [
      {
        id: 'vb_non_negotiable',
        text: 'What is something you would never compromise on, even if it cost you?',
        objective: 'Identify a core value with the story or cost that proves it is real, not aspirational',
      },
      {
        id: 'vb_changed_mind',
        text: 'What is a belief you held strongly that you have since changed your mind about?',
        objective: 'Understand openness to revision and what kind of evidence moves them',
      },
      {
        id: 'vb_worldview',
        text: 'Do you think about spirituality, religion, or a bigger picture at all? Where do you land on that?',
        objective: 'Capture their worldview or meaning-making frame, including comfortable uncertainty',
      },
    ],
  },
  {
    id: 'day_in_life',
    title: 'A Day in the Life',
    intro: 'The real version, not the aspirational one.',
    estimatedMinutes: 3,
    questions: [
      {
        id: 'dl_typical',
        text: 'Walk me through a typical weekday, from waking up to going to sleep — the real version.',
        objective: 'Get their actual daily rhythm: wake time, work blocks, energy peaks, evening habits',
      },
      {
        id: 'dl_energy',
        text: 'What reliably drains you, and what reliably recharges you?',
        objective: 'Learn their energy economy — the activities and people that cost vs restore energy',
      },
      {
        id: 'dl_body',
        text: 'How is your relationship with your body — sleep, movement, health? Honestly.',
        objective: 'Understand health habits and how they feel about them, including the gap between intention and reality',
      },
    ],
  },
  {
    id: 'taste_joy',
    title: 'Taste & Joy',
    intro: 'What you love, and what it says about you.',
    estimatedMinutes: 3,
    questions: [
      {
        id: 'tj_obsession',
        text: 'What are you into that you could talk about for an hour without noticing the time?',
        objective: 'Find the passion topic where enthusiasm is unguarded, and why it hooks them',
      },
      {
        id: 'tj_media',
        text: 'Is there a piece of music, a film, or a book that shaped how you see the world?',
        objective: 'Identify a formative cultural artifact and the worldview it encoded for them',
      },
      {
        id: 'tj_play',
        text: 'When did you last lose track of time doing something purely for fun? What was it?',
        objective: 'Learn what play looks like for them and how often it actually happens',
      },
    ],
  },
  {
    id: 'hard_times',
    title: 'Hard Times',
    intro: 'Only what you want to share — skip anything you would rather not.',
    estimatedMinutes: 4,
    questions: [
      {
        id: 'ht_struggle',
        text: 'What is the hardest thing you have been through that you are comfortable talking about?',
        objective: 'Understand a significant struggle in their own framing, at the depth they choose',
        turnBudget: 1,
      },
      {
        id: 'ht_coping',
        text: 'When life gets heavy, what do you actually do — the honest version of how you cope?',
        objective: 'Capture real coping mechanisms, healthy or not, and their self-awareness about them',
      },
      {
        id: 'ht_carried',
        text: 'What did that period teach you that you still carry today?',
        objective: 'Learn what changed in their values or behavior after hardship — the integrated lesson',
      },
    ],
  },
  {
    id: 'the_future',
    title: 'The Future',
    intro: 'Where this is all going.',
    estimatedMinutes: 3,
    questions: [
      {
        id: 'fu_five_years',
        text: 'When you imagine your life five years from now, what do you see — and what do you hope you see?',
        objective: 'Distinguish their expected future from their desired future and the gap between them',
      },
      {
        id: 'fu_fear',
        text: 'What worries you most when you think about the future?',
        objective: 'Identify their dominant fear or anxiety about what is ahead',
      },
      {
        id: 'fu_legacy',
        text: 'At the end of it all, what do you want to have been true about your life?',
        objective: 'Capture their legacy frame — what mattering means to them at the largest scale',
      },
    ],
  },
];

/** Total scripted minutes across all chapters (tests pin the 25-40 band). */
export const TOTAL_ESTIMATED_MINUTES = LIFE_STORY_CHAPTERS.reduce(
  (sum, c) => sum + c.estimatedMinutes,
  0
);
