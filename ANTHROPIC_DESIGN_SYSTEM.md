# Anthropic Design System Specification

## Project Overview

This document defines the complete design system for Twin AI Learn, ensuring consistent Anthropic-style aesthetics across all components. This specification prevents color visibility issues, font inconsistencies, and styling mistakes.

## Technology Stack

- **Framework**: React 18.3.1 with TypeScript
- **Styling**: Tailwind CSS 3.4.17 with custom CSS properties
- **Components**: shadcn/ui with Radix UI primitives
- **Icons**: Lucide React
- **Animations**: CSS transitions and transforms

## Core Design Principles

1. **Anthropic Dark Theme**: Consistent dark background with orange accents
2. **Progressive Disclosure**: Complex information revealed in digestible steps
3. **Apple-Style Grouping**: Related content organized in clear sections
4. **Voice-First Interface**: Optimized for conversational interactions
5. **Accessibility First**: WCAG compliance built into every component

## Color System

### Primary Color Palette

**CRITICAL**: Always use CSS custom properties, never hardcoded colors.

```css
:root {
  /* Background Colors */
  --_color-theme---background: hsl(210, 11%, 7%);        /* #111319 - Main page background */
  --_color-theme---surface: hsl(213, 11%, 11%);          /* #191d26 - Card backgrounds */
  --_color-theme---surface-raised: hsl(213, 14%, 16%);   /* #252a36 - Elevated surfaces */

  /* Border Colors */
  --_color-theme---border: hsl(215, 14%, 20%);           /* #343a47 - Standard borders */

  /* Text Colors */
  --_color-theme---text: hsl(0, 0%, 90%);                /* #e5e5e5 - Primary text */
  --_color-theme---text-secondary: hsl(218, 11%, 65%);   /* #9ca3af - Secondary text */

  /* Accent Colors */
  --_color-theme---accent: hsl(31, 81%, 56%);            /* #d97706 - Orange accent */

  /* Button Colors */
  --_color-theme---button-primary--background: hsl(31, 81%, 56%); /* Orange buttons */

  /* Additional Surfaces */
  --_color-theme---background-secondary: hsl(213, 11%, 13%); /* Subtle backgrounds */
  --_color-theme---card: hsl(213, 11%, 11%);                 /* Card surfaces (alias) */
}
```

### Usage Examples

```tsx
// Correct Implementation
<div style={{ backgroundColor: 'var(--_color-theme---background)' }}>
  <p style={{ color: 'var(--_color-theme---text)' }}>Primary text</p>
  <p style={{ color: 'var(--_color-theme---text-secondary)' }}>Secondary text</p>
</div>

// WRONG - Never use hardcoded colors
<div className="bg-gray-900">
  <p className="text-white">This will cause visibility issues</p>
</div>
```

## Typography System

### Font Families

```css
:root {
  --_typography---font--styrene-a: 'Styrene A', 'SF Pro Display', system-ui, sans-serif;
}
```

### Typography Classes

**Display Typography:**
- `u-display-xl` - Hero headings (48px+)
- `u-display-l` - Section headings (36px+)

**Body Typography:**
- `text-body-large` - Large body text (18px)
- `text-body` - Standard body text (16px)
- `text-heading` - Component headings (custom weight)

**Implementation:**
```tsx
<h1 className="u-display-xl" style={{ fontFamily: 'var(--_typography---font--styrene-a)' }}>
  Hero Heading
</h1>
<p className="text-body-large" style={{ color: 'var(--_color-theme---text)' }}>
  Large body text
</p>
```

## Component Architecture

### 1. Button System

#### Primary Button
```tsx
interface PrimaryButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}

const PrimaryButton: React.FC<PrimaryButtonProps> = ({ children, onClick, disabled, icon }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="btn-anthropic-primary flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 hover:opacity-90 disabled:opacity-50"
    style={{
      backgroundColor: 'var(--_color-theme---accent)',
      color: 'white'
    }}
  >
    {children}
    {icon}
  </button>
);
```

#### Secondary Button
```tsx
const SecondaryButton: React.FC<PrimaryButtonProps> = ({ children, onClick, disabled, icon }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="btn-anthropic-secondary flex items-center gap-2 px-6 py-3 rounded-lg font-medium border transition-all duration-200 hover:opacity-80"
    style={{
      borderColor: 'var(--_color-theme---border)',
      color: 'var(--_color-theme---text)',
      backgroundColor: 'transparent'
    }}
  >
    {children}
    {icon}
  </button>
);
```

### 2. Step Indicator Component

