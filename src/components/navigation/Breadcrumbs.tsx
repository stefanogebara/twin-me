import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { getBreadcrumbTrail } from '../../config/navigation';

/**
 * Breadcrumbs Component
 *
 * Features:
 * - Supports up to 4 levels (X > Y > Z > W)
 * - Accessible with aria-label
 * - Auto-truncates long names (80 chars max)
 * - Shows tooltip on hover for truncated items
 * - Home icon for root
 */

interface BreadcrumbsProps {
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ className = '' }) => {
  const location = useLocation();
  const trail = getBreadcrumbTrail(location.pathname);

  if (trail.length === 0) {
    return null;
  }

  const truncateLabel = (label: string, maxLength = 80): string => {
    if (label.length <= maxLength) return label;
    return `${label.substring(0, maxLength)}...`;
  };

  return (
    <nav
      aria-label="Breadcrumb navigation"
      className={`flex items-center gap-2 py-4 px-6 bg-[hsl(var(--claude-surface))] border-b border-[hsl(var(--claude-border))] ${className}`}
    >
      <ol className="flex items-center gap-2 text-sm">
        {/* Home/Root */}
        <li>
          <Link
            to="/"
            className="flex items-center gap-1 text-[hsl(var(--claude-text-muted))] hover:text-[hsl(var(--claude-accent))] transition-colors"
            aria-label="Home"
          >
            <Home className="w-4 h-4" />
          </Link>
        </li>

        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          const displayLabel = truncateLabel(crumb.label);
          const isTruncated = displayLabel !== crumb.label;

          return (
            <li key={crumb.path} className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-[hsl(var(--claude-text-muted))]" />

              {isLast ? (
                <span
                  className="text-[hsl(var(--claude-text))] font-medium"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                  }}
                  title={isTruncated ? crumb.label : undefined}
                  aria-current="page"
                >
                  {displayLabel}
                </span>
              ) : (
                <Link
                  to={crumb.path}
                  className="text-[hsl(var(--claude-text-muted))] hover:text-[hsl(var(--claude-accent))] transition-colors"
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)',
                  }}
                  title={isTruncated ? crumb.label : undefined}
                >
                  {displayLabel}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
