import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://invokfung.github.io/studio/ ; the build lands in ../studio.
export default defineConfig({
  base: "/studio/",
  plugins: [react()],
  // The AudioWorklet processors are bundled as standalone scripts (?worker&url),
  // so they must not be split into chunks that import each other.
  worker: { format: "es" },
  build: { outDir: "../studio", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
