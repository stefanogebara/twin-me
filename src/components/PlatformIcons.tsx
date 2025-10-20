/**
 * Platform Icons Component
 * Centralized icon management for all supported platforms
 */

import React from 'react';
import {
  Music,
  Play,
  Video,
  Tv,
  Radio,
  Headphones,
  Book,
  BookOpen,
  Newspaper,
  Heart,
  Activity,
  Coffee,
  ShoppingBag,
  MessageCircle,
  MessageSquare,
  Hash,
  Camera,
  Send,
  Mail,
  Calendar,
  Github,
  Briefcase,
  FileText,
  Users,
  Globe,
  Gamepad2,
  Trophy,
  Monitor,
  Smartphone,
  Chrome,
  Cloud,
  Server,
  Database,
  Sparkles,
  Brain,
  User,
  Zap,
  TrendingUp,
  Youtube,
  Twitter,
  Linkedin,
  Instagram,
  Facebook
} from 'lucide-react';

// Platform to Icon mapping
export const platformIconMap: Record<string, React.ElementType> = {
  // Music Platforms
  spotify: Music,
  'apple-music': Headphones,
  appleMusic: Headphones,
  soundcloud: Radio,
  pandora: Radio,
  tidal: Music,
  deezer: Music,
  'youtube-music': Youtube,
  youtubeMusic: Youtube,

  // Video Streaming
  netflix: Tv,
  hbomax: Play,
  'hbo-max': Play,
  disney: Video,
  'disney-plus': Video,
  disneyPlus: Video,
  hulu: Tv,
  'prime-video': Play,
  primeVideo: Play,
  peacock: Tv,
  paramount: Video,
  'apple-tv': Monitor,
  appleTv: Monitor,

  // Social Media
  youtube: Youtube,
  twitter: Twitter,
  'x-twitter': Twitter,
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  tiktok: Video,
  snapchat: Camera,
  pinterest: Heart,
  reddit: MessageSquare,
  tumblr: Globe,
  mastodon: Hash,

  // Communication
  discord: MessageSquare,
  slack: Hash,
  whatsapp: MessageCircle,
  telegram: Send,
  signal: MessageCircle,
  messenger: MessageCircle,
  teams: Users,
  'microsoft-teams': Users,
  zoom: Video,

  // Professional
  github: Github,
  gitlab: Github,
  bitbucket: Github,
  stackoverflow: Database,
  'stack-overflow': Database,
  medium: BookOpen,
  'dev-to': FileText,
  hashnode: Hash,

  // Gaming
  steam: Gamepad2,
  epic: Gamepad2,
  'epic-games': Gamepad2,
  playstation: Gamepad2,
  xbox: Gamepad2,
  nintendo: Gamepad2,
  twitch: Video,
  'battle-net': Gamepad2,
  battlenet: Gamepad2,
  origin: Gamepad2,
  ubisoft: Gamepad2,
  gog: Gamepad2,

  // Productivity
  gmail: Mail,
  outlook: Mail,
  calendar: Calendar,
  'google-calendar': Calendar,
  googleCalendar: Calendar,
  notion: FileText,
  obsidian: Brain,
  evernote: FileText,
  todoist: FileText,
  trello: Users,
  asana: Briefcase,
  monday: Calendar,
  clickup: TrendingUp,

  // Health & Fitness
  strava: Activity,
  fitbit: Activity,
  myfitnesspal: Heart,
  'my-fitness-pal': Heart,
  garmin: Activity,
  peloton: Activity,
  nike: Activity,
  adidas: Activity,
  headspace: Brain,
  calm: Brain,

  // Food & Delivery
  ubereats: Coffee,
  'uber-eats': Coffee,
  doordash: ShoppingBag,
  grubhub: Coffee,
  postmates: ShoppingBag,
  instacart: ShoppingBag,
  seamless: Coffee,

  // News & Reading
  kindle: Book,
  audible: Headphones,
  goodreads: BookOpen,
  'new-york-times': Newspaper,
  nyt: Newspaper,
  'washington-post': Newspaper,
  bbc: Globe,
  cnn: Globe,
  'the-guardian': Newspaper,
  reuters: Globe,
  'apple-news': Newspaper,
  appleNews: Newspaper,
  flipboard: Newspaper,
  pocket: BookOpen,
  feedly: FileText,

  // Learning
  coursera: BookOpen,
  udemy: BookOpen,
  'khan-academy': BookOpen,
  khanAcademy: BookOpen,
  duolingo: Globe,
  skillshare: Zap,
  masterclass: Trophy,
  'linkedin-learning': Briefcase,
  linkedinLearning: Briefcase,
  pluralsight: Monitor,
  edx: BookOpen,

  // Browser & Extensions
  chrome: Chrome,
  firefox: Globe,
  safari: Globe,
  edge: Globe,
  brave: Globe,
  opera: Globe,

  // Cloud Storage
  dropbox: Cloud,
  'google-drive': Cloud,
  googleDrive: Cloud,
  onedrive: Cloud,
  icloud: Cloud,
  box: Server,

  // Default fallback
  default: Sparkles
};

