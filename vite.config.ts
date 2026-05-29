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
        proxyTimeout: 120000,
        timeout: 120000,
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
    // audit-2026-05-29 load-perf: isolate the heavy, optional @elevenlabs voice
    // SDK into its own async chunk so it loads only when a voice route mounts
    // (was bundled into the 504kB DeepInterview route chunk; now ~33kB route +
    // a shared, cacheable vendor-elevenlabs chunk).
    //
    // Do NOT manual-chunk recharts: Vite already auto-splits it into an async
    // chunk, but forcing it into a named manualChunk pulled it into the eager
    // modulepreload set (an eager importer reaches it), which REGRESSED initial
    // load. Lesson: don't manual-chunk what Vite already code-splits well.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react', 'framer-motion', '@tanstack/react-query'],
          'vendor-elevenlabs': ['@elevenlabs/client'],
        },
      },
    },
  },
}));
