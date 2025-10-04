# Navigation System Guide

## Overview

This platform uses a **4-level hierarchical navigation system** that's simple, reusable, and follows React Router best practices.

### Navigation Levels

- **X Level**: Top header navigation (main pages)
- **Y Level**: Left sidebar navigation (secondary pages)
- **Z Level**: Nested items under Y (tertiary pages) - shown in sidebar
- **W Level**: Breadcrumb-only 4th level (not shown in sidebar) - used for dynamic routes like IDs

```
┌─────────────────────────────────────────┐
│ Header: X > X > X > X (Main Nav)        │
├──────────┬──────────────────────────────┤
│          │ Breadcrumbs: X > Y > Z > W   │
│ Sidebar  ├──────────────────────────────┤
│  Y       │                              │
│   ├ Z    │  Main Content (Outlet)       │
│   ├ Z    │                              │
│  Y       │                              │
│   ├ Z    │                              │
└──────────┴──────────────────────────────┘
```

## Quick Start

### 1. Add a New Section (X Level)

Edit `src/config/navigation.tsx`:

```typescript
{
  path: 'my-section',           // URL: /my-section
  label: 'My Section',          // Display name
  icon: LayoutDashboard,        // Icon component
  showInHeader: true,           // Show in top nav
  showSidebar: true,            // Enable sidebar for this section
  requiresAuth: true,           // Require login
  children: [...]               // Y-level pages
}
```

### 2. Add Sidebar Pages (Y Level)

```typescript
children: [
  {
    path: 'overview',           // URL: /my-section/overview
    label: 'Overview',
    icon: Home,
    children: [...]             // Z-level nested items
  }
]
```

### 3. Add Nested Sidebar Items (Z Level)

```typescript
children: [
  {
    path: 'stats',              // URL: /my-section/overview/stats
    label: 'Statistics',
    icon: BarChart3,
    children: [...]             // W-level (breadcrumb only)
  }
]
```

### 4. Add Breadcrumb-Only Routes (W Level)

```typescript
children: [
  {
    path: ':reportId',          // URL: /my-section/overview/stats/123
    label: 'Report Details'     // Dynamic - will show actual ID in breadcrumb
  }
]
```

### 5. Create Your Page Component

```tsx
// src/pages/MyPage.tsx
export default function MyPage() {
  return (
    <div>
      <h1>My Page</h1>
      <p>Content goes here</p>
    </div>
  );
}
```

### 6. Add Route to App.tsx

```tsx
// Import your page
import MyPage from './pages/MyPage';

// Inside <Routes> with AppLayout
<Route element={<AppLayout user={user} onSignOut={signOut} />}>
  <Route path="/my-section/overview" element={
    <SignedIn><MyPage /></SignedIn>
    <SignedOut><CustomAuth /></SignedOut>
  } />
</Route>
```

## Features

### ✅ Automatic Sidebar

The sidebar automatically shows/hides based on `showSidebar` in navigation config:

```typescript
{
  path: 'settings',
  showSidebar: false,  // No sidebar for settings pages
}
```

### ✅ Automatic Breadcrumbs

Breadcrumbs are generated automatically from the URL path using navigation config.

### ✅ Active States

NavLink automatically highlights active routes with Claude's accent color.

### ✅ Collapsible Nested Items

Sidebar items with children automatically become collapsible.

### ✅ Accessibility

- Breadcrumbs use `aria-label="Breadcrumb navigation"`
- Sidebar uses `aria-label="Secondary navigation"`
- Active page uses `aria-current="page"`
- Truncated labels show tooltips

### ✅ Default Route Redirect

Logged-in users visiting `/` are redirected to `defaultRoute`:

```typescript
export const navigationConfig = {
  defaultRoute: '/dashboard',  // Change this to your default page
  routes: [...]
};
```

## Common Patterns

### Pattern 1: Main Section with Sidebar

```typescript
{
  path: 'analytics',
  label: 'Analytics',
  icon: BarChart3,
  showInHeader: true,
  showSidebar: true,
  requiresAuth: true,
  children: [
    {
      path: 'reports',
      label: 'Reports',
      icon: FileText,
      children: [
        {
          path: 'monthly',
          label: 'Monthly Reports'
        },
        {
          path: ':reportId',
          label: 'Report Details'  // W level - breadcrumb only
        }
      ]
    },
    {
      path: 'insights',
      label: 'Insights',
      icon: Zap
    }
  ]
}
```

