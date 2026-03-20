/**
 * Autoresearch target definitions — scoring criteria, file paths, extraction strategies.
 */

export const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

export const TARGETS = {
  'twin-chat': {
    id: 'twin-chat',
    name: 'Twin Chat System Prompt',
    sourceFile: 'api/services/twinSystemPromptBuilder.js',
    extractPattern: /TWIN_BASE_INSTRUCTIONS\s*=\s*`([\s\S]*?)`;/,
    testInputs: [
      { role: 'user', content: 'hey, how\'s it going?' },
      { role: 'user', content: 'I\'m feeling kind of overwhelmed today' },
      { role: 'user', content: 'what have I been listening to lately?' },
    ],
    criteria: [
      { id: 1, text: 'Does the response sound like a real person texting a friend, NOT a chatbot or assistant?' },
      { id: 2, text: 'Does it reference specific data from the context (artist names, events, metrics, times)?' },
      { id: 3, text: 'Is it free of clinical/academic language (no "coping mechanisms", "behavioral patterns", "it seems like")?' },
      { id: 4, text: 'Does it connect observations from 2+ different data sources into a natural insight?' },
      { id: 5, text: 'Is it 2-3 short paragraphs max, not a wall of text?' },
      { id: 6, text: 'Does it end with something that invites continued conversation (question, nudge, callback)?' },
    ],
  },

  'onboarding': {
    id: 'onboarding',
    name: 'Onboarding Interview Prompt',
    sourceFile: 'api/routes/onboarding-calibration.js',
    extractPattern: /return `(You are a perceptive[\s\S]*?)`;/,
    testInputs: [
      { questionNumber: 1, history: [] },
      { questionNumber: 5, history: [
        { role: 'assistant', content: 'When you have a free afternoon, what do you usually do?' },
        { role: 'user', content: 'I like to go for walks and listen to music.' },
        { role: 'assistant', content: 'Nice — what kind of music sets the mood for those walks?' },
        { role: 'user', content: 'Brazilian pagode, some hip hop, depends on my mood.' },
      ]},
      { questionNumber: 9, history: [
        { role: 'assistant', content: 'What\'s something people usually get wrong about you?' },
        { role: 'user', content: 'They think I\'m super outgoing but I actually recharge by being alone.' },
      ]},
    ],
    criteria: [
      { id: 1, text: 'Is exactly ONE question asked (not two or more in one message)?' },
      { id: 2, text: 'Is the total message 3 sentences or fewer?' },
      { id: 3, text: 'Does it react specifically to what was said (not a generic affirmation like "That\'s great!")?' },
      { id: 4, text: 'Does it feel like a perceptive friend, not a therapist or formal interviewer?' },
      { id: 5, text: 'Does the question make someone pause and think, not rattle off a quick factual answer?' },
    ],
  },

  'reflections': {
    id: 'reflections',
    name: 'Reflection Expert Prompts',
    sourceFile: 'api/services/reflectionEngine.js',
    extractPattern: /EXPERT_PERSONAS\s*=\s*\[([\s\S]*?)\];/,
    expertIndex: 0, // default: personality psychologist
    testInputs: [{ role: 'user', content: 'Analyze the evidence and generate observations.' }], // placeholder, context comes from DB
    criteria: [
      { id: 1, text: 'Does each observation start with "You..." or "Your..." (second person direct)?' },
      { id: 2, text: 'Does it cite specific evidence from the data, not vague generalities?' },
      { id: 3, text: 'Is each observation 1-2 sentences in plain conversational English?' },
      { id: 4, text: 'Does it sound like a perceptive friend noticing something, not a clinical report?' },
      { id: 5, text: 'Does it avoid all forbidden clinical terms (coping mechanisms, behavioral patterns, cognitive, attachment style)?' },
    ],
  },

  'insights': {
    id: 'insights',
    name: 'Proactive Insights Prompt',
    sourceFile: 'api/services/proactiveInsights.js',
    extractPattern: /INSIGHT_GENERATION_PROMPT\s*=\s*`([\s\S]*?)`;/,
    testInputs: [{ role: 'user', content: 'Generate insights from the observations and reflections.' }], // placeholder
    criteria: [
      { id: 1, text: 'Is the first insight a nudge with a specific, actionable suggestion?' },
      { id: 2, text: 'Is the output valid JSON (a parseable array of objects)?' },
      { id: 3, text: 'Are insights 1-2 short sentences each, no bullet points or markdown headers?' },
      { id: 4, text: 'Do insights reference specific observable data (song names, times, metrics), not generic wellness advice?' },
      { id: 5, text: 'Is the tone like a close friend texting, not a wellness app notification?' },
    ],
  },
};

export const DEFAULTS = {
  rounds: 10,
  threshold: 0.95,
  maxPromptDiffPercent: 0.25, // reject mutations that change >25% of prompt
  judgeTemperature: 0,
  mutatorTemperature: 0.4,
};
