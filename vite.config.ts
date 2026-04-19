import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Vercel preview deploys share the same VITE_API_URL env var as production,
// which bakes the prod origin into the preview bundle -> every /api call from
// preview triggers CORS against prod. Force same-origin /api on preview deploys
// so the preview frontend hits the preview backend.
const viteApiUrl =
  process.env.VERCEL_ENV === "preview"
    ? "/api"
    : process.env.VITE_API_URL || "http://localhost:3004/api";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(viteApiUrl),
  },
  server: {
    host: "::",
    port: 8086,
    strictPort: true, // Force this exact port, don't auto-increment
    allowedHosts: true, // Allow all hosts for development
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3004',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react', 'framer-motion', '@tanstack/react-query'],
        },
      },
    },
  },
}));
