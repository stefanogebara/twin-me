# Soul Signature Platform - Style Guide

## Quick Reference

This style guide provides ready-to-use code patterns for implementing the Soul Signature platform's design system. All components follow the Anthropic-inspired aesthetic with warm ivory backgrounds, sophisticated typography, and thoughtful interactions.

---

## Color Tokens (TailwindCSS)

### Background Colors

```tsx
{/* Primary background */}
className="bg-[hsl(var(--claude-bg))]"

{/* Card/surface background */}
className="bg-[hsl(var(--claude-surface))]"

{/* Elevated surface (hover, active states) */}
className="bg-[hsl(var(--claude-surface-raised))]"

{/* Accent background (for CTAs, highlights) */}
className="bg-[hsl(var(--claude-accent))]"

{/* Semantic backgrounds */}
className="bg-[hsl(var(--success))]"    // Green
className="bg-[hsl(var(--error))]"      // Red
className="bg-[hsl(var(--warning))]"    // Amber
className="bg-[hsl(var(--info))]"       // Blue
```

### Text Colors

```tsx
{/* Primary text (headings, important content) */}
className="text-[hsl(var(--claude-text))]"

{/* Secondary text (body copy) */}
className="text-[hsl(var(--claude-text-muted))]"

{/* Tertiary text (captions, helper text) */}
className="text-[hsl(var(--claude-text-subtle))]"

{/* Accent text (links, emphasized content) */}
className="text-[hsl(var(--claude-accent))]"

{/* White text (on dark backgrounds) */}
className="text-white"
```

### Border Colors

```tsx
{/* Standard borders */}
className="border-[hsl(var(--claude-border))]"

{/* Strong borders (dividers, emphasized boundaries) */}
className="border-[hsl(var(--claude-border-strong))]"

{/* Accent borders (focus states) */}
className="border-[hsl(var(--claude-accent))]"

{/* Semantic borders */}
className="border-[hsl(var(--error))]"
className="border-[hsl(var(--success))]"
```

---

## Typography Patterns

### Headings

```tsx
{/* Page Hero Title (48px) */}
<h1 className="text-5xl font-bold text-[hsl(var(--claude-text))] font-heading tracking-tight">
  Discover Your Soul Signature
</h1>

{/* Page Title (40px) */}
<h1 className="text-4xl font-bold text-[hsl(var(--claude-text))] font-heading mb-2">
  Soul Signature Dashboard
</h1>

{/* Section Header (32px) */}
<h2 className="text-3xl font-semibold text-[hsl(var(--claude-text))] font-heading mb-4">
  Connected Platforms
</h2>

{/* Card Header (24px) */}
<h3 className="text-2xl font-semibold text-[hsl(var(--claude-text))] font-ui mb-2">
  Privacy Controls
</h3>

{/* Subheader (20px) */}
<h4 className="text-xl font-medium text-[hsl(var(--claude-text))] font-ui mb-3">
  Life Clusters
</h4>
```

### Body Text

```tsx
{/* Large body text (18px) */}
<p className="text-lg text-[hsl(var(--claude-text-muted))] leading-relaxed">
  Your soul signature captures your authentic digital identity through sophisticated AI analysis.
</p>

{/* Standard body text (16px) - DEFAULT */}
<p className="text-base text-[hsl(var(--claude-text-muted))]">
  Connect your platforms to begin extracting your soul signature.
</p>

{/* Small text (14px) */}
<p className="text-sm text-[hsl(var(--claude-text-muted))]">
  Last synced 2 hours ago
</p>

{/* Caption text (12px) */}
<p className="text-xs text-[hsl(var(--claude-text-subtle))] uppercase tracking-wide">
  Beta Feature
</p>
```

---

## Component Patterns

### Primary Button (CTA)

```tsx
<Button className="bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent))]/90 text-white px-6 py-3 rounded-md font-medium transition-all hover:scale-[1.02] active:scale-[0.98]">
  <Sparkles className="w-4 h-4 mr-2" />
  Extract Soul Signature
</Button>
```

### Secondary Button

