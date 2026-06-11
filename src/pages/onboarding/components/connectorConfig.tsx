import React from 'react';
import { DataProvider } from '@/types/data-integration';

// ====================================================================
// SVG LOGO COMPONENTS
// ====================================================================

const SpotifyLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const YoutubeLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const DiscordLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const GmailLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
  </svg>
);

const CalendarLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
  </svg>
);

const GithubLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);


const WhoopLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="3 13 40 22" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.47,26.68l-3.7097,-11.047" />
    <path d="M18.38,32.368l5.6196,-16.735" />
    <path d="M25.91,21.32l3.7097,11.047,5.6196,-16.735" />
  </svg>
);

const BrowserExtensionLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
  </svg>
);

const OutlookLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    <path d="M19.484 7.937v5.477l1.916 1.205a.489.489 0 00.21.063.5.5 0 00.229-.063l5.677-3.416a.476.476 0 00-.026-.063.9.9 0 00-.379-.334l-6.417-3.326a1.837 1.837 0 00-1.21.457z" fill="currentColor"/>
    <path d="M19.484 15.457l1.747 1.2a.522.522 0 00.543 0c-.3.181 5.947-3.627 5.947-3.627a1.149 1.149 0 00.479-.756v9.566a1.67 1.67 0 01-.485 1.16 1.678 1.678 0 01-1.167.489h-7.064v-8.032z" fill="currentColor"/>
    <path d="M10.44 12.932a1.032 1.032 0 00-1.034 1.034v4.085a1.034 1.034 0 102.069 0v-4.085a1.032 1.032 0 00-1.035-1.034z" fill="currentColor"/>
    <path d="M1.441 9.186v13.628a1.812 1.812 0 001.812 1.812h14.225V7.374H3.253a1.812 1.812 0 00-1.812 1.812zm9 11.812a3.1 3.1 0 01-3.1-3.1v-4.085a3.1 3.1 0 016.2 0v4.085a3.1 3.1 0 01-3.1 3.1z" fill="currentColor"/>
  </svg>
);

// ====================================================================
// CONNECTOR CONFIGURATION
// ====================================================================

export interface ConnectorConfig {
  provider: DataProvider;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  dataTypes: string[];
  estimatedInsights: number;
  setupTime: string;
  privacyLevel: 'low' | 'medium' | 'high';
  category: 'entertainment' | 'social' | 'professional' | 'health' | 'browsing';
  comingSoon?: boolean;
  // Demoted platforms (replan-2026-06-10 Track C): keep working for already-
  // connected users (catalog entry needed for the Connected list), but never
  // render a discovery/featured tile inviting new connections.
  unlisted?: boolean;
  externalUrl?: string; // For non-OAuth connectors (e.g. Chrome Web Store)
  // Inline caveat shown beneath the description (e.g. "Work/school accounts only").
  // Use for known platform limitations so users learn upfront instead of via silent
  // sync failures. Keep under 60 chars.
  note?: string;
}

