# Hover Effects & Micro-Interactions Guide

## Overview

This guide documents the comprehensive hover states and micro-interactions system implemented across the Twin AI Learn platform. All effects are designed to be subtle, performant, and accessible.

## Table of Contents

1. [Animation System](#animation-system)
2. [CSS Hover Effects](#css-hover-effects)
3. [Framer Motion Components](#framer-motion-components)
4. [Component Usage](#component-usage)
5. [Accessibility](#accessibility)
6. [Performance](#performance)

---

## Animation System

### Location
`src/lib/animations.ts`

### Key Features

#### Timing Constants
```typescript
import { TIMING, EASING, TRANSFORM, SHADOWS } from '@/lib/animations';

// Usage
transition: `all ${TIMING.base}ms ${EASING.default}`;
```

**Available Timings:**
- `TIMING.fast` - 150ms (Quick feedback)
- `TIMING.base` - 200ms (Standard transitions)
- `TIMING.medium` - 300ms (Smooth animations)
- `TIMING.slow` - 500ms (Deliberate animations)
- `TIMING.verySlow` - 800ms (Emphasis animations)

**Available Easings:**
- `EASING.default` - Standard ease-in-out
- `EASING.easeOut` - Entrance animations
- `EASING.easeIn` - Exit animations
- `EASING.smooth` - Very smooth transitions
- `EASING.spring` - Spring-like bounce
- `EASING.bounce` - Subtle bounce

#### Framer Motion Variants
```typescript
import { fadeIn, fadeInUp, cardHover, buttonPress } from '@/lib/animations';

// Usage with motion components
<motion.div variants={fadeIn} initial="initial" animate="animate">
  Content
</motion.div>
```

**Available Variants:**
- `fadeIn` - Simple fade in/out
- `fadeInUp` - Fade with upward slide
- `fadeInDown` - Fade with downward slide
- `scaleIn` - Scale animation
- `cardHover` - Card lift effect
- `buttonPress` - Button press feedback
- `iconBounce` - Icon bounce on hover
- `shimmer` - Skeleton loading
- `successCheckmark` - Success animation
- `errorShake` - Error feedback
- `spinnerRotate` - Loading spinner
- `pulse` - Pulse effect
- `slideInLeft/Right` - Slide animations
- `badgeHover` - Badge scale effect
- `tabIndicator` - Tab active indicator

#### Accessibility
```typescript
import { respectReducedMotion, safeAnimation } from '@/lib/animations';

// Automatically respects prefers-reduced-motion
const variants = safeAnimation(fadeInUp);
```

---

## CSS Hover Effects

### Location
`src/styles/hover-effects.css`

Automatically imported via `src/index.css`.

### Button Hover Effects

#### Primary Button
```html
<button class="btn-primary">
  Click Me
</button>
```

**Effect:**
- Lifts 2px on hover
- Shadow increases
- Scales down on press (0.98)

#### Secondary Button
```html
<button class="btn-secondary">
  Secondary
</button>
```

**Effect:**
- Border glow on hover
- Background fade
- Active state feedback

#### Ghost Button
```html
<button class="btn-ghost">
  Ghost
</button>
```

**Effect:**
- Background fade on hover
- No shadow or lift

### Card Hover Effects

#### Standard Card
```html
<div class="card card-hover">
  Card content
</div>
```

**Effect:**
- Lifts 4px on hover
- Shadow increases

#### Platform Card (Enhanced)
```html
<div class="platform-card">
  Platform content
</div>
```

**Effect:**
- Lifts 6px on hover
- Scales to 1.02
- Gradient overlay fades in
- Enhanced shadow

### Navigation Hover Effects

```html
<a class="nav-item">
  Navigation Item
</a>
```

**Effect:**
- Background fade on hover
- Slides 2px to the right
- Active indicator with slide-in animation

### Link Hover Effects

```html
<a href="#">Link Text</a>
```

**Effect:**
- Underline animates from right to left on hover
- Color transition

### Input Hover Effects

```html
<input type="text" class="input" />
```

**Effect:**
- Border color changes on hover
- Focus ring with shadow
- Smooth transitions

### Icon Hover Effects

#### Standard Icon Hover
```html
<div class="icon">
  <svg>...</svg>
</div>
```

**Effect:**
- Lifts 2px on hover

#### Icon Bounce
```html
<div class="icon icon-bounce">
  <svg>...</svg>
</div>
```

**Effect:**
- Bounces up 4px with spring easing

#### Icon Rotate
```html
<div class="icon icon-rotate">
  <svg>...</svg>
</div>
```

**Effect:**
- Rotates 5deg and scales to 1.1

#### Icon Spin
```html
<div class="icon icon-spin">
  <svg>...</svg>
</div>
```

**Effect:**
- Full 360deg rotation

### Badge Hover Effects

```html
<span class="badge">Badge</span>
<span class="badge badge-interactive">Clickable Badge</span>
```

**Effect:**
- Scales to 1.05 on hover
- Interactive badges change background

### Loading Animations

#### Skeleton Shimmer
```html
<div class="skeleton w-full h-20 rounded-lg"></div>
```

**Effect:**
- Shimmer effect moving left to right

#### Spinner
```html
<div class="spinner w-6 h-6"></div>
```

**Effect:**
- Continuous rotation

#### Pulse
```html
<div class="pulse"></div>
```

**Effect:**
- Opacity pulses between 1 and 0.5

### State Animations

#### Success
```html
<div class="success-checkmark">
  <svg>...</svg>
</div>
```

**Effect:**
- Scales from 0 to 1.2 to 1 with spring

#### Error
```html
<div class="error-shake">
  Error message
</div>
```

**Effect:**
- Shakes horizontally

---

## Framer Motion Components

### Location
`src/components/ui/AnimatedWrapper.tsx`

### Basic Animations

#### FadeIn
```tsx
import { FadeIn } from '@/components/ui/AnimatedWrapper';

<FadeIn>
  <div>Content fades in</div>
</FadeIn>
```

#### FadeInUp
```tsx
import { FadeInUp } from '@/components/ui/AnimatedWrapper';

<FadeInUp>
  <div>Content slides up while fading in</div>
</FadeInUp>
```

#### ScaleIn
```tsx
import { ScaleIn } from '@/components/ui/AnimatedWrapper';

<ScaleIn>
  <div>Content scales in</div>
</ScaleIn>
```

### Hover Components

#### AnimatedCard
```tsx
import { AnimatedCard } from '@/components/ui/AnimatedWrapper';

<AnimatedCard className="p-6 bg-white rounded-lg">
  <h3>Card Title</h3>
  <p>Card lifts on hover</p>
</AnimatedCard>
```

#### AnimatedButton
```tsx
import { AnimatedButton } from '@/components/ui/AnimatedWrapper';

<AnimatedButton className="btn-primary">
  <button>Button with press effect</button>
</AnimatedButton>
```

#### AnimatedIcon
```tsx
import { AnimatedIcon } from '@/components/ui/AnimatedWrapper';

<AnimatedIcon>
  <Settings className="w-5 h-5" />
</AnimatedIcon>
```

### List Animations

#### Stagger Container
```tsx
import { StaggerContainer, StaggerItem } from '@/components/ui/AnimatedWrapper';

<StaggerContainer staggerDelay={0.1}>
  <StaggerItem>Item 1</StaggerItem>
  <StaggerItem>Item 2</StaggerItem>
  <StaggerItem>Item 3</StaggerItem>
</StaggerContainer>
```

#### Animated List
```tsx
import { AnimatedList } from '@/components/ui/AnimatedWrapper';

<AnimatedList
  items={['Item 1', 'Item 2', 'Item 3']}
  renderItem={(item) => <div>{item}</div>}
  staggerDelay={0.1}
/>
```

### Conditional Animations

```tsx
import { ConditionalAnimation } from '@/components/ui/AnimatedWrapper';

<ConditionalAnimation show={isVisible} animation="slideUp">
  <div>Shows/hides with animation</div>
</ConditionalAnimation>
```

### Page Transitions

```tsx
import { PageTransition } from '@/components/ui/AnimatedWrapper';

<PageTransition direction="up">
  <div>Page content</div>
</PageTransition>
```

### Scroll Animations

```tsx
import { ScrollAnimation } from '@/components/ui/AnimatedWrapper';

<ScrollAnimation threshold={0.1}>
  <div>Animates when scrolled into view</div>
</ScrollAnimation>
```

### Loading States

#### Pulse Loader
```tsx
import { PulseLoader } from '@/components/ui/AnimatedWrapper';

<PulseLoader className="w-20 h-20 bg-gray-200 rounded" />
```

#### Spin Loader
```tsx
import { SpinLoader } from '@/components/ui/AnimatedWrapper';

<SpinLoader className="w-6 h-6 border-2 border-primary" />
```

### Feedback Animations

#### Success
```tsx
import { SuccessCheckmark } from '@/components/ui/AnimatedWrapper';

<SuccessCheckmark className="w-20 h-20 text-green-500">
  <CheckIcon />
</SuccessCheckmark>
```

#### Error
```tsx
import { ErrorShake } from '@/components/ui/AnimatedWrapper';

<ErrorShake trigger={hasError}>
  <div>Error message shakes</div>
</ErrorShake>
```

---

## Component Usage

### Updated Button Component

The `Button` component now includes enhanced hover effects:

```tsx
import { Button } from '@/components/ui/button';

// Primary button - lifts and glows
<Button variant="default">Primary</Button>

// Secondary button - border glow
<Button variant="secondary">Secondary</Button>

// Outline button - background fade
<Button variant="outline">Outline</Button>

// Ghost button - subtle background
<Button variant="ghost">Ghost</Button>

// All buttons have press effect (scale down)
```

### Updated Card Component

The `Card` component now supports hover prop:

```tsx
import { Card } from '@/components/ui/card';

// Card with hover effect
<Card hover>
  <CardHeader>
    <CardTitle>Hoverable Card</CardTitle>
  </CardHeader>
  <CardContent>
    Content
  </CardContent>
</Card>

// Card without hover (default)
<Card>
  <CardContent>Static card</CardContent>
</Card>
```

### Icon with Tooltip Component

New component for icons with tooltips and animations:

```tsx
import {
  IconWithTooltip,
  IconButtonWithTooltip,
  IconBadgeWithTooltip,
  IconGroupWithTooltips,
  TruncatedTextWithTooltip,
  InfoTooltip,
} from '@/components/ui/IconWithTooltip';

// Basic icon with tooltip
<IconWithTooltip
  icon={<Settings className="w-5 h-5" />}
  tooltip="Settings"
  side="top"
/>

// Clickable icon button
<IconButtonWithTooltip
  icon={<Edit className="w-5 h-5" />}
  tooltip="Edit"
  onClick={() => console.log('Edit clicked')}
  variant="default"
  size="md"
/>

// Icon with badge
<IconBadgeWithTooltip
  icon={<Bell className="w-5 h-5" />}
  tooltip="Notifications"
  badgeContent={5}
  badgeVariant="error"
/>

// Group of icons
<IconGroupWithTooltips
  icons={[
    { icon: <Settings />, tooltip: 'Settings' },
    { icon: <User />, tooltip: 'Profile' },
    { icon: <LogOut />, tooltip: 'Logout' },
  ]}
  spacing="normal"
/>

// Truncated text with tooltip
<TruncatedTextWithTooltip
  text="This is a very long text that will be truncated"
  maxLength={20}
/>

// Info icon with explanatory tooltip
<InfoTooltip
  content="This is helpful information about the feature"
  side="right"
/>
```

---

## Accessibility

### Keyboard Navigation

All interactive elements have proper focus states:

```css
/* Global focus-visible */
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Button focus with ring */
button:focus-visible {
  box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.2);
}
```

### Reduced Motion

All animations respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

In TypeScript:
```typescript
import { respectReducedMotion, safeAnimation } from '@/lib/animations';

// Check if reduced motion is preferred
if (respectReducedMotion()) {
  // Disable or simplify animations
}

// Automatically disable animations if needed
const variants = safeAnimation(fadeInUp);
```

### Screen Readers

```html
<!-- Use sr-only class for screen reader only content -->
<span class="sr-only">Loading...</span>

<!-- Skip to content link -->
<a href="#main-content" class="skip-to-content">
  Skip to content
</a>
```

### ARIA Labels

Always provide ARIA labels for icon buttons:

```tsx
<IconButtonWithTooltip
  icon={<Edit />}
  tooltip="Edit profile"
  ariaLabel="Edit profile"
  onClick={handleEdit}
/>
```

---

## Performance

### GPU Acceleration

All animations use GPU-accelerated properties:

```css
/* Good - GPU accelerated */
transform: translateY(-4px);
opacity: 0.5;

/* Avoid - CPU bound */
top: -4px;
height: 100px;
```

### Will-Change

Critical hover effects use `will-change`:

```css
.card {
  will-change: transform, box-shadow;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Prevent Layout Shift

```html
<div class="prevent-shift">
  <!-- Content that animates -->
</div>
```

### Utility Classes

```html
<!-- Disable all animations for an element -->
<div class="no-motion">
  Static content
</div>

<!-- Hint GPU acceleration -->
<div class="gpu-accelerated">
  Animated content
</div>

<!-- Smooth scrolling -->
<div class="smooth-scroll">
  Scrollable content
</div>
```

---

## Best Practices

### 1. Consistent Timing
Use the timing constants for consistency:
```typescript
import { TIMING } from '@/lib/animations';
// Always use TIMING.base (200ms) for standard transitions
```

### 2. Subtle Effects
Keep hover effects subtle - not distracting:
```css
/* Good */
hover: transform: translateY(-2px);

/* Too much */
hover: transform: translateY(-20px) rotate(45deg) scale(2);
```

### 3. Performance First
Always use GPU-accelerated properties:
```css
/* Good */
transform: translateY(-4px);
opacity: 0.8;

/* Avoid */
top: -4px;
visibility: hidden;
```

### 4. Accessibility Always
Never forget reduced motion and focus states:
```tsx
const variants = safeAnimation(fadeInUp); // Automatic
```

### 5. Mobile Touch States
Ensure touch states are clear:
```css
button:active {
  transform: scale(0.98);
}
```

---

## Examples

### Complete Button Example
```tsx
import { Button } from '@/components/ui/button';
import { IconWithTooltip } from '@/components/ui/IconWithTooltip';
import { Settings } from 'lucide-react';

function MyComponent() {
  return (
    <div className="flex items-center gap-4">
      <Button variant="default">
        Primary Action
      </Button>

      <Button variant="outline">
        Secondary
      </Button>

      <IconWithTooltip
        icon={<Settings className="w-5 h-5" />}
        tooltip="Settings"
        onClick={() => console.log('Settings')}
      />
    </div>
  );
}
```

### Complete Card Example
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AnimatedCard } from '@/components/ui/AnimatedWrapper';

function PlatformCard({ platform }) {
  return (
    <AnimatedCard>
      <Card hover className="platform-card">
        <CardHeader>
          <CardTitle>{platform.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{platform.description}</p>
          <Button variant="outline" className="mt-4">
            Connect
          </Button>
        </CardContent>
      </Card>
    </AnimatedCard>
  );
}
```

### Complete List Animation Example
```tsx
import { StaggerContainer, StaggerItem } from '@/components/ui/AnimatedWrapper';
import { Card } from '@/components/ui/card';

function PlatformList({ platforms }) {
  return (
    <StaggerContainer staggerDelay={0.1} className="grid grid-cols-3 gap-4">
      {platforms.map((platform) => (
        <StaggerItem key={platform.id}>
          <Card hover>
            <CardContent>
              <h3>{platform.name}</h3>
            </CardContent>
          </Card>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
```

---

## Summary

The Twin AI Learn platform now has a comprehensive hover states and micro-interactions system that includes:

- **300+ lines of CSS hover effects** in `hover-effects.css`
- **2000+ lines of animation utilities** in `animations.ts`
- **1000+ lines of Framer Motion components** in `AnimatedWrapper.tsx`
- **Enhanced components**: Button, Card, NavigationSidebar
- **New components**: IconWithTooltip and variants
- **Full accessibility support** with reduced motion and keyboard navigation
- **Performance optimized** with GPU acceleration and will-change hints

All effects are:
- Subtle and professional
- Consistent (200-300ms timing)
- Accessible (reduced motion support)
- Performant (GPU-accelerated)
- Mobile-friendly (touch states)
- Keyboard navigable (focus indicators)

**Files Created/Modified:**
1. `src/lib/animations.ts` - Animation utilities and Framer Motion variants
2. `src/styles/hover-effects.css` - Comprehensive CSS hover effects
3. `src/components/ui/AnimatedWrapper.tsx` - Framer Motion wrapper components
4. `src/components/ui/IconWithTooltip.tsx` - Icon tooltip components
5. `src/index.css` - Updated to import hover-effects.css
6. `src/components/ui/button.tsx` - Enhanced with hover effects
7. `src/components/ui/card.tsx` - Added hover prop
8. `src/components/navigation/NavigationSidebar.tsx` - Enhanced hover states

Use this guide as reference when adding new components or features to the platform.
