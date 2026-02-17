import { useTheme } from '@/contexts/ThemeContext';

export function useBrainThemeColors() {
  const { theme } = useTheme();

  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e';
  const textMuted = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c';
  const textFaint = theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e';
  const subtleBg = theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)';
  const bgColor = theme === 'dark' ? '#1a1a1a' : '#f8f8f8';

  return { theme, textColor, textSecondary, textMuted, textFaint, subtleBg, bgColor };
}
