// ── Design tokens (dark-only) ──────────────────────────────────────────
export const T = {
  BG:       'var(--background)',
  FG:       '#fdfcfb',
  TEXT_SEC: '#a09898',
  TEXT_PH:  '#86807b',
  CARD_BG:  'rgba(255, 255, 255, 0.02)',
  CARD_BDR: 'var(--glass-surface-border)',
  BENTO_BG: 'rgba(255, 255, 255, 0.02)',
  CTA_BG:   '#fdfcfb',
  CTA_FG:   'var(--primary-foreground)',
  SIGN_UP_BG: '#fdfcfb',
  SIGN_UP_FG: '#222528',
  GHOST_BG: 'rgba(255, 255, 255, 0.02)',
};

// ── Hero glow: RADIAL gradient (Figma exact — two stacked 455.74px ellipses) ──
export const HERO_GLOW_GRADIENT = `radial-gradient(ellipse at 50% 50%,
  rgba(193,126,44,1)     0%,
  rgba(232,224,212,0.85)   12%,
  rgba(224,129,22,0.6)   28%,
  rgba(194,85,78,0.35)   50%,
  rgba(195,45,112,0.1)   72%,
  rgba(195,45,112,0)     100%
)`;

// ── Pricing / section accent: RADIAL amber gradient (Figma pricing SVG exact) ──
export const AMBER_GLOW_CSS = `radial-gradient(ellipse at 51.1% 127.3%,
  rgba(195,45,112,0)     0%,  rgba(194,85,78,0.5)    9.375%,
  rgba(193,126,44,1)     18.75%, rgba(224,129,22,0.8) 32.452%,
  rgba(232,224,212,0.6)    46.154%, rgba(218,128,26,0.525) 53.245%,
  rgba(181,124,52,0.45)  60.337%, rgba(108,117,103,0.3) 74.519%,
  rgba(108,117,103,0)    96.635%
)`;

// Footer: 3 layered gradients (from Figma footer frame exact SVG transforms)
export const FOOTER_GLOW_1 = `radial-gradient(ellipse at 51.1% 127.3%,
  rgba(195,45,112,0) 0%, rgba(194,85,78,0.5) 9.375%,
  rgba(193,126,44,1) 18.75%, rgba(224,129,22,0.8) 32.452%,
  rgba(232,224,212,0.6) 46.154%, rgba(218,128,26,0.525) 53.245%,
  rgba(181,124,52,0.45) 60.337%, rgba(108,117,103,0.3) 74.519%,
  rgba(108,117,103,0) 96.635%
)`;
export const FOOTER_GLOW_2 = `radial-gradient(ellipse at 56.8% 130%,
  rgba(195,45,112,0) 0%, rgba(225,88,56,0.3) 10.577%,
  rgba(240,110,28,0.45) 15.865%, rgba(232,224,212,0.6) 21.154%,
  rgba(224,129,22,0.8) 29.087%, rgba(193,126,44,1) 37.019%,
  rgba(185,101,74,0.65) 55.769%, rgba(177,76,105,0.3) 74.519%,
  rgba(73,56,57,0) 96.635%
)`;
export const FOOTER_GLOW_3 = `radial-gradient(ellipse at 45.3% 148%,
  rgba(195,45,112,0) 0%, rgba(146,34,67,0.3) 10.577%,
  rgba(97,22,22,0.6) 21.154%, rgba(157,49,11,0.55) 29.087%,
  rgba(217,76,0,0.5) 37.019%, rgba(202,78,22,0.475) 41.707%,
  rgba(186,80,44,0.45) 46.394%, rgba(155,84,87,0.4) 55.769%,
  rgba(93,92,174,0.3) 74.519%, rgba(73,56,57,0) 96.635%
)`;

export const PLATFORM_LOGOS = ['Spotify', 'YouTube', 'Discord', 'LinkedIn', 'Whoop'];

export const FAQ_ITEMS = [
  { q: 'What is a soul signature?' },
  { q: 'How is my data used?' },
  { q: 'What platforms can I connect?' },
  { q: 'How accurate is the twin?' },
  { q: 'Can I delete my data?' },
  { q: 'Does TwinMe train AI on my data?' },
  { q: 'How long until my twin feels like me?' },
];

export const FAQ_ANSWERS: Record<string, string> = {
  'What is a soul signature?':
    'Your soul signature is a living AI portrait of your authentic self — patterns, preferences, and personality traits derived from how you actually behave across platforms.',
  'How is my data used?':
    'Your data never leaves our secure infrastructure and is never used to train AI models. You own your soul signature completely.',
  'What platforms can I connect?':
    'Spotify, Google Calendar, YouTube, Gmail, Discord, LinkedIn, GitHub, Reddit, Whoop, Twitch, and Google Drive. Plus a browser extension for web activity.',
  'How accurate is the twin?':
    'Twin accuracy improves over time as memories accumulate. Most users notice meaningful personality alignment within a few days of connecting platforms.',
  'Can I delete my data?':
    'Yes. You can delete any memory, any platform connection, or your entire soul signature at any time from Settings.',
  'Does TwinMe train AI on my data?':
    'Never. Your memories are yours alone. They are used only to power your personal twin, nothing else.',
  'How long until my twin feels like me?':
    'Connect 2–3 platforms and chat for a day — most users feel the difference immediately. The twin deepens over weeks.',
};
