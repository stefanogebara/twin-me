# Soul Signature Design Skill

## Overview

This skill ensures all frontend components for the Soul Signature platform (TwinMe) maintain our distinctive Anthropic-inspired aesthetic and avoid generic AI design patterns.

## Core Design Philosophy

> "Perhaps we are searching in the branches for what we only find in the roots." - Rami

The Soul Signature platform captures authentic personality, not generic personas. Our design reflects this through:
- **Warmth over clinical**: Ivory backgrounds instead of stark white
- **Personality over perfection**: Serif body text with character
- **Subtlety over flash**: Gentle animations, not bouncing gradients
- **Authority over trendy**: Classic typography choices

## Typography System

### ❌ AVOID:
- Inter (overused in AI interfaces)
- Roboto (generic Material Design)
- System fonts as primary choices
- Thin weights (< 400)

### ✅ USE:

**Headlines (Space Grotesk - Medium 500)**
```css
font-family: 'Space Grotesk', system-ui, sans-serif;
font-weight: 500;
line-height: 1.1;
letter-spacing: -0.02em;
```

**Body Text (Source Serif 4 - Regular 400)**
```css
font-family: 'Source Serif 4', Georgia, serif;
font-weight: 400;
line-height: 1.6;
```

**UI Elements (DM Sans - Regular 400/Medium 500)**
```css
font-family: 'DM Sans', system-ui, sans-serif;
```

## Color Palette

