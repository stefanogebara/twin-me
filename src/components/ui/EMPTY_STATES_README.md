# Empty State Component System

A comprehensive, reusable empty state system for the Twin AI Learn platform with consistent design, smooth animations, and clear CTAs.

## Overview

The empty state system provides:
- **Reusable base component** with flexible configuration
- **12+ preset variations** for common scenarios
- **Framer Motion animations** for smooth appearance
- **Consistent design language** matching platform aesthetics
- **Mobile responsive** layouts
- **Multiple action support** (primary, secondary, tertiary)

## Quick Start

### Using Preset Empty States

```tsx
import { NoPlatformsConnectedEmptyState } from '@/components/ui/EmptyStatePresets';

function Dashboard() {
  return (
    <div>
      {platforms.length === 0 ? (
        <NoPlatformsConnectedEmptyState
          onConnect={() => navigate('/get-started')}
        />
      ) : (
        // Your content
      )}
    </div>
  );
}
```

### Creating Custom Empty States

```tsx
import { EmptyState } from '@/components/ui/EmptyState';
import { Sparkles } from 'lucide-react';

function CustomEmptyState() {
  return (
    <EmptyState
      icon={Sparkles}
      title="No Memories Yet"
      description="Start capturing your digital footprints to build your memory timeline."
      primaryAction={{
        label: 'Start Capturing',
        onClick: handleCapture,
        icon: Sparkles
      }}
      secondaryAction={{
        label: 'Learn More',
        onClick: handleLearnMore,
        variant: 'outline'
      }}
    />
  );
}
```

## Available Presets

### 1. NoPlatformsConnectedEmptyState
**When to use:** User hasn't connected any platforms yet
**Props:** `onConnect?: () => void`

```tsx
<NoPlatformsConnectedEmptyState
  onConnect={() => navigate('/get-started')}
/>
```

### 2. NoSoulSignatureEmptyState
**When to use:** Soul signature hasn't been built
**Props:** `onConnect?: () => void`

```tsx
<NoSoulSignatureEmptyState
  onConnect={() => navigate('/get-started')}
/>
```

### 3. NoSearchResultsEmptyState
**When to use:** Search query returns no results
**Props:** `searchQuery: string`, `onClearSearch?: () => void`

```tsx
<NoSearchResultsEmptyState
  searchQuery="soul signature analytics"
  onClearSearch={() => setSearchQuery('')}
/>
```

### 4. NoFilteredResultsEmptyState
**When to use:** Applied filters return no results
**Props:** `filterName?: string`, `onClearFilters?: () => void`

```tsx
<NoFilteredResultsEmptyState
  filterName="Personal Platforms"
  onClearFilters={() => resetFilters()}
/>
```

### 5. NoDataExtractedEmptyState
**When to use:** No data has been extracted
**Props:** `onExtract?: () => void`

```tsx
<NoDataExtractedEmptyState
  onExtract={() => startExtraction()}
/>
```

### 6. NoPrivacySettingsEmptyState
**When to use:** Privacy controls aren't configured
**Props:** `onConfigure?: () => void`

```tsx
<NoPrivacySettingsEmptyState
  onConfigure={() => navigate('/privacy-spectrum')}
/>
```

### 7. ErrorLoadingEmptyState
**When to use:** Error loading data
**Props:** `errorMessage?: string`, `onRetry?: () => void`

```tsx
<ErrorLoadingEmptyState
  errorMessage="Failed to load platform connections."
  onRetry={() => refetch()}
/>
```

### 8. ComingSoonEmptyState
**When to use:** Feature not yet available
**Props:** `featureName: string`, `onNotify?: () => void`

```tsx
<ComingSoonEmptyState
  featureName="Soul Matching"
  onNotify={() => subscribeToUpdates()}
/>
```

### 9. PermissionRequiredEmptyState
**When to use:** User permissions needed
**Props:** `permissionType: string`, `onGrantAccess?: () => void`

```tsx
<PermissionRequiredEmptyState
  permissionType="access your Spotify listening history"
  onGrantAccess={() => requestPermission()}
/>
```

