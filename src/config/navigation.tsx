import {
  Home,
  Database,
  Fingerprint,
  MessageSquare,
  GraduationCap,
  Settings,
  Shield,
  LayoutDashboard,
  Activity,
  Users,
  BarChart3,
  FileText,
  Zap,
  LucideIcon
} from 'lucide-react';

/**
 * Navigation Configuration
 *
 * Hierarchy:
 * - X: Top header navigation (main pages)
 * - Y: Left sidebar navigation (secondary pages)
 * - Z: Nested items under Y (tertiary pages)
 * - W: Breadcrumb-only 4th level (not shown in sidebar)
 */

export interface NavigationItem {
  path: string;
  label: string;
  icon?: LucideIcon;
  showInHeader?: boolean;  // X level - show in top nav
  showSidebar?: boolean;   // Enable/disable sidebar for this section
  requiresAuth?: boolean;  // Require authentication
  children?: NavigationItem[];
}

export interface NavigationConfig {
  defaultRoute: string;  // Default route for logged-in users at /
  routes: NavigationItem[];
}

/**
 * Main Navigation Configuration
 *
 * Usage Example:
 * - /dashboard (X) → shows in header, has sidebar
 *   - /dashboard/overview (Y) → sidebar item with icon
 *     - /dashboard/overview/metrics (Z) → nested under overview
 *       - /dashboard/overview/metrics/:id (W) → breadcrumb only
 */
export const navigationConfig: NavigationConfig = {
  // Default route for logged-in users accessing /
  defaultRoute: '/dashboard',

  routes: [
    {
      path: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      showInHeader: true,
      showSidebar: true,
      requiresAuth: true,
      children: [
        {
          path: 'overview',
          label: 'Overview',
          icon: Home,
          children: [
            {
              path: 'stats',
              label: 'Statistics',
              icon: BarChart3,
            },
            {
              path: 'activity',
              label: 'Activity Feed',
              icon: Activity,
            }
          ]
        },
        {
          path: 'analytics',
          label: 'Analytics',
          icon: BarChart3,
          children: [
            {
              path: 'reports',
              label: 'Reports',
              icon: FileText,
              children: [
                {
                  path: ':reportId',
                  label: 'Report Details', // W level - breadcrumb only
                }
              ]
            },
            {
              path: 'insights',
              label: 'Insights',
              icon: Zap,
            }
          ]
        }
      ]
    },
    {
      path: 'data',
      label: 'Connect Data',
      icon: Database,
      showInHeader: true,
      showSidebar: true,
      requiresAuth: true,
      children: [
        {
          path: 'sources',
          label: 'Data Sources',
          icon: Database,
          children: [
            {
              path: 'connected',
              label: 'Connected',
            },
            {
              path: 'available',
              label: 'Available',
            }
          ]
        },
        {
          path: 'extraction',
          label: 'Data Extraction',
          icon: Zap,
        }
      ]
    },
    {
      path: 'soul-signature',
      label: 'Soul Signature',
      icon: Fingerprint,
      showInHeader: true,
      showSidebar: true,
      requiresAuth: true,
      children: [
        {
          path: 'discover',
          label: 'Discover',
          icon: Fingerprint,
        },
        {
          path: 'clusters',
          label: 'Life Clusters',
          icon: BarChart3,
          children: [
            {
              path: ':clusterId',
              label: 'Cluster Details', // W level
            }
          ]
        },
        {
          path: 'privacy',
          label: 'Privacy Controls',
          icon: Shield,
        }
      ]
    },
    {
      path: 'chat',
      label: 'Chat with Twin',
      icon: MessageSquare,
      showInHeader: true,
      showSidebar: true,
      requiresAuth: true,
      children: [
        {
          path: 'conversations',
          label: 'Conversations',
          icon: MessageSquare,
          children: [
            {
              path: ':conversationId',
              label: 'Conversation', // W level
            }
          ]
        },
        {
          path: 'twins',
          label: 'My Twins',
          icon: Users,
        }
      ]
    },
    {
      path: 'training',
      label: 'Training',
      icon: GraduationCap,
      showInHeader: true,
      showSidebar: true,
      requiresAuth: true,
      children: [
        {
          path: 'sessions',
          label: 'Training Sessions',
          icon: GraduationCap,
        },
        {
          path: 'progress',
          label: 'Progress',
          icon: Activity,
        }
      ]
    },
    {
      path: 'settings',
      label: 'Settings',
      icon: Settings,
      showInHeader: true,
      showSidebar: false, // No sidebar for settings
      requiresAuth: true,
      children: [
        {
          path: 'profile',
          label: 'Profile',
        },
        {
          path: 'account',
          label: 'Account',
        },
        {
          path: 'notifications',
          label: 'Notifications',
        }
      ]
    }
  ]
};

/**
 * Utility: Get flattened routes for React Router
 */
export const getFlattenedRoutes = (items: NavigationItem[] = navigationConfig.routes, parentPath = ''): Array<{path: string, fullPath: string, item: NavigationItem}> => {
  const routes: Array<{path: string, fullPath: string, item: NavigationItem}> = [];

  items.forEach(item => {
    const fullPath = parentPath ? `${parentPath}/${item.path}` : `/${item.path}`;
    routes.push({ path: item.path, fullPath, item });

    if (item.children) {
      routes.push(...getFlattenedRoutes(item.children, fullPath));
    }
  });

  return routes;
};

/**
 * Utility: Get breadcrumb trail for a path
 */
export const getBreadcrumbTrail = (pathname: string): Array<{label: string, path: string}> => {
  const segments = pathname.split('/').filter(Boolean);
  const trail: Array<{label: string, path: string}> = [];

  let currentPath = '';
  let currentItems = navigationConfig.routes;

  for (const segment of segments) {
    currentPath += `/${segment}`;
    const item = currentItems.find(i => i.path === segment || i.path === `:${segment}`);

    if (item) {
      trail.push({
        label: item.label,
        path: currentPath
      });
      currentItems = item.children || [];
    } else {
      // Handle dynamic routes (like :id)
      const dynamicItem = currentItems.find(i => i.path.startsWith(':'));
      if (dynamicItem) {
        trail.push({
          label: segment, // Use actual ID/value as label
          path: currentPath
        });
        currentItems = dynamicItem.children || [];
      }
    }
  }

  return trail;
};

/**
 * Utility: Get sidebar items for current main section
 */
export const getSidebarItems = (pathname: string): NavigationItem[] => {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  const mainRoute = navigationConfig.routes.find(r => r.path === firstSegment);

  return mainRoute?.children || [];
};

/**
 * Utility: Check if sidebar should be shown for current route
 */
export const shouldShowSidebar = (pathname: string): boolean => {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  const mainRoute = navigationConfig.routes.find(r => r.path === firstSegment);

  return mainRoute?.showSidebar ?? false;
};
