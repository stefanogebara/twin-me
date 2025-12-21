# Animation & Hover Effects Cheat Sheet

Quick reference for developers working on Twin AI Learn.

## Quick Imports

```typescript
// Animation utilities
import { TIMING, EASING, TRANSFORM } from '@/lib/animations';
import { fadeIn, cardHover, buttonPress } from '@/lib/animations';
import { respectReducedMotion, safeAnimation } from '@/lib/animations';

// Animated components
import {
  FadeIn, FadeInUp, ScaleIn,
  AnimatedCard, AnimatedButton, AnimatedIcon,
  StaggerContainer, StaggerItem,
  PageTransition, ScrollAnimation
} from '@/components/ui/AnimatedWrapper';

// Icon tooltips
import {
  IconWithTooltip,
  IconButtonWithTooltip,
  InfoTooltip
} from '@/components/ui/IconWithTooltip';
```

## Common Patterns

### Button with Hover
```tsx
<Button variant="default">Lifts & glows on hover</Button>
<Button variant="outline">Border glow</Button>
<Button variant="ghost">Background fade</Button>
```

### Card with Hover
```tsx
<Card hover>Lifts on hover</Card>
<Card>No hover effect</Card>
```

### Icon with Tooltip
```tsx
<IconWithTooltip
  icon={<Settings />}
  tooltip="Settings"
/>
```

### Clickable Icon
```tsx
<IconButtonWithTooltip
  icon={<Edit />}
  tooltip="Edit"
  onClick={handleEdit}
/>
```

### Animated Entry
```tsx
<FadeInUp>
  <div>Content slides up</div>
</FadeInUp>
```

### List Animation
```tsx
<StaggerContainer>
  <StaggerItem>Item 1</StaggerItem>
  <StaggerItem>Item 2</StaggerItem>
</StaggerContainer>
```

### Page Transition
```tsx
<PageTransition direction="up">
  <div>Page content</div>
</PageTransition>
```

### Scroll Animation
```tsx
<ScrollAnimation>
  <div>Fades in when visible</div>
</ScrollAnimation>
```

## CSS Classes

### Buttons
- `.btn-primary` - Lift + shadow on hover
- `.btn-secondary` - Border glow
- `.btn-ghost` - Background fade

### Cards
- `.card` - Standard card
- `.card-hover` - Lifts on hover
- `.platform-card` - Enhanced lift + scale

### Icons
- `.icon` - Standard lift
- `.icon-bounce` - Bounce effect
- `.icon-rotate` - Rotate + scale
- `.icon-spin` - Full rotation

### Loading
- `.skeleton` - Shimmer effect
- `.spinner` - Rotation
- `.pulse` - Opacity pulse

### States
- `.success-checkmark` - Scale animation
- `.error-shake` - Shake effect

### Navigation
- `.nav-item` - Background + slide
- `.sidebar-item` - Background + slide

### Utilities
- `.no-motion` - Disable animations
- `.gpu-accelerated` - Hint GPU
- `.smooth-scroll` - Smooth scrolling

## Timing Reference

```typescript
TIMING.fast    // 150ms - Quick feedback
TIMING.base    // 200ms - Standard (use this most)
TIMING.medium  // 300ms - Smooth
TIMING.slow    // 500ms - Deliberate
```

## Easing Reference

```typescript
EASING.default  // Standard ease-in-out
EASING.easeOut  // Entrance animations
EASING.smooth   // Very smooth
EASING.spring   // Bouncy
```

## Accessibility

### Always Use
```typescript
// In Framer Motion
const variants = safeAnimation(fadeInUp);

// In CSS - automatic via media query
// @media (prefers-reduced-motion: reduce)
```

### Focus States
```tsx
// Automatic on all interactive elements
<button>Has focus ring</button>

// Custom focus
className="focus:ring-2 focus:ring-primary"
```

### ARIA Labels
```tsx
<IconButtonWithTooltip
  icon={<Edit />}
  tooltip="Edit"
  ariaLabel="Edit profile" // Always provide
  onClick={handleEdit}
/>
```

## Performance Tips

### DO
```css
transform: translateY(-4px);  /* GPU accelerated */
opacity: 0.8;                  /* GPU accelerated */
```

### DON'T
```css
top: -4px;        /* CPU bound - avoid */
height: 100px;    /* CPU bound - avoid */
```

