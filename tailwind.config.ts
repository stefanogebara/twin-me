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
        // Claura Design System Fonts
        'heading': ['Instrument Serif', 'Georgia', 'serif'],         // Serif headings
        'body': ['Geist', 'Inter', 'system-ui', 'sans-serif'],   // Body text
        'ui': ['Geist', 'Inter', 'system-ui', 'sans-serif'],     // UI elements
        'sans': ['Geist', 'Inter', 'system-ui', 'sans-serif'],   // Default sans
        'serif': ['Instrument Serif', 'Georgia', 'serif'],            // Default serif
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

        // Narrative text — Sesame-inspired rgba opacity hierarchy
        'narrative': {
          DEFAULT: "var(--text-narrative)",
          secondary: "var(--text-narrative-secondary)",
          muted: "var(--text-narrative-muted)",
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
