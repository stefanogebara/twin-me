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
        // Nocturne's three voices, reached through the tokens rather than
        // repeated here. This block used to hard-code the Claura stacks, and
        // because Tailwind emits a LITERAL font stack for font-heading /
        // font-sans / font-mono, no CSS variable could reach them: the flip
        // and the bridge both went straight past. 162 uses of font-heading
        // across 80 files were still rendering Instrument Serif, and every
        // font-sans/body/ui was still leading with Geist.
        // Keep these pointing at the vars so the token layer stays the single
        // source of truth — nocturne.css defines them on :root.
        'heading': 'var(--n-serif)',   // Fraunces 300
        'serif': 'var(--n-serif)',
        'body': 'var(--n-sans)',       // Inter
        'ui': 'var(--n-sans)',
        'sans': 'var(--n-sans)',
        'mono': 'var(--n-mono)',       // Roboto Mono
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
          orange: 'rgba(255,255,255,0.6)',
          'orange-hover': 'rgba(255,255,255,0.7)',
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
