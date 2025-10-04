import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { NavigationSidebar } from './NavigationSidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { getSidebarItems, shouldShowSidebar } from '../../config/navigation';

/**
 * App Layout Component
 *
 * Main layout using React Router Outlet pattern
 *
 * Structure:
 * ┌─────────────────────────────────────────┐
 * │ Header (X level nav)                    │
 * ├──────────┬──────────────────────────────┤
 * │          │ Breadcrumbs (X > Y > Z > W)  │
 * │ Sidebar  ├──────────────────────────────┤
 * │ (Y, Z)   │                              │
 * │          │  Main Content (Outlet)       │
 * │          │                              │
 * └──────────┴──────────────────────────────┘
 */

interface AppLayoutProps {
  user?: {
    name?: string;
    email?: string;
  };
  onSignOut?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ user, onSignOut }) => {
  const location = useLocation();

  // Determine if sidebar should be shown for current route
  const showSidebar = shouldShowSidebar(location.pathname);

  // Get sidebar items for current section
  const sidebarItems = showSidebar ? getSidebarItems(location.pathname) : [];

  // Get base path for sidebar (first segment)
  const basePath = `/${location.pathname.split('/').filter(Boolean)[0] || ''}`;

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))]">
      {/* Header - X level navigation */}
      <Header user={user} onSignOut={onSignOut} />

      <div className="flex">
        {/* Sidebar - Y and Z level navigation */}
        {showSidebar && sidebarItems.length > 0 && (
          <NavigationSidebar items={sidebarItems} basePath={basePath} />
        )}

        {/* Main Content Area */}
        <div className="flex-1">
          {/* Breadcrumbs - X > Y > Z > W navigation */}
          <Breadcrumbs />

          {/* Page Content */}
          <main className="p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};