### 10. NoRecentActivityEmptyState
**When to use:** No recent activity to display
**Props:** None

```tsx
<NoRecentActivityEmptyState />
```

### 11. NoDataEmptyState
**When to use:** Generic no data scenario
**Props:** `title?: string`, `description?: string`, `actionLabel?: string`, `onAction?: () => void`

```tsx
<NoDataEmptyState
  title="No Twins Created"
  description="Create your first digital twin to get started."
  actionLabel="Create Twin"
  onAction={() => navigate('/twin-builder')}
/>
```

### 12. LoadingEmptyState
**When to use:** While data is loading
**Props:** `message?: string`

```tsx
<LoadingEmptyState message="Loading your soul signature..." />
```

## Base Component API

### EmptyStateProps

```typescript
interface EmptyStateProps {
  // Icon from lucide-react
  icon?: LucideIcon;

  // Custom icon styling
  iconClassName?: string;

  // Main heading
  title: string;

  // Descriptive text
  description: string;

  // Primary call-to-action
  primaryAction?: EmptyStateAction;

  // Secondary action (optional)
  secondaryAction?: EmptyStateAction;

  // Tertiary action (optional)
  tertiaryAction?: EmptyStateAction;

  // Layout variant
  variant?: 'default' | 'compact' | 'centered';

  // Custom illustration instead of icon
  illustration?: React.ReactNode;

  // Additional CSS classes
  className?: string;

  // Enable/disable animations
  animate?: boolean;
}
```

### EmptyStateAction

```typescript
interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: LucideIcon;
}
```

## Layout Variants

### Default
Standard padding, suitable for most cases.

```tsx
<EmptyState variant="default" {...props} />
```

### Compact
Reduced padding for tighter layouts (cards, sidebars).

```tsx
<EmptyState variant="compact" {...props} />
```

### Centered
Full-height centered layout for main content areas.

```tsx
<EmptyState variant="centered" {...props} />
```

## Design Guidelines

### Typography
- **Title:** 24px (2xl), Stone 900, Styrene A font
- **Description:** 16px base, Stone 600, line-height relaxed
- Maximum description width: 28rem (448px)

### Icons
- **Size:** 64px container (w-16 h-16)
- **Icon:** 32px (w-8 h-8)
- **Background:** bg-black/[0.04] (subtle gray)
- **Color:** text-stone-600

### Actions
- **Primary:** Stone 900 background, white text
- **Secondary:** Outline variant
- **Tertiary:** Ghost variant, stone 600 text
- **Minimum width:** 160px for primary/secondary
- **Gap:** 12px between actions

### Animation
- **Container:** Fade in + slide up (20px)
- **Icon:** Scale + fade (0.3s delay)
- **Text:** Fade + slide (0.2s delay)
- **Actions:** Fade + slide (0.3s delay)
- **Easing:** easeOut
- **Duration:** 300-400ms

### Spacing
- **Icon margin bottom:** 24px
- **Text margin bottom:** 24px
- **Default padding:** py-16 px-8
- **Compact padding:** py-8 px-6
- **Centered padding:** py-20 px-8, min-height 400px

## Best Practices

### When to Use Empty States

✅ **DO use empty states for:**
- No platforms connected
- No search results
- No filtered results
- Empty data lists
- Features not available yet
- Permissions required
- Error states with recovery options

❌ **DON'T use empty states for:**
- Loading states (use loading skeletons instead)
- Brief transitions (< 2 seconds)
- Inline form validation errors
- Toast/notification messages

### Action Guidelines

**Primary Action:**
- Should be the most obvious next step
- Use clear, action-oriented language ("Connect Platform", "Start Extraction")
- Always include for actionable empty states

**Secondary Action:**
- Alternative or complementary action
- Use for "Learn More", "View Docs", etc.
- Optional but recommended

**Tertiary Action:**
- Least important action
- Use for dismissal or navigation
- Rarely needed

### Copy Guidelines

