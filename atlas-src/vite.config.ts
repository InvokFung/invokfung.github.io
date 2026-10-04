import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://invokfung.github.io/atlas/ ; the build lands in ../atlas.
export default defineConfig({
  base: "/atlas/",
  plugins: [react()],
  build: { outDir: "../atlas", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