```tsx
<Button variant="outline" className="border-[hsl(var(--claude-border))] text-[hsl(var(--claude-text))] hover:bg-[hsl(var(--claude-surface-raised))] px-6 py-3 rounded-md font-medium transition-all">
  <Settings className="w-4 h-4 mr-2" />
  Manage Settings
</Button>
```

### Ghost/Tertiary Button

```tsx
<Button variant="ghost" className="text-[hsl(var(--claude-text-muted))] hover:text-[hsl(var(--claude-text))] hover:bg-[hsl(var(--claude-surface-raised))] px-4 py-2 rounded-md transition-colors">
  <ArrowLeft className="w-4 h-4 mr-2" />
  Back
</Button>
```

### Destructive Button

```tsx
<Button className="bg-[hsl(var(--error))] hover:bg-[hsl(var(--error))]/90 text-white px-6 py-3 rounded-md font-medium transition-all">
  <Trash2 className="w-4 h-4 mr-2" />
  Delete Account
</Button>
```

### Loading Button

```tsx
<Button disabled className="bg-[hsl(var(--claude-accent))] text-white px-6 py-3 rounded-md opacity-70 cursor-not-allowed">
  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
  Extracting...
</Button>
```

---

### Standard Card

```tsx
<Card className="p-6 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))] rounded-lg shadow-sm hover:shadow-md transition-shadow">
  <div className="flex items-start gap-4">
    {/* Icon */}
    <div className="w-12 h-12 rounded-full bg-[hsl(var(--claude-accent))]/10 flex items-center justify-center flex-shrink-0">
      <Brain className="w-6 h-6 text-[hsl(var(--claude-accent))]" />
    </div>

    {/* Content */}
    <div className="flex-1">
      <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))] mb-2">
        Card Title
      </h3>
      <p className="text-sm text-[hsl(var(--claude-text-muted))] mb-4">
        Card description goes here with relevant information.
      </p>

      {/* Action */}
      <Button className="bg-[hsl(var(--claude-accent))] text-white px-4 py-2 rounded-md text-sm">
        Take Action
      </Button>
    </div>
  </div>
</Card>
```

### Platform Connection Card

```tsx
<Card className="p-4 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))] rounded-lg hover:shadow-md transition-all cursor-pointer">
  <div className="flex items-center justify-between">
    {/* Platform Info */}
    <div className="flex items-center gap-3">
      <img src={platformLogo} alt={`${platform} logo`} className="w-10 h-10" />
      <div>
        <h4 className="font-semibold text-[hsl(var(--claude-text))]">{platform}</h4>
        <p className="text-xs text-[hsl(var(--claude-text-subtle))]{category}</p>
      </div>
    </div>

    {/* Status Badge */}
    {connected ? (
      <Badge className="bg-[hsl(var(--success))] text-white">
        <CheckCircle className="w-3 h-3 mr-1" />
        Connected
      </Badge>
    ) : (
      <Button size="sm" className="bg-[hsl(var(--claude-accent))] text-white">
        Connect
      </Button>
    )}
  </div>
</Card>
```

### Info Card (Warning/Error)

```tsx
{/* Warning */}
<Card className="p-4 bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))] rounded-lg">
  <div className="flex items-start gap-3">
    <AlertTriangle className="w-5 h-5 text-[hsl(var(--warning))] flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="font-semibold text-[hsl(var(--claude-text))] mb-1">
        Action Required
      </h4>
      <p className="text-sm text-[hsl(var(--claude-text-muted))]">
        Please reconnect Spotify to continue extraction.
      </p>
    </div>
  </div>
</Card>

{/* Error */}
<Card className="p-4 bg-[hsl(var(--error))]/10 border-[hsl(var(--error))] rounded-lg">
  <div className="flex items-start gap-3">
    <XCircle className="w-5 h-5 text-[hsl(var(--error))] flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="font-semibold text-[hsl(var(--claude-text))] mb-1">
        Connection Failed
      </h4>
      <p className="text-sm text-[hsl(var(--claude-text-muted))] mb-3">
        Unable to connect to Spotify. Please try again.
      </p>
      <Button size="sm" className="bg-[hsl(var(--claude-accent))] text-white">
        Retry Connection
      </Button>
    </div>
  </div>
</Card>
```

