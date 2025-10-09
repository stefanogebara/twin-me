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
        // Anthropic/Claude Design System Fonts
        'heading': ['Space Grotesk', 'system-ui', '-apple-system', 'sans-serif'],  // Styrene A alternative
        'body': ['Source Serif 4', 'Georgia', 'serif'],                            // Tiempos alternative
        'ui': ['DM Sans', 'system-ui', 'sans-serif'],                              // Styrene B alternative
        'sans': ['DM Sans', 'system-ui', 'sans-serif'],                            // Default sans
        'serif': ['Source Serif 4', 'Georgia', 'serif'],                           // Default serif
        'mono': ['JetBrains Mono', 'Consolas', 'monospace'],                       // Monospace
      },
      colors: {
        // Semantic tokens from CSS variables
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
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
