// All static mock data for Sundust prototype pages

export const mockUser = {
  name: 'Stefano',
  email: 'stefanogebara@gmail.com',
  avatar: 'S',
  archetype: 'The Empathetic Obsessive',
  twinReadiness: 74,
};

export const mockPlatforms = [
  { id: 'spotify',  name: 'Spotify',   icon: '🎵', connected: true,  lastSync: '19m ago', memoriesAdded: 1240 },
  { id: 'calendar', name: 'Calendar',  icon: '📅', connected: true,  lastSync: '19m ago', memoriesAdded: 380  },
  { id: 'youtube',  name: 'YouTube',   icon: '▶️',  connected: true,  lastSync: '19m ago', memoriesAdded: 560  },
  { id: 'whoop',    name: 'Whoop',     icon: '💪', connected: true,  lastSync: '9d ago',  memoriesAdded: 210  },
  { id: 'twitch',   name: 'Twitch',    icon: '🎮', connected: true,  lastSync: '9d ago',  memoriesAdded: 95   },
  { id: 'linkedin', name: 'LinkedIn',  icon: '💼', connected: false, lastSync: null,      memoriesAdded: 0    },
  { id: 'discord',  name: 'Discord',   icon: '💬', connected: false, lastSync: null,      memoriesAdded: 0    },
];

export const mockInsights = [
  { id: '1', category: 'Personality', icon: '✨', title: 'Deep focus windows', body: 'You consistently enter flow state between 10pm–2am — 3× more likely than any other time.', urgency: 'high' },
  { id: '2', category: 'Music',       icon: '🎵', title: 'Mood-music correlation', body: 'Drake appears in 73% of your late-night sessions. You gravitate to introspective lyrics when processing.', urgency: 'medium' },
  { id: '3', category: 'Lifestyle',   icon: '💤', title: 'Sleep and creativity', body: 'Your best code commits happen 18–24h after 7+ hours of sleep. Recovery drives your output.', urgency: 'medium' },
  { id: '4', category: 'Social',      icon: '🔗', title: 'Communication style', body: 'You write 40% longer messages when genuinely curious. Depth signals your interest.', urgency: 'low' },
];

export const mockMessages = [
  { id: '1', role: 'assistant' as const, content: "Hey! What's on your mind today?", timestamp: '10:42 PM' },
  { id: '2', role: 'user'      as const, content: "I've been feeling unfocused lately. Like I can't get into flow state the way I used to.", timestamp: '10:43 PM' },
  { id: '3', role: 'assistant' as const, content: "That tracks — your deep focus windows have shifted. Based on your recent Whoop data, your HRV has been lower than usual this week, which typically correlates with the scattered feeling you're describing. You're not broken, you're just under-recovered. When did you last have a genuine rest day?", timestamp: '10:43 PM' },
];

export const mockGoals = [
  { id: '1', title: 'Read 20 books this year', progress: 35, unit: 'books', current: 7, target: 20 },
  { id: '2', title: 'Run 500km this year',      progress: 22, unit: 'km',    current: 110, target: 500 },
  { id: '3', title: 'Sleep 7+ hours avg',       progress: 68, unit: '%',     current: 6.8, target: 7.5 },
];

export const mockMemoryStats = {
  total: 16420,
  facts: 8163,
  reflections: 4446,
  conversations: 2035,
  platform_data: 1776,
};

export const mockExpertProfiles = [
  {
    id: 'personality',
    label: 'Personality',
    icon: '🧠',
    headline: 'The Empathetic Obsessive',
    summary: 'You blend rare emotional intelligence with intense intellectual focus. You form deep connections fast but need solitude to recharge. Openness: 0.89 / Conscientiousness: 0.71.',
    traits: ['High openness', 'Ambivert', 'Detail-oriented', 'Introspective'],
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    icon: '⚡',
    headline: 'Night Owl Optimizer',
    summary: 'Peak productivity between 10pm–2am. You stack recovery intentionally — sleep gates your creative output. Average HRV 62ms, above the 78th percentile.',
    traits: ['Late-night focus', 'Recovery-driven', 'Routine builder', 'Health-aware'],
  },
  {
    id: 'cultural',
    label: 'Cultural Identity',
    icon: '🎨',
    headline: 'The Aesthetic Technologist',
    summary: 'You fuse engineering rigor with aesthetic sensibility. Music taste spans Brazilian pagode to Radiohead — emotional range reflected in your playlists.',
    traits: ['Visual thinker', 'Eclectic taste', 'Quality over quantity', 'Brazilian roots'],
  },
  {
    id: 'social',
    label: 'Social Dynamics',
    icon: '🔗',
    headline: 'Deep Connector',
    summary: 'You invest deeply in a small circle. Communication lengthens when genuinely curious — depth is your love language. Strong async preference.',
    traits: ['Small circle', 'Async communicator', 'Loyal', 'Curiosity-driven'],
  },
  {
    id: 'motivation',
    label: 'Motivation',
    icon: '🎯',
    headline: 'Impact-Driven Builder',
    summary: 'Intrinsic motivation dominates. You need to believe in what you\u2019re building. Decision-making is research-heavy — you gather data before committing.',
    traits: ['Intrinsic motivation', 'Builder mindset', 'Research-first', 'Long-term focus'],
  },
];

export const mockCalendarEvents = [
  { id: '1', title: 'Team standup',         time: '9:00 AM',  duration: '30m' },
  { id: '2', title: 'Deep work: TwinMe UI', time: '10:00 AM', duration: '2h' },
  { id: '3', title: 'Lunch',                time: '1:00 PM',  duration: '1h' },
  { id: '4', title: 'Investor call prep',   time: '3:00 PM',  duration: '1h' },
];

export const mockSuggestions = [
  { id: '1', icon: '✨', label: 'How am I doing?' },
  { id: '2', icon: '🎯', label: 'What should I focus on?' },
  { id: '3', icon: '🌙', label: 'Tell me something new' },
  { id: '4', icon: '🧬', label: 'My personality insights' },
];
