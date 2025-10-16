# Soul Signature Platform - Design Principles & UI/UX Standards

## I. Core Design Philosophy

> "Perhaps we are searching in the branches for what we only find in the roots." - Rami

The Soul Signature platform captures authentic digital identity through sophisticated, trustworthy, and elegant design. Our UI/UX must reflect the depth and authenticity of the soul signatures we extract.

### Guiding Principles

- **Authenticity Over Flash**: Design should feel genuine, warm, and human - not gimmicky or overly animated
- **Clarity & Trust**: Users are sharing deeply personal data; the UI must radiate transparency and trustworthiness
- **Sophisticated Simplicity**: Complex AI-powered features presented through elegant, intuitive interfaces
- **Contextual Privacy**: Privacy controls should be granular, visual, and always accessible
- **Performance as UX**: Fast loading, instant feedback, smooth transitions
- **Accessibility First**: WCAG AA+ compliance on all interactive elements

## II. Design System Foundation (Anthropic-Inspired)

### Color Palette

Our platform uses an Anthropic-inspired color system with HSL custom properties:

**Light Mode:**
```css
--claude-bg: 40 20% 97%           /* #FAF9F5 - Warm ivory background */
--claude-surface: 0 0% 100%        /* #FFFFFF - Pure white cards */
--claude-surface-raised: 40 15% 95% /* Slightly elevated surfaces */

--claude-text: 24 6% 8%            /* #141413 - Deep slate text */
--claude-text-muted: 0 0% 35%      /* #595959 - Secondary text */
--claude-text-subtle: 0 0% 55%     /* #8C8C8C - Tertiary text */

--claude-accent: 28 90% 44%        /* #D97706 - Warm orange accent */
--claude-accent-hover: 28 85% 35%  /* #B45309 - Darker orange hover */

--claude-border: 24 6% 8% / 0.1    /* rgba(20, 20, 19, 0.1) - Subtle borders */
--claude-border-strong: 24 6% 8% / 0.2
```

**Dark Mode:**
```css
--claude-bg: 220 13% 9%            /* #14151A - Deep blue-black */
--claude-surface: 220 13% 12%      /* #1C1E26 - Elevated surfaces */
--claude-surface-raised: 220 13% 15%

--claude-text: 0 0% 95%            /* #F2F2F2 - Light text */
--claude-text-muted: 0 0% 70%      /* #B3B3B3 - Secondary text */
--claude-text-subtle: 0 0% 50%     /* #808080 - Tertiary text */

--claude-accent: 28 90% 55%        /* #F59E0B - Brighter orange for dark mode */
--claude-accent-hover: 28 90% 44%  /* #D97706 - Orange hover */
```

**Semantic Colors:**
```css
--success: 142 76% 36%             /* #16A34A - Green */
--error: 0 84% 60%                 /* #EF4444 - Red */
--warning: 43 96% 56%              /* #F59E0B - Amber */
--info: 217 91% 60%                /* #3B82F6 - Blue */
```

### Typography Scale

**Font Families:**
```css
--font-heading: 'Space Grotesk', system-ui, sans-serif
--font-body: 'Source Serif 4', Georgia, serif
--font-ui: 'DM Sans', system-ui, sans-serif
```

**Type Scale:**
```css
/* Headlines (Space Grotesk) */
--text-5xl: 3rem / 1.1            /* 48px - Hero headlines */
--text-4xl: 2.5rem / 1.1          /* 40px - Page titles */
--text-3xl: 2rem / 1.2            /* 32px - Section headers */
--text-2xl: 1.5rem / 1.3          /* 24px - Card headers */
--text-xl: 1.25rem / 1.4          /* 20px - Subheaders */

/* Body & UI (Source Serif 4 / DM Sans) */
--text-lg: 1.125rem / 1.6         /* 18px - Large body */
--text-base: 1rem / 1.6           /* 16px - Default body */
--text-sm: 0.875rem / 1.5         /* 14px - Small text */
--text-xs: 0.75rem / 1.4          /* 12px - Captions */
```

**Font Weights:**
```css
--font-normal: 400
--font-medium: 500
--font-semibold: 600
--font-bold: 700
```

### Spacing System

