import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    mode === "analyze" &&
      visualizer({
        filename: "dist/bundle-report.html",
        gzipSize: true,
        brotliSize: true,
      }),
  ],
  build: {
    // Never ship source maps from the production build — they would expose original
    // TypeScript/JSX source (including any inline logic) to anyone opening dev tools.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/react-hook-form|@hookform[\\/]resolvers|[\\/]zod[\\/]/.test(id)) return "forms";
          if (/[\\/](react|react-dom|react-router-dom|scheduler)[\\/]/.test(id)) return "vendor";
          return undefined;
        },
      },
    },
  },
}));