```tsx
interface Step {
  id: number;
  title: string;
  completed: boolean;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, currentStep }) => (
  <div className="flex items-center justify-center space-x-4">
    {steps.map((step, index) => (
      <div key={step.id} className="flex items-center">
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-all duration-300 border-2 ${
            currentStep > step.id
              ? 'border-orange-500 text-white cursor-pointer hover:opacity-80'
              : currentStep === step.id
              ? 'border-orange-500 text-white'
              : 'bg-white text-black cursor-default'
          }`}
          style={{
            backgroundColor: currentStep >= step.id ? 'var(--_color-theme---accent)' : 'white',
            borderColor: currentStep >= step.id ? 'var(--_color-theme---accent)' : 'var(--_color-theme---border)',
            color: currentStep >= step.id ? 'white' : 'black'
          }}
        >
          {step.id}
        </div>
        {index < steps.length - 1 && (
          <div
            className="w-12 h-0.5 mx-2"
            style={{
              backgroundColor: currentStep > step.id ? 'var(--_color-theme---accent)' : 'var(--_color-theme---border)'
            }}
          />
        )}
      </div>
    ))}
  </div>
);
```

### 3. Card Component

```tsx
interface CardProps {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
}

const Card: React.FC<CardProps> = ({ children, className = '', elevated = false }) => (
  <div
    className={`rounded-2xl p-6 border transition-all duration-300 hover:shadow-md ${className}`}
    style={{
      backgroundColor: elevated ? 'var(--_color-theme---surface-raised)' : 'var(--_color-theme---surface)',
      borderColor: 'var(--_color-theme---border)'
    }}
  >
    {children}
  </div>
);
```

### 4. Navigation Component

```tsx
interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}

const NavLink: React.FC<NavLinkProps> = ({ href, children }) => (
  <a
    href={href}
    className="text-sm font-medium transition-all hover:opacity-70 relative group"
    style={{ color: 'var(--_color-theme---text)' }}
  >
    {children}
    <div
      className="absolute -bottom-1 left-0 w-0 h-0.5 transition-all group-hover:w-full"
      style={{ backgroundColor: 'var(--_color-theme---accent)' }}
    />
  </a>
);
```

### 5. Loading Component

```tsx
const LoadingSpinner: React.FC = () => (
  <div className="w-24 h-24 mx-auto relative">
    <div
      className="absolute inset-0 rounded-full border-4"
      style={{ borderColor: 'var(--_color-theme---border)' }}
    />
    <div
      className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
      style={{ borderTopColor: 'var(--_color-theme---accent)' }}
    />
    <div
      className="absolute inset-6 rounded-full animate-pulse flex items-center justify-center"
      style={{ backgroundColor: 'var(--_color-theme---accent)' }}
    >
      <div className="w-3 h-3 bg-white rounded-full animate-bounce" />
    </div>
  </div>
);
```

## Layout Patterns

### 1. Apple-Style Content Grouping

```tsx
interface FeatureGroup {
  title: string;
  description: string;
  features: Array<{
    icon: React.ReactNode;
    title: string;
    description: string;
  }>;
}

const FeatureGroupSection: React.FC<{ group: FeatureGroup }> = ({ group }) => (
  <div className="space-y-12">
    {/* Group Header */}
    <div className="text-center">
      <div
        className="inline-flex items-center gap-2 bg-white border rounded-full px-4 py-2 mb-4"
        style={{ borderColor: 'var(--_color-theme---border)' }}
      >
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--_color-theme---accent)' }}
        >
          {group.title}
        </span>
      </div>
      <p
        className="text-lg"
        style={{ color: 'var(--_color-theme---text-secondary)' }}
      >
        {group.description}
      </p>
    </div>

    {/* Group Features */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
      {group.features.map((feature, index) => (
        <Card key={index}>
          <div
            className="mb-6 p-3 rounded-xl w-fit"
            style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}
          >
            <div style={{ color: 'var(--_color-theme---text)' }}>
              {feature.icon}
            </div>
          </div>
          <h3
            className="text-heading font-medium text-xl mb-4"
            style={{ color: 'var(--_color-theme---text)' }}
          >
            {feature.title}
          </h3>
          <p
            className="text-body"
            style={{ color: 'var(--_color-theme---text-secondary)' }}
          >
            {feature.description}
          </p>
        </Card>
      ))}
    </div>
  </div>
);
```

### 2. Progressive Disclosure Pattern

```tsx
interface ConnectorSection {
  title: string;
  connectors: Array<{
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
  }>;
}