8px base unit with consistent scale:
```css
--space-1: 0.25rem   /* 4px */
--space-2: 0.5rem    /* 8px */
--space-3: 0.75rem   /* 12px */
--space-4: 1rem      /* 16px */
--space-5: 1.25rem   /* 20px */
--space-6: 1.5rem    /* 24px */
--space-8: 2rem      /* 32px */
--space-10: 2.5rem   /* 40px */
--space-12: 3rem     /* 48px */
--space-16: 4rem     /* 64px */
--space-20: 5rem     /* 80px */
```

### Border Radii

```css
--radius-sm: 0.375rem    /* 6px - Buttons, inputs */
--radius-md: 0.5rem      /* 8px - Cards */
--radius-lg: 0.75rem     /* 12px - Modals, major containers */
--radius-xl: 1rem        /* 16px - Hero sections */
--radius-2xl: 1.5rem     /* 24px - Special emphasis */
--radius-full: 9999px    /* Pills, avatars */
```

### Shadows

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1)
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1)
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1)
```

## III. Component Design Standards

### Buttons

**Button Hierarchy:**
1. **Primary**: Soul signature extraction, major CTAs (orange accent)
2. **Secondary**: Navigation, confirmations (border with text color)
3. **Ghost/Tertiary**: Utility actions, cancel (minimal styling)
4. **Destructive**: Delete, disconnect (red semantic)

**Button States:**
- Default: Clear, high contrast
- Hover: Subtle background darkening
- Active: Slight scale transform (0.98)
- Disabled: 50% opacity + not-allowed cursor
- Focus: 2px ring with accent color

**Implementation Pattern:**
```tsx
<Button className="bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent))]/90 text-white">
  <Sparkles className="w-4 h-4 mr-2" />
  Extract Soul Signature
</Button>
```

### Cards

**Card Types:**
1. **Content Cards**: Platform connections, life clusters
2. **Interactive Cards**: Clickable, with hover state
3. **Info Cards**: Static information display
4. **Elevated Cards**: Important status, warnings

**Card Structure:**
```tsx
<Card className="p-6 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
  {/* Icon/Image */}
  <div className="mb-4">{icon}</div>

  {/* Header */}
  <h3 className="text-xl font-semibold text-[hsl(var(--claude-text))] mb-2">
    Card Title
  </h3>

  {/* Content */}
  <p className="text-sm text-[hsl(var(--claude-text-muted))]">
    Card description text
  </p>

  {/* Actions (optional) */}
  <div className="mt-4">{actions}</div>
</Card>
```

### Forms & Inputs

**Input Standards:**
- Always include labels (accessible via `htmlFor`)
- Helper text for complex fields
- Clear error messages with visual indicators
- Proper placeholder text (examples, not instructions)
- Consistent height: 40px (h-10)
- Focus ring: 2px with accent color

**Input States:**
```css
/* Default */
border: 1px solid hsl(var(--claude-border))
background: hsl(var(--claude-surface))

/* Focus */
border-color: hsl(var(--claude-accent))
ring: 2px hsl(var(--claude-accent) / 0.2)

/* Error */
border-color: hsl(var(--error))
ring: 2px hsl(var(--error) / 0.2)

/* Disabled */
opacity: 0.5
cursor: not-allowed
```

### Privacy Spectrum Sliders

**Special UI Component - Intensity Controls:**
- 0-100% thermometer-style sliders
- Visual color gradient (low = cool, high = warm)
- Real-time value display
- Cluster grouping (Personal, Professional, Creative)
- Clear labels with context tooltips

**Implementation:**
```tsx
<div className="space-y-2">
  <div className="flex justify-between">
    <span className="text-sm font-medium">{clusterName}</span>
    <span className="text-sm text-muted">{value}%</span>
  </div>
  <Slider
    value={[value]}
    onValueChange={([newValue]) => onChange(newValue)}
    min={0}
    max={100}
    step={5}
    className="w-full"
  />
</div>
```

### Status Badges

**Badge Types:**
1. **Connection Status**: Connected (green), Not Connected (gray), Error (red)
2. **Extraction Status**: Pending, Extracting, Complete, Failed
3. **Data Quality**: High (green), Medium (yellow), Low (red)

**Badge Pattern:**
```tsx
<Badge className="bg-[hsl(var(--success))] text-white">
  <CheckCircle className="w-3 h-3 mr-1" />
  Connected