---

### Status Badges

```tsx
{/* Connected */}
<Badge className="bg-[hsl(var(--success))] text-white px-3 py-1 rounded-full text-xs font-medium">
  <CheckCircle className="w-3 h-3 mr-1 inline" />
  Connected
</Badge>

{/* Not Connected */}
<Badge className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs font-medium">
  <Circle className="w-3 h-3 mr-1 inline" />
  Not Connected
</Badge>

{/* Error */}
<Badge className="bg-[hsl(var(--error))] text-white px-3 py-1 rounded-full text-xs font-medium">
  <AlertCircle className="w-3 h-3 mr-1 inline" />
  Error
</Badge>

{/* Extracting */}
<Badge className="bg-[hsl(var(--info))] text-white px-3 py-1 rounded-full text-xs font-medium">
  <Loader2 className="w-3 h-3 mr-1 inline animate-spin" />
  Extracting
</Badge>

{/* High Quality */}
<Badge className="bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] px-3 py-1 rounded-full text-xs font-medium">
  High Quality
</Badge>

{/* Medium Quality */}
<Badge className="bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] px-3 py-1 rounded-full text-xs font-medium">
  Medium Quality
</Badge>
```

---

### Form Input

```tsx
<div className="space-y-2">
  <label htmlFor="email" className="text-sm font-medium text-[hsl(var(--claude-text))]">
    Email Address
  </label>
  <input
    id="email"
    type="email"
    placeholder="you@example.com"
    className="w-full px-4 py-2 bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-md text-[hsl(var(--claude-text))] placeholder:text-[hsl(var(--claude-text-subtle))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--claude-accent))] focus:border-[hsl(var(--claude-accent))] transition-all"
  />
  <p className="text-xs text-[hsl(var(--claude-text-subtle))]">
    We'll never share your email with anyone.
  </p>
</div>
```

### Form Input with Error

```tsx
<div className="space-y-2">
  <label htmlFor="password" className="text-sm font-medium text-[hsl(var(--claude-text))]">
    Password
  </label>
  <input
    id="password"
    type="password"
    className="w-full px-4 py-2 bg-[hsl(var(--claude-surface))] border border-[hsl(var(--error))] rounded-md text-[hsl(var(--claude-text))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--error))] focus:border-[hsl(var(--error))] transition-all"
  />
  <p className="text-sm text-[hsl(var(--error))] flex items-center gap-1">
    <AlertCircle className="w-4 h-4" />
    Password must be at least 8 characters
  </p>
</div>
```

---

### Privacy Intensity Slider

```tsx
<div className="space-y-3">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Music className="w-4 h-4 text-[hsl(var(--claude-accent))]" />
      <span className="text-sm font-medium text-[hsl(var(--claude-text))]">
        Musical Identity
      </span>
    </div>
    <span className="text-sm font-semibold text-[hsl(var(--claude-accent))]">
      {value}%
    </span>
  </div>

  <Slider
    value={[value]}
    onValueChange={([newValue]) => setValue(newValue)}
    min={0}
    max={100}
    step={5}
    className="w-full"
  />

  <p className="text-xs text-[hsl(var(--claude-text-subtle))]">
    {value === 0 && "Completely hidden from your soul signature"}
    {value > 0 && value < 50 && "Minimal presence in conversations"}
    {value >= 50 && value < 80 && "Moderate influence on responses"}
    {value >= 80 && "Strong influence on personality"}
  </p>
</div>
```

---

### Progress Bar (Extraction Pipeline)

