/**
 * Clay3DIcon - Renders 3D clay-style icons from thiings.co
 *
 * Icons are stored locally in /public/icons/3d/
 * Available icons: brain, headphones, robot, diamond, game-controller,
 * lightning, shield, sparkle, heart, globe, star, chat-bubble,
 * light-bulb, magnifying-glass, compass, trophy, rocket
 */

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

export const Clay3DIcon = ({ name, size = 'md', className = '', alt }: Clay3DIconProps) => {
  const px = typeof size === 'number' ? size : SIZE_MAP[size] || 28;

  return (
    <img
      src={`/icons/3d/${name}.png`}
      alt={alt || name}
      width={px}
      height={px}
      className={`inline-block object-contain ${className}`}
      style={{ width: px, height: px }}
      loading="lazy"
    />
  );
};

// Mapping of nav/feature concepts to 3D icon names
export const CLAY_ICON_MAP: Record<string, string> = {
  // Main nav
  dashboard: 'rocket',
  me: 'heart',
  'connect-data': 'globe',
  'soul-signature': 'heart',
  brain: 'brain',
  journal: 'light-bulb',
  personality: 'heart',
  chat: 'chat-bubble',
  // Insights
  'spotify-insights': 'headphones',
  'calendar-insights': 'compass',
  'youtube-insights': 'star',
  'web-insights': 'globe',
  // Features
  privacy: 'shield',
  achievements: 'trophy',
  ai: 'robot',
  discovery: 'magnifying-glass',
  premium: 'diamond',
};

export default Clay3DIcon;