const ProgressiveDisclosure: React.FC<{ sections: ConnectorSection[] }> = ({ sections }) => {
  const [showOptional, setShowOptional] = useState(false);

  return (
    <div className="space-y-8">
      {sections.map((section, index) => (
        <div key={section.title}>
          <div className="flex items-center justify-between mb-6">
            <h3
              className="text-xl font-medium"
              style={{ color: 'var(--_color-theme---text)' }}
            >
              {section.title}
            </h3>
            {index > 0 && (
              <button
                onClick={() => setShowOptional(!showOptional)}
                className="text-sm underline"
                style={{ color: 'var(--_color-theme---accent)' }}
              >
                {showOptional ? 'Hide' : 'Show'} Optional
              </button>
            )}
          </div>

          {(index === 0 || showOptional) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {section.connectors.map((connector) => (
                <Card key={connector.id} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {connector.icon}
                    <span
                      className="font-medium"
                      style={{ color: 'var(--_color-theme---text)' }}
                    >
                      {connector.name}
                    </span>
                  </div>
                  <p
                    className="text-sm"
                    style={{ color: 'var(--_color-theme---text-secondary)' }}
                  >
                    {connector.description}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
```

## Accessibility Requirements

### Color Contrast
- Primary text on background: 4.5:1 minimum
- Secondary text on surface: 3:1 minimum
- Interactive elements: 3:1 minimum

### Keyboard Navigation
- All interactive elements must be focusable
- Focus indicators must be visible
- Logical tab order required

### Screen Reader Support
- Semantic HTML structure
- ARIA labels for complex interactions
- Status announcements for state changes

### Implementation Example
```tsx
<button
  className="btn-anthropic-primary"
  aria-label="Create your digital twin"
  role="button"
  tabIndex={0}
>
  Get Started
</button>
```

## Animation Guidelines

### Micro-Interactions
```css
/* Hover transitions */
.hover-transition {
  transition: all 0.2s ease-out;
}

/* Focus states */
.focus-ring:focus {
  outline: 2px solid var(--_color-theme---accent);
  outline-offset: 2px;
}

/* Loading animations */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

## Responsive Design

### Breakpoints
```css
/* Mobile First Approach */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
```

### Grid Patterns
- Mobile: Single column
- Tablet: 2 columns for cards, single for content
- Desktop: 3-4 columns for cards, 2 for major sections

## Error Prevention Checklist

### Before Any UI Changes
- [ ] Search for hardcoded colors (`text-white`, `bg-gray-`, `#000`, etc.)
- [ ] Verify all text uses proper color variables
- [ ] Check button text visibility against backgrounds
- [ ] Test step indicators in both active/inactive states
- [ ] Validate hover states are visible
- [ ] Ensure consistent font usage across components

### Implementation Checklist
- [ ] All colors use CSS custom properties
- [ ] Typography uses defined classes and font families
- [ ] Components follow established patterns
- [ ] Accessibility attributes included
- [ ] Responsive behavior tested
- [ ] Animation performance verified

## Common Mistakes to Avoid

### ❌ Never Do This
```tsx
// Hardcoded colors
<div className="bg-white text-black">
<p style={{ color: '#ffffff' }}>
<button className="bg-gray-900 text-white">

// Missing accessibility
<div onClick={handleClick}>
<img src="..." />

// Inconsistent fonts
<h1 style={{ fontFamily: 'Arial' }}>
```

### ✅ Always Do This
```tsx
// Proper color variables
<div style={{ backgroundColor: 'var(--_color-theme---surface)', color: 'var(--_color-theme---text)' }}>
<p style={{ color: 'var(--_color-theme---text-secondary)' }}>
<button style={{ backgroundColor: 'var(--_color-theme---accent)', color: 'white' }}>

// Proper accessibility
<button onClick={handleClick} aria-label="Action description">
<img src="..." alt="Descriptive text" />

// Consistent typography
<h1 className="u-display-xl" style={{ fontFamily: 'var(--_typography---font--styrene-a)' }}>
```

## File Organization

```
src/
├── components/
│   ├── ui/                 # Base UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── StepIndicator.tsx
│   ├── layout/             # Layout components
│   │   ├── Navigation.tsx
│   │   └── PageHeader.tsx
│   └── features/           # Feature-specific components
├── styles/
│   ├── globals.css         # CSS custom properties
│   └── components.css      # Component-specific styles
└── types/
    └── design-system.ts    # TypeScript interfaces
```

This design system ensures consistent, accessible, and maintainable UI components that align with Anthropic's aesthetic while preventing the color visibility and styling issues we've encountered before.