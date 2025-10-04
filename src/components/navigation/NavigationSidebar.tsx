import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { NavigationItem } from '../../config/navigation';
import { cn } from '../../lib/utils';

/**
 * Navigation Sidebar Component
 *
 * Features:
 * - Collapsible nested items (Y level has Z children)
 * - Icons for all items
 * - Active state highlighting
 * - Smooth expand/collapse animations
 */

interface NavigationSidebarProps {
  items: NavigationItem[];
  basePath: string; // e.g., "/dashboard"
  className?: string;
}

interface SidebarItemProps {
  item: NavigationItem;
  fullPath: string;
  level: number;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ item, fullPath, level }) => {
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(
    location.pathname.startsWith(fullPath)
  );

  const hasChildren = item.children && item.children.length > 0;
  const isActive = location.pathname === fullPath || location.pathname.startsWith(`${fullPath}/`);

  const Icon = item.icon;

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className="w-full">
      {/* Main Item */}
      <div className="relative">
        <NavLink
          to={fullPath}
          onClick={(e) => {
            if (hasChildren) {
              e.preventDefault();
              handleToggle();
            }
          }}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-lg transition-all group',
            'hover:bg-[hsl(var(--claude-surface-raised))]',
            level === 0 && 'mb-1',
            level > 0 && 'ml-6 mb-0.5',
            isActive && 'bg-[hsl(var(--claude-surface-raised))] border-l-2 border-[hsl(var(--claude-accent))]',
            !isActive && 'border-l-2 border-transparent'
          )}
        >
          {Icon && (
            <Icon
              className={cn(
                'w-5 h-5 transition-colors',
                isActive ? 'text-[hsl(var(--claude-accent))]' : 'text-[hsl(var(--claude-text-muted))]',
                'group-hover:text-[hsl(var(--claude-accent))]'
              )}
            />
          )}

          <span
            className={cn(
              'flex-1 text-sm transition-colors',
              isActive ? 'text-[hsl(var(--claude-text))] font-medium' : 'text-[hsl(var(--claude-text-muted))]',
              'group-hover:text-[hsl(var(--claude-text))]'
            )}
            style={{
              fontFamily: 'var(--_typography---font--styrene-a)',
              letterSpacing: '-0.01em'
            }}
          >
            {item.label}
          </span>

          {hasChildren && (
            <div className="ml-auto">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-[hsl(var(--claude-text-muted))]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[hsl(var(--claude-text-muted))]" />
              )}
            </div>
          )}
        </NavLink>
      </div>

      {/* Nested Children (Z level) */}
      {hasChildren && (
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 ease-in-out',
            isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="py-1">
            {item.children!.filter(child => !child.path.startsWith(':')).map((child) => (
              <SidebarItem
                key={child.path}
                item={child}
                fullPath={`${fullPath}/${child.path}`}
                level={level + 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  items,
  basePath,
  className = ''
}) => {
  return (
    <aside
      className={cn(
        'w-64 bg-[hsl(var(--claude-surface))] border-r border-[hsl(var(--claude-border))]',
        'overflow-y-auto',
        className
      )}
      style={{
        height: 'calc(100vh - 60px - 60px)' // minus header and breadcrumbs
      }}
    >
      <nav className="p-4 space-y-1" aria-label="Secondary navigation">
        {items.filter(item => !item.path.startsWith(':')).map((item) => (
          <SidebarItem
            key={item.path}
            item={item}
            fullPath={`${basePath}/${item.path}`}
            level={0}
          />
        ))}
      </nav>
    </aside>
  );
};