**Title:**
- Short and descriptive (2-5 words)
- State what's missing or what happened
- Avoid questions in titles

**Description:**
- Explain why state occurred
- Provide context and next steps
- Keep under 2 sentences
- Be encouraging, not blaming

**Examples:**

✅ Good:
- Title: "No Platforms Connected Yet"
- Description: "Connect your entertainment and lifestyle platforms to begin discovering your authentic soul signature."

❌ Bad:
- Title: "Oops! Nothing here!"
- Description: "We didn't find any platforms. This page is empty because you haven't connected anything. Please connect a platform to continue."

## Implementation Examples

### Dashboard with Empty State

```tsx
import { NoRecentActivityEmptyState } from '@/components/ui/EmptyStatePresets';

function Dashboard() {
  const { activity, loading } = useActivity();

  if (loading) return <LoadingEmptyState />;

  return (
    <div>
      <h2>Recent Activity</h2>
      {activity.length > 0 ? (
        activity.map(item => <ActivityItem key={item.id} {...item} />)
      ) : (
        <NoRecentActivityEmptyState />
      )}
    </div>
  );
}
```

### Search Results with Empty State

```tsx
import { NoSearchResultsEmptyState } from '@/components/ui/EmptyStatePresets';

function SearchResults() {
  const [query, setQuery] = useState('');
  const results = useSearch(query);

  return (
    <div>
      <SearchInput value={query} onChange={setQuery} />

      {results.length > 0 ? (
        results.map(r => <SearchResult key={r.id} {...r} />)
      ) : query ? (
        <NoSearchResultsEmptyState
          searchQuery={query}
          onClearSearch={() => setQuery('')}
        />
      ) : null}
    </div>
  );
}
```

### Filtered List with Empty State

```tsx
import { NoFilteredResultsEmptyState } from '@/components/ui/EmptyStatePresets';

function PlatformList() {
  const [category, setCategory] = useState('all');
  const platforms = usePlatforms();
  const filtered = platforms.filter(p =>
    category === 'all' || p.category === category
  );

  return (
    <div>
      <CategoryFilter value={category} onChange={setCategory} />

      {filtered.length > 0 ? (
        filtered.map(p => <PlatformCard key={p.id} {...p} />)
      ) : (
        <NoFilteredResultsEmptyState
          filterName={category}
          onClearFilters={() => setCategory('all')}
        />
      )}
    </div>
  );
}
```

## Testing

### Visual Testing
View all empty state variations:
```
Navigate to /empty-state-showcase
```

### Component Testing
```tsx
import { render, screen } from '@testing-library/react';
import { NoSearchResultsEmptyState } from '@/components/ui/EmptyStatePresets';

test('renders search empty state with query', () => {
  render(
    <NoSearchResultsEmptyState
      searchQuery="test query"
      onClearSearch={() => {}}
    />
  );

  expect(screen.getByText(/test query/i)).toBeInTheDocument();
  expect(screen.getByText(/Clear Search/i)).toBeInTheDocument();
});
```

## Accessibility

All empty states include:
- Semantic HTML structure
- Proper heading hierarchy
- Keyboard-accessible actions
- Screen reader friendly text
- Focus indicators on buttons
- ARIA labels where appropriate

## Browser Support

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## File Structure

```
src/components/ui/
├── EmptyState.tsx           # Base component
├── EmptyStatePresets.tsx    # Preset variations
├── EmptyStateIndex.tsx      # Export index
└── EMPTY_STATES_README.md   # This file

src/pages/
└── EmptyStateShowcase.tsx   # Visual showcase
```

## Related Components

- **Loading States:** `src/components/ui/LoadingStates.tsx`
- **Skeletons:** `src/components/ui/skeletons.tsx`
- **Cards:** `src/components/ui/card.tsx`
- **Buttons:** `src/components/ui/button.tsx`

## Support

For issues or questions:
1. Check the showcase page: `/empty-state-showcase`
2. Review this documentation
3. Check existing usage in Dashboard, PlatformHub, PlatformStatus
4. Create a GitHub issue