### Optimize
```typescript
// Add will-change for critical animations
className="hover:shadow-lg"
// becomes
className="hover:shadow-lg will-change-transform"
```

## Common Use Cases

### Platform Connection Card
```tsx
<AnimatedCard>
  <Card hover className="platform-card">
    <CardHeader>
      <CardTitle>Spotify</CardTitle>
    </CardHeader>
    <CardContent>
      <Button variant="outline">Connect</Button>
    </CardContent>
  </Card>
</AnimatedCard>
```

### Action Button with Icon
```tsx
<Button variant="default" className="gap-2">
  <IconWithTooltip
    icon={<Plus className="w-4 h-4" />}
    tooltip="Add new"
  />
  Add New
</Button>
```

### Settings Icon Button
```tsx
<IconButtonWithTooltip
  icon={<Settings className="w-5 h-5" />}
  tooltip="Settings"
  onClick={() => navigate('/settings')}
  variant="ghost"
/>
```

### Loading State
```tsx
{isLoading ? (
  <div className="flex items-center gap-2">
    <SpinLoader className="w-5 h-5 border-2 border-primary" />
    <span>Loading...</span>
  </div>
) : (
  <div>Content</div>
)}
```

### Success Feedback
```tsx
{showSuccess && (
  <SuccessCheckmark className="w-20 h-20 text-green-500">
    <CheckCircle />
  </SuccessCheckmark>
)}
```

### Error Feedback
```tsx
<ErrorShake trigger={hasError}>
  <Alert variant="destructive">
    {errorMessage}
  </Alert>
</ErrorShake>
```

### Truncated Text with Tooltip
```tsx
<TruncatedTextWithTooltip
  text={longPlatformName}
  maxLength={20}
/>
```

### Info Helper
```tsx
<div className="flex items-center gap-2">
  <label>Privacy Level</label>
  <InfoTooltip
    content="Controls how much data is shared"
    side="right"
  />
</div>
```

## Mobile Considerations

### Touch States
```css
/* Automatic on all buttons */
button:active {
  transform: scale(0.98);
}
```

### Touch Targets
```tsx
// Minimum 44x44px for touch
<IconButtonWithTooltip
  size="lg"  // Larger for mobile
  icon={<Menu />}
  tooltip="Menu"
/>
```

### Reduce Motion on Mobile
```typescript
// Automatic via prefers-reduced-motion
// Consider disabling complex animations on low-end devices
```

## Testing Checklist

- [ ] Hover states visible and smooth
- [ ] Active/press states provide feedback
- [ ] Focus indicators visible (keyboard nav)
- [ ] Animations respect reduced motion
- [ ] Touch targets adequate on mobile
- [ ] Loading states have spinners/skeletons
- [ ] Error states shake or show feedback
- [ ] Success states have checkmarks
- [ ] Tooltips appear on hover/focus
- [ ] No layout shift during animations
- [ ] Performance: 60fps animations
- [ ] ARIA labels on icon buttons

## Debug Tips

### View Applied Animations
```javascript
// In browser console
window.matchMedia('(prefers-reduced-motion: reduce)').matches
// true = animations disabled
// false = animations enabled
```

### Force Reduced Motion
```css
/* Add to body temporarily */
body {
  animation-duration: 0.01ms !important;
  transition-duration: 0.01ms !important;
}
```

### Check GPU Acceleration
```javascript
// In DevTools Performance tab
// Look for green bars (GPU) vs purple (CPU)
```

## Quick Wins

### Make any card hoverable
```tsx
<Card hover>
  {/* Content */}
</Card>
```

### Add tooltip to any icon
```tsx
<IconWithTooltip icon={<Icon />} tooltip="Label" />
```

### Animate list items
```tsx
<StaggerContainer>
  {items.map(item => (
    <StaggerItem key={item.id}>
      <Card>{item.name}</Card>
    </StaggerItem>
  ))}
</StaggerContainer>
```

### Show loading state
```tsx
<div className="skeleton w-full h-20" />
```

### Add info helper
```tsx
<InfoTooltip content="Helpful explanation" />
```

---

**Remember:**
- Use `TIMING.base` (200ms) for most transitions
- Always use `safeAnimation()` with Framer Motion
- Provide ARIA labels for icon buttons
- Test with keyboard navigation
- Check `prefers-reduced-motion` is respected
- Keep effects subtle and professional