</Badge>
```

### Loading States

**Loading Patterns:**
1. **Skeleton Screens**: For page/section loads
2. **Spinners**: For button actions, small components
3. **Progress Bars**: For multi-step extraction pipeline
4. **Pulse Animation**: For pending data

**Implementation:**
```tsx
{isLoading ? (
  <div className="flex items-center gap-2">
    <Loader2 className="w-4 h-4 animate-spin" />
    <span>Extracting...</span>
  </div>
) : (
  <span>Extract Soul Signature</span>
)}
```

## IV. Page-Specific Design Guidelines

### Soul Signature Dashboard

**Layout Structure:**
- Hero section with user soul signature visualization
- Three-column life clusters (Personal, Professional, Creative)
- Connection status cards grid
- Extraction CTA prominently placed
- Privacy controls accessible via sidebar

**Key Elements:**
- Large, compelling "Extract Soul Signature" button
- Visual representation of soul signature strength
- Platform connection grid (3-4 columns on desktop)
- Real-time extraction progress when active

### Platform Connection Pages

**Connection Flow:**
1. Platform card grid with clear status indicators
2. OAuth connection flow with loading states
3. Success confirmation with next steps
4. Error handling with retry options

**Visual Indicators:**
- Connected: Green checkmark, platform icon
- Not Connected: Gray, "Connect" button
- Error: Red indicator, error message

### Privacy Controls Dashboard

**Thermometer Slider Interface:**
- Grouped by life clusters
- 0-100% intensity visualization
- Color-coded sliders (gradient from blue → orange)
- Real-time preview of what's shared
- Audience-specific settings tabs

**Visual Hierarchy:**
1. Global privacy level (top)
2. Cluster categories (sections)
3. Individual cluster sliders (items)

### Chat/Twin Interaction Pages

**Chat Interface Standards:**
- Clean message bubbles (user vs AI twin)
- Personality indicators in AI responses
- Source attribution for RAG responses
- Clear thinking/typing indicators
- Accessible keyboard navigation

**Message Styling:**
```tsx
{/* User message */}
<div className="bg-[hsl(var(--claude-surface-raised))] p-4 rounded-lg">
  {message}
</div>

{/* AI Twin message */}
<div className="bg-[hsl(var(--claude-accent))] bg-opacity-10 p-4 rounded-lg">
  {message}
</div>
```

## V. Interaction Design & Animations

### Animation Principles

**Timing:**
- Fast interactions: 150ms (hover, focus)
- Standard transitions: 200-300ms (modals, dropdowns)
- Page transitions: 400ms max
- Loading animations: Continuous until complete

**Easing:**
```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
--ease-out: cubic-bezier(0, 0, 0.2, 1)
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)
```

### Micro-interactions

**Hover States:**
- Buttons: Background darkening + slight scale (1.02)
- Cards: Subtle shadow elevation
- Links: Underline appearance

**Click States:**
- Buttons: Scale down (0.98) + brief opacity change
- Toggle switches: Smooth slide transition
- Checkboxes: Check mark animation

**Focus States:**
- All interactive elements: 2px ring with accent color
- Skip to content link for keyboard navigation

### Page Transitions

**Route Changes:**
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
  transition={{ duration: 0.3 }}
>
  {children}
</motion.div>
```

## VI. Responsive Design Standards

### Breakpoints

```css
--screen-sm: 640px   /* Mobile landscape */
--screen-md: 768px   /* Tablet */
--screen-lg: 1024px  /* Desktop */
--screen-xl: 1280px  /* Large desktop */
--screen-2xl: 1536px /* Extra large */
```

### Layout Patterns

**Desktop (1440px+):**
- 3-column card grids
- Sidebar navigation (240px)
- Full feature visibility

**Tablet (768px-1023px):**
- 2-column card grids
- Collapsible sidebar
- Optimized touch targets (44px min)

**Mobile (375px-767px):**
- Single column layout
- Bottom navigation bar
- Stack all content vertically
- Hamburger menu for navigation

