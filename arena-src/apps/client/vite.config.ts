import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://invokfung.github.io/arena/ ; the build lands in <repo>/arena.
export default defineConfig({
  base: "/arena/",
  plugins: [react()],
  worker: { format: "es" },
  build: { outDir: "../../../arena", emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: { port: 5174 },
});