export const AVAILABLE_CONNECTORS: ConnectorConfig[] = [
  {
    provider: 'browser_extension',
    name: 'Browser Extension',
    description: 'Track everything you browse — pages visited, reading time, content topics, search queries, and engagement patterns',
    icon: <BrowserExtensionLogo className="w-6 h-6" />,
    color: 'var(--accent-vibrant)',
    dataTypes: ['Browsing History', 'Reading Depth', 'Search Queries', 'Content Topics'],
    estimatedInsights: 20,
    setupTime: '30 seconds',
    privacyLevel: 'medium',
    category: 'browsing',
    externalUrl: 'https://chromewebstore.google.com/detail/twinme/ajcjojimfedkcaamgegebgcdakdlhffi',
  },
  {
    provider: 'spotify',
    name: 'Spotify',
    description: 'Your music reveals your mood patterns, energy levels, and authentic taste',
    icon: <SpotifyLogo className="w-6 h-6" />,
    color: '#1DB954',
    dataTypes: ['Music Taste', 'Mood Patterns', 'Energy Levels'],
    estimatedInsights: 12,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'entertainment'
  },
  {
    provider: 'google_calendar',
    name: 'Google Calendar',
    description: 'Your schedule reveals work patterns, social habits, and how you manage time',
    icon: <CalendarLogo className="w-6 h-6" />,
    color: '#4285F4',
    dataTypes: ['Work Patterns', 'Time Management', 'Event Context'],
    estimatedInsights: 8,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'professional'
  },
  {
    provider: 'youtube' as DataProvider,
    name: 'YouTube',
    description: 'Your viewing patterns reveal learning interests, entertainment preferences, and content curiosities',
    icon: <YoutubeLogo className="w-6 h-6" />,
    color: '#FF0000',
    dataTypes: ['Watch History', 'Subscriptions', 'Liked Videos'],
    estimatedInsights: 10,
    setupTime: '10 seconds',
    privacyLevel: 'low',
    category: 'entertainment'
  },
  {
    provider: 'discord' as DataProvider,
    name: 'Discord',
    description: 'Your server activity reveals community interests, communication style, and social identity',
    icon: <DiscordLogo className="w-6 h-6" />,
    color: '#5865F2',
    dataTypes: ['Server Activity', 'Interests', 'Community'],
    estimatedInsights: 7,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'social',
    // Demoted (replan-2026-06-10 Track C): existing Discord connections keep
    // working and syncing, but the platform is no longer featured for new
    // connections — the extension + GDPR upload cover the same signal.
    unlisted: true,
  },
  {
    provider: 'instagram' as DataProvider,
    name: 'Instagram',
    description: 'Your saved posts and aesthetic — what you bookmark reveals your taste, interests, and the worlds you return to',
    icon: <span className="w-6 h-6 inline-flex items-center justify-center text-[#F5F5F4]">IG</span>,
    color: '#E4405F',
    dataTypes: ['Saved Posts', 'Your Posts'],
    estimatedInsights: 8,
    setupTime: '2 minutes (cookie export)',
    privacyLevel: 'medium',
    category: 'social'
  },
  {
    provider: 'google_gmail' as DataProvider,
    name: 'Gmail',
    description: 'Email patterns reveal communication habits, network breadth, and how you organize your digital life',
    icon: <GmailLogo className="w-6 h-6" />,
    color: '#EA4335',
    dataTypes: ['Email Patterns', 'Network Breadth', 'Communication Style'],
    estimatedInsights: 7,
    setupTime: '5 seconds',
    privacyLevel: 'medium',
    category: 'professional',
    comingSoon: true,
  },
  {
    provider: 'github' as DataProvider,
    name: 'GitHub',
    description: 'Your repositories and activity reveal how you think about problems and what you build',
    icon: <GithubLogo className="w-6 h-6" />,
    color: '#24292F',
    dataTypes: ['Projects', 'Coding Patterns', 'Tech Interests'],
    estimatedInsights: 6,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'professional',
    // comingSoon flag cleared 2026-06-10 (audit settings-dead-connect): the
    // GitHub OAuth flow is fully wired (POST /entertainment/connect/github +
    // oauth-callback.js) — flag was a leftover hiding the tile from
    // /get-started, dead-ending Settings' Connect button.
  },
  {
    provider: 'whoop' as DataProvider,
    name: 'Whoop',
    description: 'Recovery, strain, and sleep data reveal how your body responds to stress and shapes your daily energy',
    icon: <WhoopLogo className="w-6 h-6" />,
    color: '#44A8B3',
    dataTypes: ['Recovery Score', 'Strain', 'Sleep Quality', 'HRV Trends'],
    estimatedInsights: 8,
    setupTime: '10 seconds',
    privacyLevel: 'low',
    category: 'health',
    // comingSoon flag cleared 2026-05-22: Whoop has been functional for
    // months (audit user has 97 historical observations from 2026-04-12
    // and earlier; Nango whoop provider is fully wired in
    // api/routes/nango.js + api/services/observationFetchers/whoop.js).
    // The flag was leftover from pre-Nango launch and was hiding the
    // tile from /connect, blocking the reconnect flow entirely.
  },
  {
    provider: 'microsoft_outlook' as DataProvider,
    name: 'Outlook',
    description: 'Email patterns and calendar events reveal how you structure your professional life and communicate',
    icon: <OutlookLogo className="w-6 h-6" />,
    color: '#0078D4',
    dataTypes: ['Email Patterns', 'Calendar Events', 'Communication Style'],
    estimatedInsights: 7,
    setupTime: '10 seconds',
    privacyLevel: 'medium',
    category: 'professional',
    // Microsoft's app registration is configured for organizational tenants only.
    // Personal accounts (live.com, outlook.com, hotmail.com) get past OAuth but
    // Microsoft Graph rejects subsequent calls with AADSTS50194-class errors and
    // sync silently fails. Warning users upfront avoids the dead-end experience.
    note: 'Work or school account required',
    // Demoted (replan-2026-06-10 Track C): existing Outlook connections keep
    // working; no featured tile for new connections.
    unlisted: true,
  },
];