```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <span className="text-sm font-medium text-[hsl(var(--claude-text))]">
      Extracting Soul Signature
    </span>
    <span className="text-sm text-[hsl(var(--claude-text-muted))]">
      {progress}%
    </span>
  </div>

  <div className="h-2 bg-[hsl(var(--claude-surface-raised))] rounded-full overflow-hidden">
    <div
      className="h-full bg-[hsl(var(--claude-accent))] transition-all duration-300 ease-out"
      style={{ width: `${progress}%` }}
    />
  </div>

  <p className="text-xs text-[hsl(var(--claude-text-subtle))]">
    Analyzing Spotify listening history...
  </p>
</div>
```

---

### Empty State

```tsx
<div className="text-center py-16 px-4">
  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[hsl(var(--claude-surface-raised))] flex items-center justify-center">
    <Link2Off className="w-10 h-10 text-[hsl(var(--claude-text-muted))]" />
  </div>

  <h3 className="text-2xl font-semibold text-[hsl(var(--claude-text))] mb-3">
    No Platforms Connected Yet
  </h3>

  <p className="text-base text-[hsl(var(--claude-text-muted))] mb-6 max-w-md mx-auto">
    Connect your first platform to start discovering your authentic soul signature through AI-powered analysis.
  </p>

  <Button className="bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent))]/90 text-white px-6 py-3 rounded-md font-medium">
    <Plus className="w-4 h-4 mr-2" />
    Connect Platform
  </Button>
</div>
```

---

### Loading Skeleton

```tsx
{/* Card Skeleton */}
<Card className="p-6 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))] rounded-lg">
  <div className="animate-pulse space-y-4">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 bg-[hsl(var(--claude-surface-raised))] rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-[hsl(var(--claude-surface-raised))] rounded w-3/4" />
        <div className="h-3 bg-[hsl(var(--claude-surface-raised))] rounded w-1/2" />
      </div>
    </div>
  </div>
</Card>

{/* Text Skeleton */}
<div className="animate-pulse space-y-3">
  <div className="h-4 bg-[hsl(var(--claude-surface-raised))] rounded w-full" />
  <div className="h-4 bg-[hsl(var(--claude-surface-raised))] rounded w-5/6" />
  <div className="h-4 bg-[hsl(var(--claude-surface-raised))] rounded w-4/6" />
</div>
```

---

### Chat Message Bubbles

```tsx
{/* User Message */}
<div className="flex justify-end mb-4">
  <div className="max-w-[70%] bg-[hsl(var(--claude-accent))] text-white px-4 py-3 rounded-lg rounded-tr-none">
    <p className="text-sm">{userMessage}</p>
    <span className="text-xs opacity-70 mt-1 block">
      {timestamp}
    </span>
  </div>
</div>

{/* AI Twin Message */}
<div className="flex justify-start mb-4">
  <div className="flex gap-3 max-w-[70%]">
    <div className="w-8 h-8 rounded-full bg-[hsl(var(--claude-accent))]/20 flex items-center justify-center flex-shrink-0">
      <Brain className="w-5 h-5 text-[hsl(var(--claude-accent))]" />
    </div>

    <div className="bg-[hsl(var(--claude-surface-raised))] px-4 py-3 rounded-lg rounded-tl-none">
      <p className="text-sm text-[hsl(var(--claude-text))]">{aiMessage}</p>
      <span className="text-xs text-[hsl(var(--claude-text-subtle))] mt-1 block">
        {timestamp}
      </span>
    </div>
  </div>
</div>

{/* Typing Indicator */}
<div className="flex justify-start mb-4">
  <div className="flex gap-3">
    <div className="w-8 h-8 rounded-full bg-[hsl(var(--claude-accent))]/20 flex items-center justify-center">
      <Brain className="w-5 h-5 text-[hsl(var(--claude-accent))]" />
    </div>

    <div className="bg-[hsl(var(--claude-surface-raised))] px-4 py-3 rounded-lg rounded-tl-none">
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-[hsl(var(--claude-text-muted))] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-[hsl(var(--claude-text-muted))] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-[hsl(var(--claude-text-muted))] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
</div>
```

---

### Modal/Dialog