**URLs Generated:**
- `/analytics` (X)
- `/analytics/reports` (Y)
- `/analytics/reports/monthly` (Z)
- `/analytics/reports/abc123` (W - shows in breadcrumb, not sidebar)
- `/analytics/insights` (Y)

### Pattern 2: Simple Page without Sidebar

```typescript
{
  path: 'settings',
  label: 'Settings',
  icon: Settings,
  showInHeader: true,
  showSidebar: false,  // Disable sidebar
  requiresAuth: true,
  children: [
    {
      path: 'profile',
      label: 'Profile'
    },
    {
      path: 'account',
      label: 'Account'
    }
  ]
}
```

**URLs Generated:**
- `/settings` (X - in header)
- `/settings/profile` (shown in breadcrumbs only)
- `/settings/account` (shown in breadcrumbs only)

### Pattern 3: Sidebar without Header

```typescript
{
  path: 'internal-tools',
  label: 'Internal Tools',
  showInHeader: false,  // Not in header
  showSidebar: true,    // But has sidebar
  requiresAuth: true,
  children: [...]
}
```

## Utilities

### Get Breadcrumb Trail

```typescript
import { getBreadcrumbTrail } from '@/config/navigation';

const trail = getBreadcrumbTrail('/dashboard/analytics/reports');
// Returns: [
//   { label: 'Dashboard', path: '/dashboard' },
//   { label: 'Analytics', path: '/dashboard/analytics' },
//   { label: 'Reports', path: '/dashboard/analytics/reports' }
// ]
```

### Get Sidebar Items

```typescript
import { getSidebarItems } from '@/config/navigation';

const items = getSidebarItems('/dashboard/analytics');
// Returns all Y-level children for the dashboard section
```

### Check if Sidebar Should Show

```typescript
import { shouldShowSidebar } from '@/config/navigation';

const showIt = shouldShowSidebar('/dashboard');
// Returns true/false based on navigation config
```

## Best Practices

### ✅ DO

- Keep route paths short and readable (`/dashboard/stats` not `/dashboard/statistics-and-metrics`)
- Use icons for all Y-level sidebar items
- Keep labels under 80 characters (auto-truncates with tooltip)
- Use `:paramName` for dynamic routes (W level)
- Group related pages under a common parent
- Disable sidebar for simple, standalone pages

### ❌ DON'T

- Don't nest more than 4 levels (X > Y > Z > W)
- Don't show W-level routes in sidebar (use breadcrumbs only)
- Don't create navigation items without `path` and `label`
- Don't forget to set `requiresAuth: true` for protected routes
- Don't use both `showInHeader: false` and `showSidebar: false` (page becomes inaccessible)

## Migrating Existing Pages

### Old Pattern (SidebarLayout)

```tsx
<Route path="/my-page" element={
  <SignedIn>
    <SidebarLayout>
      <MyPage />
    </SidebarLayout>
  </SignedIn>
  <SignedOut>
    <CustomAuth />
  </SignedOut>
} />
```

### New Pattern (AppLayout)

```tsx
// 1. Add to navigation config
{
  path: 'my-page',
  label: 'My Page',
  icon: FileText,
  showInHeader: true,
  showSidebar: true
}

// 2. Update route
<Route element={<AppLayout user={user} onSignOut={signOut} />}>
  <Route path="/my-page" element={
    <SignedIn><MyPage /></SignedIn>
    <SignedOut><CustomAuth /></SignedOut>
  } />
</Route>
```

## Troubleshooting

### Sidebar not showing?

Check that `showSidebar: true` in navigation config for the main section.

### Breadcrumbs showing wrong labels?

Ensure all routes in the path have matching entries in navigation config.

### Page not accessible from header?

Set `showInHeader: true` for the main section (X level).

### Dynamic routes not working?

Use `:paramName` syntax and ensure it's at W level (4th level, breadcrumb only).

## Examples

See the following files for complete examples:
- `src/config/navigation.tsx` - Full navigation configuration
- `src/pages/DashboardOverview.tsx` - Example page component
- `src/App.tsx` - Route setup with AppLayout

## Support

For questions or issues with the navigation system:
1. Check this guide
2. Review the navigation config in `src/config/navigation.tsx`
3. Look at existing page implementations
4. Check browser console for navigation-related logs

---

**Built with React Router v6 Outlet pattern and following 2024 best practices.**
