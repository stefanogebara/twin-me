import { icons, type LucideIcon } from 'lucide-react';

interface Clay3DIconProps {
  name: string;
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  alt?: string;
}

const SIZE_MAP: Record<string, number> = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 40,
  xl: 64,
};

/** Explicit remap for icon names that don't auto-convert to PascalCase Lucide names */
const REMAP: Record<string, string> = {
  'chat-bubble': 'MessageCircle',
  'game-controller': 'Gamepad2',
  'light-bulb': 'Lightbulb',
  'magnifying-glass': 'Search',
  brain: 'Brain',
  compass: 'Compass',
  diamond: 'Gem',
  globe: 'Globe',
  headphones: 'Headphones',
  heart: 'Heart',
  lightning: 'Zap',
  robot: 'Bot',
  rocket: 'Rocket',
  shield: 'Shield',
  sparkle: 'Sparkles',
  star: 'Star',
  trophy: 'Trophy',
};

function toPascalCase(s: string): string {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function resolve(name: string): LucideIcon | undefined {
  const mapped = REMAP[name] ?? toPascalCase(name);
  return (icons as Record<string, LucideIcon>)[mapped];
}

export const Clay3DIcon = ({ name, size = 'md', className = '' }: Clay3DIconProps) => {
  const px = typeof size === 'number' ? size : SIZE_MAP[size] || 28;
  const IconComponent = resolve(name);

  if (!IconComponent) {
    if (import.meta.env.DEV) {
      console.warn(`[Clay3DIcon] No Lucide mapping for "${name}"`);
    }
    return <span data-missing-icon={name} style={{ width: px, height: px }} className="inline-block shrink-0" />;
  }

  return <IconComponent size={px} className={`inline-block shrink-0 ${className}`} />;
};

// Mapping of nav/feature concepts to icon names
export const CLAY_ICON_MAP: Record<string, string> = {
  // Main nav
  dashboard: 'rocket',
  'connect-data': 'globe',
  'soul-signature': 'sparkle',
  brain: 'brain',
  journal: 'light-bulb',
  personality: 'heart',
  chat: 'chat-bubble',
  // Insights
  'spotify-insights': 'headphones',
  'whoop-insights': 'lightning',
  'calendar-insights': 'compass',
  'youtube-insights': 'star',
  'twitch-insights': 'game-controller',
  'web-insights': 'globe',
  // Features
  privacy: 'shield',
  achievements: 'trophy',
  ai: 'robot',
  discovery: 'magnifying-glass',
  premium: 'diamond',
};

export default Clay3DIcon;
