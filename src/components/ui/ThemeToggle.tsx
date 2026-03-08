import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  expanded?: boolean;
}

export function ThemeToggle({ className, expanded }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'flex items-center gap-3 rounded-lg transition-colors hover:bg-sidebar-accent text-sidebar-foreground',
        expanded ? 'px-4 py-3' : 'px-3 py-3 justify-center',
        className
      )}
      title={resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
      {expanded && (
        <span className="text-sm">
          {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </span>
      )}
    </button>
  );
}
