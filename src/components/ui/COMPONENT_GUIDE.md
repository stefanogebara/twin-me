# Soul Signature Platform - UI Component Style Guide

## Overview
This guide provides examples and best practices for using the standardized UI components across the Soul Signature platform. All components follow the Anthropic-inspired design system with consistent colors, typography, and spacing.

## Design Principles
1. **Consistency**: Use standardized components instead of inline styles
2. **Semantic Colors**: Use design tokens from `design-tokens.ts`
3. **Responsive**: Components should work across all screen sizes
4. **Accessible**: Include proper ARIA labels and keyboard navigation
5. **Performance**: Minimize re-renders and bundle size

## Component Library

### 1. Buttons (StandardButton)

#### Usage
```tsx
import { StandardButton, PrimaryButton, OutlineButton } from '@/components/ui/StandardButton';
import { Send, Download } from 'lucide-react';

// Primary Action Button
<PrimaryButton
  leftIcon={<Send className="w-4 h-4" />}
  onClick={handleSubmit}
>
  Send Message
</PrimaryButton>

// Secondary Button
<OutlineButton
  rightIcon={<Download className="w-4 h-4" />}
  size="lg"
>
  Download Report
</OutlineButton>

// Loading State
<StandardButton
  variant="primary"
  isLoading={isSubmitting}
  disabled={!isValid}
>
  Processing...
</StandardButton>
```

#### Variants
- `primary` - Orange accent button for primary actions
- `secondary` - Gray button for secondary actions
- `outline` - Bordered button with transparent background
- `ghost` - Minimal button for tertiary actions
- `danger` - Red button for destructive actions

### 2. Cards (StandardCard)

#### Usage
```tsx
import { StandardCard, CardHeader, CardContent, CardFooter } from '@/components/ui/StandardCard';
import { Brain } from 'lucide-react';

<StandardCard variant="elevated" padding="lg">
  <CardHeader
    icon={<Brain className="w-5 h-5" />}
    title="Soul Signature Analysis"
    subtitle="Understanding your digital identity"
    action={<StandardButton size="sm">View Details</StandardButton>}
  />

  <CardContent>
    <p>Your soul signature has been extracted from 12 platforms...</p>
  </CardContent>

  <CardFooter>
    <span className="text-sm text-muted">Last updated: 2 hours ago</span>
    <StandardButton variant="outline" size="sm">Refresh</StandardButton>
  </CardFooter>
</StandardCard>
```

#### Variants
- `default` - Standard card with border
- `elevated` - Card with shadow for prominence
- `bordered` - Card with stronger border
- `interactive` - Card with hover effects for clickable items

### 3. Badges (StandardBadge)

#### Usage
```tsx
import {
  StandardBadge,
  ConnectedBadge,
  ExtractingBadge,
  SuccessBadge
} from '@/components/ui/StandardBadge';

// Connection Status
<ConnectedBadge size="sm" />
<ExtractingBadge />

// Custom Badge
<StandardBadge variant="premium" icon={<Crown className="w-3 h-3" />}>
  Premium Feature
</StandardBadge>

// Status Indicators
<SuccessBadge>Extraction Complete</SuccessBadge>
```

#### Pre-built Status Badges
- `ConnectedBadge` - Green with check icon
- `DisconnectedBadge` - Red with X icon
- `PendingBadge` - Yellow with clock icon
- `ExtractingBadge` - Blue with spinning loader
- `LockedBadge` - Gray with lock icon
- `UnlockedBadge` - Green with unlock icon

## Color System

### Primary Colors
```tsx
// Instead of hardcoding:
style={{ backgroundColor: '#D97706' }}  // ❌ Don't do this

// Use CSS variables:
className="bg-[hsl(var(--claude-accent))]"  // ✅ Do this

// Or import from design tokens:
import { colors } from '@/styles/design-tokens';
style={{ backgroundColor: colors.primary.orange }}  // ✅ Also good
```

### Semantic Colors
- Success: Green (`#10B981`)
- Error: Red (`#EF4444`)
- Warning: Amber (`#F59E0B`)
- Info: Blue (`#3B82F6`)

## Typography

### Font Families
```tsx
// Headings - Space Grotesk
className="font-heading"

// Body text - Source Serif 4
className="font-body"

// UI elements - DM Sans
className="font-ui"
```

### Font Sizes
```tsx
// Use Tailwind classes
className="text-xs"   // 12px
className="text-sm"   // 14px
className="text-base" // 16px
className="text-lg"   // 18px
className="text-xl"   // 20px
className="text-2xl"  // 24px
```

## Spacing

Follow the 8px grid system:
```tsx
// Padding/Margin classes
className="p-2"   // 8px
className="p-4"   // 16px
className="p-6"   // 24px
className="p-8"   // 32px

// Gap in flex/grid
className="gap-2" // 8px
className="gap-4" // 16px
```

## Migration Guide

### Before (Inline Styles)
```tsx
// ❌ Old way - inconsistent
<Button
  style={{
    backgroundColor: '#D97706',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '8px',
    fontFamily: 'var(--_typography---font--styrene-a)',
    fontWeight: 500
  }}
>
  Click me
</Button>
```

### After (Standardized Components)
```tsx
// ✅ New way - consistent
<PrimaryButton>
  Click me
</PrimaryButton>
```

## Common Patterns

### Loading States
```tsx
<StandardCard>
  {isLoading ? (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--claude-accent))]" />
    </div>
  ) : (
    <CardContent>
      {/* Content */}
    </CardContent>
  )}
</StandardCard>
```

### Empty States
```tsx
<StandardCard variant="default" className="text-center">
  <CardContent className="py-12">
    <Database className="w-12 h-12 mx-auto mb-4 text-[hsl(var(--claude-text-muted))]" />
    <h3 className="font-heading text-lg mb-2">No Data Yet</h3>
    <p className="text-[hsl(var(--claude-text-muted))] mb-4">
      Connect your platforms to start building your soul signature
    </p>
    <PrimaryButton>
      Get Started
    </PrimaryButton>
  </CardContent>
</StandardCard>
```

### Form Inputs
```tsx
<div className="space-y-4">
  <div>
    <label className="block text-sm font-ui font-medium mb-1">
      Email Address
    </label>
    <input
      type="email"
      className="w-full px-3 py-2 border border-[hsl(var(--claude-border))] rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--claude-accent))]"
      placeholder="you@example.com"
    />
  </div>

  <PrimaryButton className="w-full">
    Continue
  </PrimaryButton>
</div>
```

## Accessibility Checklist

- [ ] All interactive elements have focus states
- [ ] Color contrast meets WCAG AA standards
- [ ] Buttons have appropriate ARIA labels
- [ ] Loading states announce to screen readers
- [ ] Form inputs have associated labels
- [ ] Error messages are properly associated with inputs
- [ ] Keyboard navigation works throughout

## Component Export Index

```tsx
// Button Components
export * from '@/components/ui/StandardButton';

// Card Components
export * from '@/components/ui/StandardCard';

// Badge Components
export * from '@/components/ui/StandardBadge';

// Design Tokens
export * from '@/styles/design-tokens';
```

## Next Steps

1. Replace inline styles with standardized components
2. Use design tokens for all colors and spacing
3. Ensure consistent typography using font classes
4. Add loading and error states to all async operations
5. Implement toast notifications for user feedback

---

*For questions or suggestions about the component library, please contact the development team.*