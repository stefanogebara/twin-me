# Twin Me - Spacing & Layout Guide

## Philosophy
Inspired by Lorix's generous spacing, we use **abundant whitespace** to create a premium, breathable user experience.

## Spacing Scale
Following an 8px base unit system with emphasis on larger gaps:

```css
/* Base Scale (8px units) */
--spacing-1: 0.5rem;   /* 8px  - Tight */
--spacing-2: 1rem;     /* 16px - Compact */
--spacing-3: 1.5rem;   /* 24px - Comfortable */
--spacing-4: 2rem;     /* 32px - Spacious (DEFAULT) */
--spacing-6: 3rem;     /* 48px - Generous */
--spacing-8: 4rem;     /* 64px - Very Generous */
--spacing-12: 6rem;    /* 96px - Hero sections */
--spacing-16: 8rem;    /* 128px - Landing page sections */
--spacing-20: 10rem;   /* 160px - Maximum breathing room */
```

## Page Layout Standards

### Container Widths
```tsx
// Full-width backgrounds
<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">

  // Max-width content containers
  <div className="max-w-7xl mx-auto px-8 py-12">
    // Your content
  </div>
</div>
```

### Section Spacing
```tsx
// Vertical spacing between major sections
<section className="py-20">  {/* 80px top/bottom */}

  // Section header spacing
  <h2 className="mb-12">Section Title</h2>  {/* 48px margin bottom */}

  // Content spacing
  <div className="space-y-8">  {/* 32px between items */}
    <Card />
    <Card />
    <Card />
  </div>
</section>
```

### Navigation & Headers
```tsx
// Top navigation
<nav className="px-8 py-6">  {/* 32px horizontal, 24px vertical */}
  <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
    // Nav items with generous gap
  </div>
</nav>

// Page headers
<header className="mb-12">  {/* 48px margin bottom */}
  <h1 className="text-5xl mb-4">Page Title</h1>
  <p className="text-xl text-slate-600">Description</p>
</header>
```

### Card & Component Spacing
```tsx
// Card padding (generous)
<div className="p-8 rounded-2xl bg-white shadow-sm">
  // Card content with internal spacing
  <div className="space-y-6">
    <h3 className="text-2xl">Card Title</h3>
    <p className="text-slate-600 leading-relaxed">Content</p>
  </div>
</div>

// Card grids (generous gaps)
<div className="grid grid-cols-3 gap-8">
  <Card />
  <Card />
  <Card />
</div>
```

### Typography Line Heights
```tsx
// Relaxed line heights for readability
<h1 className="leading-tight">Heading</h1>      {/* 1.2 */}
<h2 className="leading-tight">Subheading</h2>   {/* 1.2 */}
<p className="leading-relaxed">Body text</p>    {/* 1.625 */}
<p className="leading-loose">Tagline</p>        {/* 2.0 */}
```

## Component Examples

### Hero Section
```tsx
<section className="pt-32 pb-20 px-8">
  <div className="max-w-4xl mx-auto text-center">
    <div className="mb-8">  {/* Badge/pill */}
      <span className="inline-block px-4 py-2 bg-white/60 rounded-full">
        Twin Me for you
      </span>
    </div>

    <h1 className="text-7xl font-semibold mb-6 leading-none">
      Discover your<br />Soul Signature
    </h1>

    <p className="text-xl text-slate-600 mb-10 leading-relaxed max-w-2xl mx-auto">
      AI-powered workflows replace paperwork...
    </p>

    <button className="px-6 py-3.5 bg-slate-900 text-white rounded-lg">
      Start Free
    </button>
  </div>
</section>
```

### Dashboard Section
```tsx
<div className="min-h-screen bg-[hsl(var(--claude-bg))]">
  <div className="max-w-7xl mx-auto px-8 py-12">

    {/* Page Header */}
    <header className="mb-12">
      <h1 className="text-4xl font-heading font-medium mb-3">Dashboard</h1>
      <p className="text-lg text-slate-600">Welcome back, discover your soul signature</p>
    </header>

    {/* Stats Grid */}
    <div className="grid grid-cols-4 gap-6 mb-12">
      <StatCard />
    </div>

    {/* Main Content */}
    <div className="grid grid-cols-3 gap-8">
      <div className="col-span-2 space-y-8">
        <MainContent />
      </div>
      <div className="space-y-8">
        <Sidebar />
      </div>
    </div>
  </div>
</div>
```

### Form Layouts
```tsx
<form className="space-y-8 max-w-2xl">
  {/* Form section */}
  <div className="space-y-6">
    <label className="block">
      <span className="text-sm font-medium mb-2 block">Label</span>
      <input className="w-full px-4 py-3 rounded-lg border" />
    </label>
  </div>

  {/* Form actions */}
  <div className="flex gap-4 pt-6">
    <button className="px-6 py-3">Submit</button>
  </div>
</form>
```

## Spacing Checklist

When creating/updating pages, ensure:

- [ ] Container max-width is `max-w-7xl` or `max-w-4xl` (hero)
- [ ] Horizontal padding is `px-8` (not px-4 or px-6)
- [ ] Section vertical spacing is `py-12` or `py-20`
- [ ] Component gaps use `gap-6` or `gap-8` (not gap-4)
- [ ] Card padding is `p-8` (not p-6 or p-4)
- [ ] Header margins are `mb-12` (not mb-8 or mb-6)
- [ ] Typography uses `leading-relaxed` or `leading-loose`
- [ ] Grid gaps are `gap-6` or `gap-8`
- [ ] Space-y utilities use `space-y-6` or `space-y-8`

## Migration Strategy

1. **Start with high-traffic pages**: Dashboard, Index, Soul Signature Dashboard
2. **Update one page at a time**: Test visual balance before moving to next
3. **Maintain consistency**: Use same spacing values across similar components
4. **Check responsiveness**: Reduce spacing on mobile (`sm:px-4 md:px-6 lg:px-8`)

## Quick Reference

| Element | Spacing | Class |
|---------|---------|-------|
| Page container horizontal | 32px | `px-8` |
| Page container vertical | 48-80px | `py-12` or `py-20` |
| Section headers | 48px bottom | `mb-12` |
| Card padding | 32px | `p-8` |
| Grid gaps | 24-32px | `gap-6` or `gap-8` |
| Stack spacing | 24-32px | `space-y-6` or `space-y-8` |
| Button padding | 12px x 24px | `px-6 py-3` |
| Hero top padding | 128px | `pt-32` |

---

**Remember**: When in doubt, add MORE space, not less. The goal is a premium, uncluttered feel.
