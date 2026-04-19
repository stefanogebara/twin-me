import React from 'react';
import { FileText } from 'lucide-react';
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

const RedditLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
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

const SlackLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
  </svg>
);

const LinkedInLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const GithubLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);


const OuraLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

const StravaLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0 4 13.828h4.172"/>
  </svg>
);

const WhoopLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="3 13 40 22" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.47,26.68l-3.7097,-11.047" />
    <path d="M18.38,32.368l5.6196,-16.735" />
    <path d="M25.91,21.32l3.7097,11.047,5.6196,-16.735" />
  </svg>
);

const FitbitLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="4" r="2.5"/>
    <circle cx="12" cy="12" r="2.5"/>
    <circle cx="12" cy="20" r="2.5"/>
    <circle cx="4" cy="8" r="2"/>
    <circle cx="4" cy="16" r="2"/>
    <circle cx="20" cy="8" r="2"/>
    <circle cx="20" cy="16" r="2"/>
  </svg>
);

const GarminLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
    <path d="M12 4c-4.42 0-8 3.58-8 8h2c0-3.31 2.69-6 6-6s6 2.69 6 6h2c0-4.42-3.58-8-8-8z"/>
  </svg>
);

const TwitchLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
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
  externalUrl?: string; // For non-OAuth connectors (e.g. Chrome Web Store)
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
    category: 'social'
  },
  {
    provider: 'linkedin' as DataProvider,
    name: 'LinkedIn',
    description: 'Your professional network reveals career trajectory, skills, and how you present yourself professionally',
    icon: <LinkedInLogo className="w-6 h-6" />,
    color: '#0077B5',
    dataTypes: ['Career History', 'Skills', 'Professional Network'],
    estimatedInsights: 9,
    setupTime: '10 seconds',
    privacyLevel: 'medium',
    category: 'professional'
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
    provider: 'reddit' as DataProvider,
    name: 'Reddit',
    description: 'The communities you follow reveal your real interests, curiosities, and intellectual depth',
    icon: <RedditLogo className="w-6 h-6" />,
    color: '#FF4500',
    dataTypes: ['Community Interests', 'Content Preferences', 'Curiosities'],
    estimatedInsights: 8,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'social',
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
    comingSoon: true,
  },
  {
    provider: 'slack' as DataProvider,
    name: 'Slack',
    description: 'Workspace channels reveal professional focus areas, team dynamics, and how you collaborate',
    icon: <SlackLogo className="w-6 h-6" />,
    color: '#4A154B',
    dataTypes: ['Work Focus', 'Collaboration Style', 'Channel Interests'],
    estimatedInsights: 5,
    setupTime: '5 seconds',
    privacyLevel: 'medium',
    category: 'professional',
    comingSoon: true,
  },
  {
    provider: 'strava' as DataProvider,
    name: 'Strava',
    description: 'Training data reveals discipline, consistency, and how physical effort shapes your mindset',
    icon: <StravaLogo className="w-6 h-6" />,
    color: '#FC4C02',
    dataTypes: ['Fitness Activities', 'Training Patterns', 'Consistency'],
    estimatedInsights: 7,
    setupTime: '10 seconds',
    privacyLevel: 'low',
    category: 'health'
  },
  {
    provider: 'oura' as DataProvider,
    name: 'Oura Ring',
    description: 'Sleep, HRV, and recovery data reveal how your biology shapes your mood and energy patterns',
    icon: <OuraLogo className="w-6 h-6" />,
    color: '#6366F1',
    dataTypes: ['Sleep Quality', 'Recovery', 'HRV Trends'],
    estimatedInsights: 9,
    setupTime: '10 seconds',
    privacyLevel: 'low',
    category: 'health'
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
    comingSoon: true,
  },
  {
    provider: 'fitbit' as DataProvider,
    name: 'Fitbit',
    description: 'Steps, sleep, and heart rate data reveal your daily activity rhythm and recovery patterns',
    icon: <FitbitLogo className="w-6 h-6" />,
    color: '#00B0B9',
    dataTypes: ['Steps', 'Sleep Quality', 'Heart Rate', 'Activity Zones'],
    estimatedInsights: 8,
    setupTime: '10 seconds',
    privacyLevel: 'low',
    category: 'health'
  },
  {
    provider: 'garmin' as DataProvider,
    name: 'Garmin',
    description: 'Training load, recovery, and VO2 max reveal your fitness discipline and how you push your limits',
    icon: <GarminLogo className="w-6 h-6" />,
    color: '#007CC3',
    dataTypes: ['Training Load', 'Recovery', 'VO2 Max', 'Body Battery'],
    estimatedInsights: 7,
    setupTime: '10 seconds',
    privacyLevel: 'low',
    category: 'health'
  },
  {
    provider: 'twitch' as DataProvider,
    name: 'Twitch',
    description: 'Followed channels and watch patterns reveal your gaming identity and community interests',
    icon: <TwitchLogo className="w-6 h-6" />,
    color: '#9146FF',
    dataTypes: ['Followed Channels', 'Watch Patterns', 'Game Preferences'],
    estimatedInsights: 6,
    setupTime: '5 seconds',
    privacyLevel: 'low',
    category: 'entertainment',
    comingSoon: true,
  },
  {
    provider: 'notion' as DataProvider,
    name: 'Notion',
    description: 'Journals, goals, reading lists, life OS pages — the richest authentic self-record available.',
    icon: <FileText className="w-6 h-6" />,
    color: '#000000',
    dataTypes: ['Journals', 'Goals', 'Reading Lists', 'Life OS'],
    estimatedInsights: 15,
    setupTime: '15 seconds',
    privacyLevel: 'high',
    category: 'professional',
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
    category: 'professional'
  },
];