### Touch Optimization

**Minimum Touch Targets:**
- Buttons: 44x44px
- Links: 44px height
- Toggle switches: 48px width
- Slider handles: 44x44px hit area

## VII. Accessibility Standards (WCAG 2.1 AA+)

### Color Contrast

**Text Contrast Requirements:**
- Normal text (< 18px): 4.5:1 minimum
- Large text (≥ 18px or 14px bold): 3:1 minimum
- UI components & graphics: 3:1 minimum

**Tested Combinations:**
```
✓ --claude-text on --claude-bg: 14.5:1
✓ --claude-text-muted on --claude-bg: 7.2:1
✓ White text on --claude-accent: 4.8:1
✓ --claude-text on --claude-surface: 21:1
```

### Keyboard Navigation

**Required Patterns:**
- Tab order follows visual hierarchy
- Focus indicators always visible (2px ring)
- Skip to main content link
- Escape closes modals/dropdowns
- Arrow keys navigate menus/sliders
- Enter/Space activates buttons

**Focus Management:**
```tsx
{/* Trap focus in modals */}
<Dialog>
  <DialogContent onOpenAutoFocus={(e) => {
    e.preventDefault();
    firstInputRef.current?.focus();
  }}>
    {content}
  </DialogContent>
</Dialog>
```

### Screen Reader Support

**Semantic HTML:**
- Use `<main>`, `<nav>`, `<section>`, `<article>`
- Proper heading hierarchy (h1 → h6)
- `<button>` for actions, `<a>` for navigation
- Form labels with `htmlFor`

**ARIA Attributes:**
```tsx
{/* Loading states */}
<button aria-busy={isLoading} aria-live="polite">
  {isLoading ? "Loading..." : "Submit"}
</button>

{/* Status indicators */}
<div role="status" aria-live="polite">
  {statusMessage}
</div>

{/* Toggle switches */}
<Switch aria-label="Enable dark mode" aria-checked={isDark} />
```

### Alternative Text

**Images:**
- Decorative: `alt=""` (empty, not omitted)
- Informative: Descriptive alt text
- Platform logos: `alt="Spotify logo"`
- User avatars: `alt="User profile picture"`

**Icons:**
- If with text: `aria-hidden="true"`
- If standalone: `aria-label="descriptive text"`

## VIII. Error Handling & Edge Cases

### Error Message Patterns

**Form Validation:**
```tsx
{error && (
  <p className="text-sm text-[hsl(var(--error))] mt-1 flex items-center gap-1">
    <AlertCircle className="w-4 h-4" />
    {error.message}
  </p>
)}
```

**API Errors:**
```tsx
<Card className="border-[hsl(var(--error))] bg-[hsl(var(--error))]/5">
  <div className="flex items-start gap-3">
    <XCircle className="w-5 h-5 text-[hsl(var(--error))]" />
    <div>
      <h4 className="font-semibold">Connection Failed</h4>
      <p className="text-sm mt-1">{error.message}</p>
      <Button onClick={retry} className="mt-3">
        Try Again
      </Button>
    </div>
  </div>
</Card>
```

### Empty States

**No Connected Platforms:**
```tsx
<div className="text-center py-12">
  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[hsl(var(--claude-surface-raised))] flex items-center justify-center">
    <Link2Off className="w-8 h-8 text-[hsl(var(--claude-text-muted))]" />
  </div>
  <h3 className="text-lg font-semibold mb-2">No Platforms Connected</h3>
  <p className="text-sm text-[hsl(var(--claude-text-muted))] mb-4">
    Connect your first platform to start building your soul signature
  </p>
  <Button onClick={navigateToConnect}>
    Connect Platforms
  </Button>
</div>
```

### Loading States

**Skeleton Screens:**
```tsx
<div className="animate-pulse space-y-4">
  <div className="h-4 bg-[hsl(var(--claude-surface-raised))] rounded w-3/4" />
  <div className="h-4 bg-[hsl(var(--claude-surface-raised))] rounded w-1/2" />
</div>
```

## IX. Content & Copywriting Guidelines

### Voice & Tone

