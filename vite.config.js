import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    minify: 'esbuild',
    sourcemap: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase/') || id.includes('@realtime/') || id.includes('@postgrest/') || id.includes('@gotrue/')) return 'supabase';
        }
      }
    }
  },
  server: { proxy: { "/api/r2": { target: "http://127.0.0.1:8787", changeOrigin: true } } },
});