// Get icon for a platform
export const getPlatformIcon = (platform: string): React.ElementType => {
  // Normalize platform name (lowercase, remove spaces)
  const normalized = platform.toLowerCase().replace(/\s+/g, '-');
  return platformIconMap[normalized] || platformIconMap[platform] || Sparkles;
};

// Platform colors for consistent styling
export const platformColors: Record<string, string> = {
  // Music
  spotify: '#1DB954',
  'apple-music': '#FC3C44',
  soundcloud: '#FF5500',
  youtube: '#FF0000',
  'youtube-music': '#FF0000',

  // Video
  netflix: '#E50914',
  'disney-plus': '#006E99',
  hulu: '#3DBB3D',
  'prime-video': '#00A8E1',
  'hbo-max': '#B535F6',

  // Social
  twitter: '#1DA1F2',
  instagram: '#E4405F',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
  tiktok: '#000000',
  reddit: '#FF4500',
  discord: '#5865F2',

  // Professional
  github: '#181717',
  slack: '#4A154B',
  gmail: '#EA4335',

  // Gaming
  steam: '#00ADEE',
  twitch: '#9146FF',
  playstation: '#003087',
  xbox: '#107C10',

  // Default
  default: '#D97706' // Claude orange
};

// Get color for a platform
export const getPlatformColor = (platform: string): string => {
  const normalized = platform.toLowerCase().replace(/\s+/g, '-');
  return platformColors[normalized] || platformColors[platform] || platformColors.default;
};

// Platform Icon Component with consistent styling
interface PlatformIconProps {
  platform: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  colored?: boolean;
}

export const PlatformIcon: React.FC<PlatformIconProps> = ({
  platform,
  className = '',
  size = 'md',
  colored = false
}) => {
  const Icon = getPlatformIcon(platform);
  const color = colored ? getPlatformColor(platform) : undefined;

  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-8 h-8'
  };

  return (
    <Icon
      className={`${sizes[size]} ${className}`}
      style={colored ? { color } : undefined}
    />
  );
};

// Platform Badge Component
interface PlatformBadgeProps {
  platform: string;
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({
  platform,
  showName = true,
  size = 'md'
}) => {
  const Icon = getPlatformIcon(platform);
  const color = getPlatformColor(platform);

  const sizes = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-2.5 py-1.5',
    lg: 'text-base px-3 py-2'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full ${sizes[size]} font-medium`}
      style={{
        backgroundColor: `${color}15`,
        color: color,
        border: `1px solid ${color}30`
      }}
    >
      <Icon className={iconSizes[size]} />
      {showName && (
        <span className="capitalize">
          {platform.replace(/[-_]/g, ' ')}
        </span>
      )}
    </div>
  );
};

export default {
  getPlatformIcon,
  getPlatformColor,
  PlatformIcon,
  PlatformBadge,
  platformIconMap,
  platformColors
};