**Brand Voice:**
- Thoughtful & introspective (not casual)
- Empowering & transparent (not mysterious)
- Sophisticated & intelligent (not overly technical)
- Warm & human (not corporate or robotic)

**Example Headings:**
- ✓ "Discover Your Authentic Soul Signature"
- ✗ "Get Your Digital Twin Now!"
- ✓ "What's To Reveal, What's To Share"
- ✗ "Privacy Settings"

### Microcopy Standards

**Button Labels:**
- Action-oriented verbs
- Clear expected outcome
- Examples: "Extract Soul Signature", "Connect Spotify", "Update Privacy"

**Helper Text:**
- Brief, contextual guidance
- Examples over instructions
- "e.g., spotify, netflix, github" not "Enter platform names"

**Error Messages:**
- What went wrong
- Why it happened (if known)
- What to do next
- Example: "Spotify connection failed. Your access token expired. Please reconnect Spotify."

## X. Performance Standards

### Loading Performance

**Target Metrics:**
- Initial page load: < 2s
- Route transitions: < 300ms
- API responses: < 1s
- Image loading: Progressive (blur-up)

### Optimization Techniques

**Code Splitting:**
```tsx
const SoulSignatureDashboard = lazy(() => import('./pages/SoulSignatureDashboard'));
const PrivacyControls = lazy(() => import('./pages/PrivacyControls'));
```

**Image Optimization:**
- WebP with fallbacks
- Lazy loading below fold
- Responsive images with `srcSet`
- Platform logos: SVG preferred

**Bundle Size:**
- Monitor with bundle analyzer
- Tree-shake unused dependencies
- Dynamic imports for heavy features

## XI. Testing Checklist

### Visual Regression Testing

Use Playwright MCP to verify:
- [ ] Screenshots at 1440px (desktop)
- [ ] Screenshots at 768px (tablet)
- [ ] Screenshots at 375px (mobile)
- [ ] Dark mode variants
- [ ] All interactive states (hover, focus, active)
- [ ] Loading states
- [ ] Error states
- [ ] Empty states

### Accessibility Testing

- [ ] Keyboard navigation (Tab, Enter, Escape, Arrows)
- [ ] Screen reader testing (NVDA/JAWS)
- [ ] Color contrast verification (4.5:1 minimum)
- [ ] Focus indicators visible
- [ ] Form labels associated
- [ ] ARIA attributes correct
- [ ] Heading hierarchy logical

### Cross-Browser Testing

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### Interaction Testing

- [ ] All buttons clickable
- [ ] All forms submittable
- [ ] All modals closeable
- [ ] All tooltips hoverable
- [ ] All navigation links working
- [ ] OAuth flows complete successfully

## XII. Design Review Process

### When to Request Design Review

**Automatic Triggers:**
- PRs with UI component changes
- New page implementations
- Design system updates
- Responsive layout modifications

**Manual Reviews:**
- Major feature launches
- User flow changes
- Accessibility improvements
- Performance optimizations

### Review Phases (Via @agent-design-review)

1. **Preparation**: Analyze PR description, code diff, set up live preview
2. **Interaction & User Flow**: Test primary flows, interactive states
3. **Responsiveness**: Verify 1440px, 768px, 375px viewports
4. **Visual Polish**: Check alignment, spacing, typography, colors
5. **Accessibility**: Test keyboard navigation, contrast, semantic HTML
6. **Robustness**: Edge cases, error handling, loading states
7. **Code Health**: Component reuse, design token usage
8. **Content & Console**: Grammar, clarity, error checking

### Review Output Categories

**Issue Priority:**
- **[Blocker]**: Critical failures, must fix immediately
- **[High-Priority]**: Significant issues, fix before merge
- **[Medium-Priority]**: Improvements for follow-up
- **[Nitpick]**: Minor aesthetic details (prefix with "Nit:")

---

## Summary

These design principles ensure the Soul Signature platform maintains:
- Sophisticated, trustworthy visual design
- Consistent Anthropic-inspired aesthetics
- World-class accessibility (WCAG AA+)
- Excellent performance and responsiveness
- Clear, empowering user interactions
- Privacy-first, transparent data controls

All UI work should reference this document and undergo design review via `@agent-design-review` or `/design-review` slash command before merging.
