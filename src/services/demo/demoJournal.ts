/**
 * Demo Journal Data
 * Soul Journal entries with analyses for demo mode
 */

import { getRelativeDateDays } from './demoHelpers';
import { DEMO_USER } from './demoUser';

// =====================================================
// SOUL JOURNAL - Demo journal entries with analyses
// =====================================================

export interface DemoJournalEntry {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  mood: string | null;
  energy_level: number | null;
  tags: string[];
  is_analyzed: boolean;
  created_at: string;
  updated_at: string;
  journal_analyses: DemoJournalAnalysis[];
}

export interface DemoJournalAnalysis {
  id: string;
  themes: string[];
  emotions: { emotion: string; intensity: number }[];
  personality_signals: { trait: string; direction: string; evidence: string }[];
  self_perception: { how_they_see_themselves: string; values_expressed: string[] };
  summary: string;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- demo insights have dynamic shape
export const getDemoJournalData = (): { entries: DemoJournalEntry[]; insights: any } => {
  const entries: DemoJournalEntry[] = [
    {
      id: 'demo-journal-1',
      user_id: DEMO_USER.id,
      title: 'A morning of clarity',
      content: 'Woke up early today and spent 30 minutes just sitting with my coffee, watching the sunrise. No phone, no notifications. It felt like I was reconnecting with something I\'d lost. I realized how much of my day I spend reacting to things instead of choosing where my attention goes. I want more mornings like this - intentional, quiet, mine.',
      mood: 'reflective',
      energy_level: 4,
      tags: ['mindfulness', 'morning-routine', 'self-discovery'],
      is_analyzed: true,
      created_at: getRelativeDateDays(0),
      updated_at: getRelativeDateDays(0),
      journal_analyses: [{
        id: 'demo-analysis-1',
        themes: ['mindfulness', 'intentional living', 'digital detox'],
        emotions: [
          { emotion: 'serenity', intensity: 0.85 },
          { emotion: 'determination', intensity: 0.6 },
          { emotion: 'gratitude', intensity: 0.7 }
        ],
        personality_signals: [
          { trait: 'Openness', direction: 'high', evidence: 'Seeks novel experiences like mindful mornings' },
          { trait: 'Conscientiousness', direction: 'high', evidence: 'Desire for intentional attention management' }
        ],
        self_perception: {
          how_they_see_themselves: 'Someone who values presence and intentionality but struggles with digital distractions',
          values_expressed: ['mindfulness', 'autonomy', 'presence']
        },
        summary: 'This entry reveals someone who craves authentic presence and is actively reclaiming their attention from the noise of modern life.',
        created_at: getRelativeDateDays(0)
      }]
    },
    {
      id: 'demo-journal-2',
      user_id: DEMO_USER.id,
      title: 'The presentation went surprisingly well',
      content: 'Had that big client presentation today that I\'d been stressing about all week. Spent the morning listening to my focus playlist and reviewing notes. When I got up to present, something clicked - I stopped trying to be perfect and just talked about what I genuinely believe in about the project. The client loved it. My manager said it was the most authentic presentation I\'ve given. Maybe being "professional" doesn\'t mean being robotic.',
      mood: 'energized',
      energy_level: 5,
      tags: ['work', 'growth', 'presentation'],
      is_analyzed: true,
      created_at: getRelativeDateDays(1),
      updated_at: getRelativeDateDays(1),
      journal_analyses: [{
        id: 'demo-analysis-2',
        themes: ['professional growth', 'authenticity', 'overcoming anxiety'],
        emotions: [
          { emotion: 'pride', intensity: 0.8 },
          { emotion: 'relief', intensity: 0.75 },
          { emotion: 'excitement', intensity: 0.65 }
        ],
        personality_signals: [
          { trait: 'Extraversion', direction: 'high', evidence: 'Thrives when connecting authentically with an audience' },
          { trait: 'Neuroticism', direction: 'low', evidence: 'Transformed pre-event anxiety into a positive experience' }
        ],
        self_perception: {
          how_they_see_themselves: 'Someone discovering that vulnerability and authenticity are strengths, not weaknesses',
          values_expressed: ['authenticity', 'excellence', 'courage']
        },
        summary: 'A breakthrough moment where dropping the mask of perfection revealed their true professional power - connecting through genuine passion.',
        created_at: getRelativeDateDays(1)
      }]
    },
    {
      id: 'demo-journal-3',
      user_id: DEMO_USER.id,
      title: null,
      content: 'Feeling a bit off today. Couldn\'t focus during work, kept jumping between tasks without finishing anything. My sleep tracker shows low recovery and I only slept 5 hours. I know the pattern - late night scrolling leads to bad sleep leads to foggy brain. Need to break the cycle. Put my phone in another room tonight.',
      mood: 'frustrated',
      energy_level: 2,
      tags: ['sleep', 'productivity', 'habits'],
      is_analyzed: true,
      created_at: getRelativeDateDays(3),
      updated_at: getRelativeDateDays(3),
      journal_analyses: [{
        id: 'demo-analysis-3',
        themes: ['sleep quality', 'habit loops', 'self-regulation'],
        emotions: [
          { emotion: 'frustration', intensity: 0.6 },
          { emotion: 'self-awareness', intensity: 0.8 },
          { emotion: 'resolve', intensity: 0.5 }
        ],
        personality_signals: [
          { trait: 'Conscientiousness', direction: 'high', evidence: 'Identifies patterns and creates action plans' },
          { trait: 'Openness', direction: 'high', evidence: 'Uses health data to understand themselves' }
        ],
        self_perception: {
          how_they_see_themselves: 'A self-aware person who recognizes their pitfalls and actively works to overcome them',
          values_expressed: ['self-improvement', 'health', 'discipline']
        },
        summary: 'Even on a tough day, this person shows remarkable self-awareness - they don\'t just feel bad, they diagnose why and plan how to fix it.',
        created_at: getRelativeDateDays(3)
      }]
    },
    {
      id: 'demo-journal-4',
      user_id: DEMO_USER.id,
      title: 'Sunday exploration',
      content: 'Discovered a new coffee shop in a neighborhood I never visit. The barista recommended a single-origin Ethiopian that blew my mind. Sat there for 2 hours reading a book about the history of jazz. It struck me how jazz musicians created something entirely new by combining different traditions. That\'s what I want to do in my work - not just follow the template, but find unexpected combinations that create something original.',
      mood: 'happy',
      energy_level: 4,
      tags: ['exploration', 'creativity', 'inspiration'],
      is_analyzed: true,
      created_at: getRelativeDateDays(4),
      updated_at: getRelativeDateDays(4),
      journal_analyses: [{
        id: 'demo-analysis-4',
        themes: ['exploration', 'creativity', 'cross-pollination of ideas'],
        emotions: [
          { emotion: 'curiosity', intensity: 0.9 },
          { emotion: 'joy', intensity: 0.75 },
          { emotion: 'inspiration', intensity: 0.85 }
        ],
        personality_signals: [
          { trait: 'Openness', direction: 'high', evidence: 'Actively seeks novel experiences and draws creative parallels' },
          { trait: 'Extraversion', direction: 'low', evidence: 'Finds deep fulfillment in solo exploration and reading' }
        ],
        self_perception: {
          how_they_see_themselves: 'A creative explorer who finds inspiration in unexpected places and connections',
          values_expressed: ['curiosity', 'originality', 'cross-disciplinary thinking']
        },
        summary: 'A beautifully curious mind that naturally draws connections between coffee, jazz, and work - seeing creativity as the art of unexpected combinations.',
        created_at: getRelativeDateDays(4)
      }]
    },
    {
      id: 'demo-journal-5',
      user_id: DEMO_USER.id,
      title: 'Grateful for the small things',
      content: 'Quick entry before bed. Today was nothing special on paper - regular meetings, gym session, cooked dinner. But I felt genuinely content. Had a great conversation with a colleague about our side projects. Played with my neighbor\'s dog in the park. Made a new Spotify playlist for evening wind-down. Sometimes the best days are the ones where nothing extraordinary happens but everything just flows.',
      mood: 'grateful',
      energy_level: 3,
      tags: ['gratitude', 'everyday-moments', 'contentment'],
      is_analyzed: true,
      created_at: getRelativeDateDays(5),
      updated_at: getRelativeDateDays(5),
      journal_analyses: [{
        id: 'demo-analysis-5',
        themes: ['gratitude', 'contentment', 'simple pleasures'],
        emotions: [
          { emotion: 'contentment', intensity: 0.85 },
          { emotion: 'gratitude', intensity: 0.9 },
          { emotion: 'warmth', intensity: 0.7 }
        ],
        personality_signals: [
          { trait: 'Agreeableness', direction: 'high', evidence: 'Finds joy in social connections and small kindnesses' },
          { trait: 'Neuroticism', direction: 'low', evidence: 'Appreciates ordinary days without needing excitement' }
        ],
        self_perception: {
          how_they_see_themselves: 'Someone who values the texture of everyday life over dramatic highs',
          values_expressed: ['gratitude', 'connection', 'simplicity']
        },
        summary: 'This person has the rare gift of finding richness in the ordinary - their contentment comes from presence, not achievement.',
        created_at: getRelativeDateDays(5)
      }]
    },
    {
      id: 'demo-journal-6',
      user_id: DEMO_USER.id,
      title: 'Pushing through the resistance',
      content: 'Started working on that personal project I\'ve been procrastinating on for months. The hardest part was just opening the laptop and facing the blank screen. Once I started, ideas began flowing. Got 3 solid hours of work done. It\'s not perfect, but it exists now, and that feels way better than having a "perfect" idea living only in my head. Shipping beats perfecting.',
      mood: 'energized',
      energy_level: 4,
      tags: ['personal-project', 'productivity', 'perfectionism'],
      is_analyzed: true,
      created_at: getRelativeDateDays(6),
      updated_at: getRelativeDateDays(6),
      journal_analyses: [{
        id: 'demo-analysis-6',
        themes: ['overcoming procrastination', 'creative resistance', 'bias toward action'],
        emotions: [
          { emotion: 'determination', intensity: 0.7 },
          { emotion: 'satisfaction', intensity: 0.8 },
          { emotion: 'self-compassion', intensity: 0.6 }
        ],
        personality_signals: [
          { trait: 'Conscientiousness', direction: 'high', evidence: 'Overcame procrastination through deliberate action' },
          { trait: 'Openness', direction: 'high', evidence: 'Values creative output and idea development' }
        ],
        self_perception: {
          how_they_see_themselves: 'A creator who battles perfectionism but knows that action is the antidote',
          values_expressed: ['action', 'imperfection', 'creative courage']
        },
        summary: 'A powerful shift from perfectionist paralysis to creative action - this person is learning that done is better than perfect.',
        created_at: getRelativeDateDays(6)
      }]
    }
  ];

  const insights = {
    totalEntries: entries.length,
    analyzedEntries: entries.length,
    topThemes: [
      { theme: 'mindfulness', count: 3 },
      { theme: 'creativity', count: 3 },
      { theme: 'authenticity', count: 2 },
      { theme: 'self-improvement', count: 2 },
      { theme: 'gratitude', count: 2 },
      { theme: 'professional growth', count: 1 }
    ],
    avgEmotions: [
      { emotion: 'curiosity', avgIntensity: 0.85, occurrences: 3 },
      { emotion: 'gratitude', avgIntensity: 0.8, occurrences: 3 },
      { emotion: 'determination', avgIntensity: 0.7, occurrences: 3 },
      { emotion: 'contentment', avgIntensity: 0.82, occurrences: 2 },
      { emotion: 'pride', avgIntensity: 0.75, occurrences: 1 }
    ],
    moodDistribution: {
      reflective: 1,
      energized: 2,
      frustrated: 1,
      happy: 1,
      grateful: 1
    },
    avgEnergy: 3.7,
    valuesExpressed: ['mindfulness', 'authenticity', 'curiosity', 'self-improvement', 'gratitude', 'creativity', 'courage'],
    personalitySignals: [
      { trait: 'Openness', direction: 'high', evidence: 'Consistently seeks novel experiences and creative connections' },
      { trait: 'Conscientiousness', direction: 'high', evidence: 'Self-aware and creates action plans for improvement' },
      { trait: 'Neuroticism', direction: 'low', evidence: 'Finds contentment in ordinary moments' }
    ],
    recentSummaries: [
      'This entry reveals someone who craves authentic presence and is actively reclaiming their attention from the noise of modern life.',
      'A breakthrough moment where dropping the mask of perfection revealed their true professional power.',
      'Even on a tough day, this person shows remarkable self-awareness.'
    ]
  };

  return { entries, insights };
};