```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent className="bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))] rounded-lg p-6 max-w-md">
    <DialogHeader>
      <DialogTitle className="text-2xl font-semibold text-[hsl(var(--claude-text))] mb-2">
        Confirm Deletion
      </DialogTitle>
      <DialogDescription className="text-sm text-[hsl(var(--claude-text-muted))]">
        Are you sure you want to delete your soul signature? This action cannot be undone.
      </DialogDescription>
    </DialogHeader>

    <DialogFooter className="mt-6 flex gap-3 justify-end">
      <Button variant="outline" onClick={() => setIsOpen(false)} className="border-[hsl(var(--claude-border))] text-[hsl(var(--claude-text))]">
        Cancel
      </Button>
      <Button onClick={handleDelete} className="bg-[hsl(var(--error))] text-white">
        Delete Signature
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### Tooltip

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="sm">
        <HelpCircle className="w-4 h-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent className="bg-[hsl(var(--claude-text))] text-white px-3 py-2 rounded-md text-sm max-w-xs">
      <p>Your soul signature is extracted from your connected platforms using Claude AI.</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

### Grid Layouts

```tsx
{/* Platform Connection Grid (Desktop: 3 cols, Tablet: 2 cols, Mobile: 1 col) */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {platforms.map((platform) => (
    <PlatformCard key={platform.id} {...platform} />
  ))}
</div>

{/* Life Clusters Grid (Desktop: 3 cols) */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
  {/* Personal Cluster */}
  <div className="space-y-4">
    <h3 className="text-xl font-semibold text-[hsl(var(--claude-text))]">Personal</h3>
    {personalClusters.map((cluster) => (
      <ClusterCard key={cluster.id} {...cluster} />
    ))}
  </div>

  {/* Professional Cluster */}
  <div className="space-y-4">
    <h3 className="text-xl font-semibold text-[hsl(var(--claude-text))]">Professional</h3>
    {professionalClusters.map((cluster) => (
      <ClusterCard key={cluster.id} {...cluster} />
    ))}
  </div>

  {/* Creative Cluster */}
  <div className="space-y-4">
    <h3 className="text-xl font-semibold text-[hsl(var(--claude-text))]">Creative</h3>
    {creativeClusters.map((cluster) => (
      <ClusterCard key={cluster.id} {...cluster} />
    ))}
  </div>
</div>
```

---

## Animation Patterns

### Fade In On Mount

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.3 }}
>
  {children}
</motion.div>
```

### Slide Up On Mount

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
>
  {children}
</motion.div>
```

### Stagger Children

```tsx
<motion.div
  variants={{
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }}
  initial="hidden"
  animate="show"
>
  {items.map((item) => (
    <motion.div
      key={item.id}
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
      }}
    >
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

### Scale on Hover

```tsx
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ duration: 0.15 }}
>
  Click Me
</motion.button>
```

---

## Responsive Patterns

### Show/Hide Based on Breakpoint

```tsx
{/* Show on desktop, hide on mobile */}
<div className="hidden lg:block">
  Desktop content
</div>

{/* Show on mobile, hide on desktop */}
<div className="block lg:hidden">
  Mobile content
</div>

{/* Responsive padding */}
<div className="px-4 sm:px-6 lg:px-8">
  Content
</div>
```

---

## Icon Usage

### Icon with Text (Buttons)

```tsx
<Button>
  <Sparkles className="w-4 h-4 mr-2" />
  Extract Signature
</Button>
```

### Icon Only (Tooltips Required)

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="sm" aria-label="Settings">
        <Settings className="w-5 h-5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Open Settings</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## Summary

This style guide provides:
- **Consistent color tokens** using HSL custom properties
- **Typography patterns** for all text hierarchies
- **Component templates** ready to copy/paste
- **Responsive layouts** with mobile-first approach
- **Animation patterns** for smooth interactions
- **Accessibility** baked into all patterns

All patterns follow the Anthropic-inspired design system with warm ivory backgrounds, sophisticated orange accents, and thoughtful user experiences.

**Developer Workflow:**
1. Reference this guide when building new components
2. Copy relevant patterns directly into code
3. Use `@agent-design-review` or `/design-review` to validate implementation
4. Ensure all custom styles align with these token-based patterns
