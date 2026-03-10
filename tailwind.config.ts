import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Sundust Design System Fonts (updated per Sundust guide + Figma extraction)
        'heading': ['Instrument Serif', 'Georgia', 'serif'],  // Hero/display headings
        'serif': ['Instrument Serif', 'Georgia', 'serif'],    // Default serif
        'menu': ['Poppins', 'Inter', 'system-ui', 'sans-serif'],  // Sidebar/panel labels
        'body': ['Geist', 'Inter', 'system-ui', 'sans-serif'],    // Body text
        'ui': ['Geist', 'Inter', 'system-ui', 'sans-serif'],      // UI elements
        'sans': ['Geist', 'Inter', 'system-ui', 'sans-serif'],    // Default sans
        'mono': ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      colors: {
        // Semantic tokens from CSS variables (no hsl wrapper — vars contain hex/rgba)
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },

        // ── Graydust Scale (Sundust UI Kit — 11-stop warm gray) ─────────────
        'graydust': {
          50:  '#FDFCFB',  // Light bg / Primary text on dark
          100: '#F4F1EC',  // Light subtle background
          200: '#D9D1CB',  // Borders light / Secondary text dark
          300: '#BAB5B1',  // Disabled text / Borders
          400: '#86807B',  // Placeholder text
          500: '#5E5656',  // Secondary icons / Mid UI
          600: '#4A4242',  // Muted body text
          700: '#3D3737',  // Input focus rings / Dividers
          800: '#252222',  // Light primary bg / Dark borders
          900: '#1B1818',  // Card/Sidebar bg / Hover states
          950: '#110F0F',  // App main bg dark / Text on light
        },

        // ── Sundust Accent Colors ──────────────────────────────────────────
        'sundust': {
          amber:  '#C17E2C',  // Warm copper (gradient core)
          orange: '#FF8400',  // Solar orange CTA highlight
          rose:   '#C32D70',  // Rose/pink ambient glow
          eco:    '#6C7567',  // Muted green ambient fill
          purple: '#5D5CAE',  // Cool purple gradient corner
        },

        // Direct Anthropic colors for hard-coded use
        'anthropic': {
          ivory: '#FAF9F5',
          white: '#FFFFFF',
          slate: '#141413',
          'slate-medium': '#595959',
          'slate-light': '#8C8C8C',
          orange: '#D97706',
          'orange-hover': '#B45309',
        },
      },
      fontSize: {
        'hero': 'var(--text-hero)',
        'xl': 'var(--text-xl)',
        'lg': 'var(--text-lg)',
      },
      spacing: {
        'hero': 'var(--space-hero)',
        'section': 'var(--space-section)',
        'block': 'var(--space-block)',
      },
      backgroundImage: {
        'hero-gradient': 'var(--hero-gradient)',
      },
      boxShadow: {
        'soft': 'var(--shadow-soft)',
        'medium': 'var(--shadow-medium)',
        'strong': 'var(--shadow-strong)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