### ❌ AVOID:
- Purple gradients (#6B46C1, #9333EA)
- Stark white backgrounds (#FFFFFF as main)
- Neon accent colors
- Harsh black text (#000000)

### ✅ USE:

**Backgrounds:**
```css
--claude-bg: 40 20% 98%;          /* #FAF9F5 - Warm ivory */
--claude-surface: 0 0% 100%;      /* #FFFFFF - White cards */
```

**Text:**
```css
--claude-text: 25 6% 8%;          /* #141413 - Deep slate */
--claude-text-secondary: 0 0% 35%; /* #595959 - Medium slate */
--claude-text-muted: 0 0% 55%;    /* #8C8C8C - Light slate */
```

**Accents:**
```css
--claude-accent: 28 80% 52%;      /* #D97706 - Warm orange */
--claude-accent-hover: 28 90% 38%; /* #B45309 - Deep orange */
```

**Borders:**
```css
--claude-border: rgba(20, 20, 19, 0.1); /* Subtle slate */
```

## Animation Philosophy

### ❌ AVOID:
- Bouncing effects
- Spinning loaders
- Gradient sweeps
- Excessive transforms
- Auto-playing animations

### ✅ USE:

**Micro-interactions (< 200ms)**
```css
transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
```

**Content reveals (200-300ms)**
```css
transition: opacity 250ms ease-out, transform 250ms ease-out;
```

**Page transitions (300-500ms)**
```css
transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
```

**Example - Subtle hover lift:**
```css
.card {
  transition: transform 150ms ease-out, box-shadow 150ms ease-out;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(20, 20, 19, 0.08);
}
```

## Background Treatments

### ❌ AVOID:
- Solid flat backgrounds everywhere
- Loud gradients (purple to pink)
- Geometric patterns as primary background
- Animated gradient backgrounds

### ✅ USE:

**Primary:**
```css
background: hsl(var(--claude-bg));
```

**Elevated surfaces:**
```css
background: hsl(var(--claude-surface));
border: 1px solid rgba(20, 20, 19, 0.1);
```

**Subtle depth (cards, modals):**
```css
background: hsl(var(--claude-surface));
box-shadow: 0 2px 8px rgba(20, 20, 19, 0.06);
```

**Hero sections (atmospheric, not flat):**
```css
background: linear-gradient(
  135deg,
  hsl(var(--claude-bg)) 0%,
  hsl(40 20% 96%) 100%
);
```

## Component Patterns

### Buttons

**Primary CTA:**
```tsx
<button className="
  px-6 py-3
  bg-[hsl(var(--claude-accent))]
  hover:bg-[hsl(var(--claude-accent-hover))]
  text-white font-ui font-medium
  rounded-lg
  transition-all duration-150
  hover:shadow-md
">
  Connect Platform
</button>
```

**Secondary:**
```tsx
<button className="
  px-6 py-3
  bg-white
  text-[hsl(var(--claude-text))]
  border border-[hsl(var(--claude-border))]
  font-ui font-medium
  rounded-lg
  transition-all duration-150
  hover:border-[hsl(var(--claude-accent))]
">
  Learn More
</button>
```

### Cards

```tsx
<div className="
  bg-[hsl(var(--claude-surface))]
  border border-[hsl(var(--claude-border))]
  rounded-xl
  p-6
  transition-all duration-150
  hover:shadow-lg hover:-translate-y-1
">
  <h3 className="font-heading text-2xl mb-3">Soul Signature</h3>
  <p className="font-body text-[hsl(var(--claude-text-secondary))] leading-relaxed">
    Discover what makes you authentically you.
  </p>
</div>
```

### Empty States

```tsx
<div className="
  flex flex-col items-center justify-center
  py-16 px-6 text-center
">
  <div className="w-16 h-16 mb-4 text-[hsl(var(--claude-accent))]">
    {/* Icon */}
  </div>
  <h3 className="font-heading text-xl mb-2">No Platforms Connected</h3>
  <p className="font-body text-[hsl(var(--claude-text-secondary))] max-w-md mb-6">
    Connect your platforms to start building your soul signature
  </p>
  <button className="px-6 py-3 bg-[hsl(var(--claude-accent))] text-white font-ui font-medium rounded-lg">
    Get Started
  </button>
</div>
```

## Layout Principles

### ❌ AVOID:
- Overly cramped spacing
- Excessive max-widths (< 800px for prose)
- Fixed heights that clip content
- Inconsistent spacing scales

### ✅ USE:

**Spacing Scale (8px base unit):**
```
xs: 0.5rem  (8px)
sm: 0.75rem (12px)
md: 1rem    (16px)
lg: 1.5rem  (24px)
xl: 2rem    (32px)
2xl: 3rem   (48px)
3xl: 4rem   (64px)
```

**Content widths:**
```css
/* Prose content */
max-width: 65ch; /* ~1000px */

/* Dashboard content */
max-width: 1200px;

/* Full width sections */
max-width: 100%;
```

**Vertical rhythm:**
```css
/* Section spacing */
padding-top: 4rem;
padding-bottom: 4rem;

/* Component spacing */
gap: 1.5rem; /* Between cards/items */
```

## Accessibility Requirements

### Focus States
```css
:focus-visible {
  outline: 2px solid hsl(var(--claude-accent));
  outline-offset: 2px;
  border-radius: 0.25rem;
}
```

### Color Contrast
- All text must meet WCAG AA (4.5:1 for normal text, 3:1 for large)
- Interactive elements must be visually distinct
- Never rely on color alone for information

### Semantic HTML
```tsx
// ✅ Good
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/soul-dashboard">Dashboard</a></li>
  </ul>
</nav>

// ❌ Bad
<div className="nav">
  <div onClick={navigate}>Dashboard</div>
</div>
```

## Loading States

### ❌ AVOID:
- Spinners as only indicator
- Skeleton screens with shimmer animations
- "Loading..." text without context

### ✅ USE:

```tsx
// Subtle pulsing
<div className="animate-pulse">
  <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
  <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
</div>

// Or progressive content reveal
<div className="opacity-50 transition-opacity duration-300">
  {/* Show actual content structure */}
</div>
```

## Error States

```tsx
<div className="
  border-l-4 border-red-500
  bg-red-50
  p-4 rounded-r-lg
">
  <div className="flex items-start">
    <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0" />
    <div>
      <h4 className="font-ui font-medium text-red-900 mb-1">Connection Failed</h4>
      <p className="font-body text-red-700 text-sm">
        Unable to connect to Spotify. Please check your credentials and try again.
      </p>
    </div>
  </div>
</div>
```

## Implementation Checklist

When creating or reviewing components, verify:

- [ ] Uses Space Grotesk for headings (not Inter/Roboto)
- [ ] Uses Source Serif 4 for body text
- [ ] Uses DM Sans for UI elements
- [ ] Background is warm ivory (#FAF9F5), not stark white
- [ ] Accent color is orange (#D97706), not purple
- [ ] Animations are subtle (< 200ms micro-interactions)
- [ ] No bouncing or spinning effects
- [ ] Focus states visible with orange outline
- [ ] Proper semantic HTML
- [ ] WCAG AA color contrast
- [ ] Spacing follows 8px grid system
- [ ] Cards have subtle hover effects (lift + shadow)
- [ ] Empty states include icon, heading, description, CTA
- [ ] Error states use colored border, not just background
- [ ] Loading states show content structure, not just spinners

## Usage Examples

**Invoke this skill when:**
- "Design a new dashboard card for displaying soul signature insights"
- "Create a platform connection modal"
- "Build an empty state for the privacy controls page"
- "Review this component for Soul Signature design compliance"

**Example invocation:**
```
Use the soul-signature-design skill to create a card component that displays
a user's top personality traits with visual indicators.
```

---

Generated: 2025-11-13
Last Updated: 2025-11-13
Version: 1.0.0
