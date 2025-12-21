# Ethos Design System Implementation

## Overview
Complete redesign of Twin AI Learn using the elegant minimalist aesthetic from ethos.network and app.ethos.network.

## Design Principles

### Color System
- **Main Background**: #C1C0B6 (gray)
- **Card Surfaces**: 
  - Primary: #CBCBC2 (lighter gray)
  - Elevated: #BFBFB8
  - Secondary: #D5D4CD
- **Text**: #000000 (high contrast black)
- **Borders**: #9B9A8F
- **Primary Actions (CTA)**: #FF4000 (vibrant orange with glow effect)
- **Secondary Actions**: #1f21b6 (blue - used sparingly)
- **Semantic Colors** (minimal usage):
  - Success: #127f31 (green)
  - Warning: #cc9a1a (amber)
  - Error: #b72b38 (red)

### Typography
- **Font Family**: Inter (all weights)
- **Base Size**: 14px (0.875rem)
- **Line Height**: 1.5714
- **No decorative fonts** - Inter for everything

### Spacing & Layout
- **Card Padding**: 16-24px
- **Border Radius**: 6px
- **Shadows**: Minimal and subtle
  - Small: `0 1px 2px -2px rgba(0,0,0,0.16)`
  - Medium: `0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02), 0 2px 4px 0 rgba(0,0,0,0.02)`
  - Large: `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)`

### Interactions
- **Transitions**: 0.2s ease
- **Button Hover**: Subtle opacity/color changes
- **Orange CTA Glow**: `box-shadow: 0 0 2px #000, 0 0 20px #ff4000`
- **Focus States**: 2px solid orange (#FF4000) outline

## Implementation Steps

### 1. Update tailwind.config.ts
See file: tailwind.config.ts

### 2. Update src/index.css  
See file: src/index.css

### 3. Component Class Names

#### Buttons
```tsx
// Primary CTA (Orange with glow)
<button className="btn-primary">Get Started</button>

// Secondary Action (Blue)
<button className="btn-secondary">Learn More</button>

// Ghost/Outline
<button className="btn-ghost">Cancel</button>
```

#### Cards
```tsx
// Primary Card
<div className="card">Content</div>

// Elevated Card
<div className="card card-elevated">Content</div>

// Secondary Surface
<div className="card card-secondary">Content</div>

// Hoverable Card
<div className="card card-hover">Content</div>
```

#### Inputs
```tsx
<input className="input" placeholder="Enter text..." />
```

#### Backgrounds
```tsx
// Main background (already applied to body)
<div className="bg-ethos-main">

// Card background
<div className="bg-ethos-card">

// Elevated background
<div className="bg-ethos-elevated">

// Secondary background
<div className="bg-ethos-secondary">
```

### 4. Page-Specific Updates

#### Example: Soul Signature Dashboard
Replace:
- `bg-restaurant-cream-200` → `bg-ethos-gray-400`
- `bg-white` → `bg-ethos-gray-300`
- `text-restaurant-burgundy-900` → `text-ethos-black`
- `border-restaurant-cream-300` → `border-ethos-gray-600`
- `bg-restaurant-gold-600` → `bg-ethos-orange`

#### Example: Platform Hub
- Card containers: `bg-ethos-gray-300 border border-ethos-gray-600`
- Connect buttons: `btn-primary` (orange with glow)
- Status badges: Use semantic colors sparingly
- Grid layouts: Maintain clean spacing

#### Example: Privacy Dashboard
- Sliders: Orange accent (#FF4000)
- Card backgrounds: Lighter gray (#CBCBC2)
- Text: High contrast black (#000)
- Toggle switches: Orange active state

## Quick Reference

### CSS Variables
```css
--background: 0 0% 76%;        /* #C1C0B6 */
--card: 39 12% 81%;            /* #CBCBC2 */
--foreground: 0 0% 0%;         /* #000000 */
--primary: 239 73% 42%;        /* #1f21b6 */
--secondary: 15 100% 50%;      /* #FF4000 */
--border: 42 9% 57%;           /* #9B9A8F */
```

### Tailwind Classes
```
ethos-gray-{50-900}     Gray scale
ethos-blue              Primary action (sparingly)
ethos-green             Success
ethos-amber             Warning
ethos-red               Error
ethos-orange            CTA (primary)
ethos-orange-hover      CTA hover state
```

## Testing Checklist
- [ ] All pages use gray background system
- [ ] Cards use lighter gray surfaces
- [ ] Text is high contrast black
- [ ] Orange CTA buttons have glow effect
- [ ] Minimal color usage (no rainbow effects)
- [ ] Inter font loads correctly
- [ ] 14px base font size applied
- [ ] Subtle shadows on cards
- [ ] 6px border radius consistent
- [ ] 0.2s transitions smooth
- [ ] Focus states visible (orange outline)
- [ ] Hover states subtle and refined

## Files Modified
1. `tailwind.config.ts` - Ethos color palette and typography
2. `src/index.css` - Ethos design tokens and component styles
3. All page components - Update class names to use Ethos system

## Next Steps
1. Verify Tailwind config is updated
2. Verify index.css is updated
3. Update all page components systematically
4. Test responsive behavior
5. Verify accessibility (contrast ratios)
6. Check dark mode if applicable
