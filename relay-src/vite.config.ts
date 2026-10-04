import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://invokfung.github.io/relay/ ; the build lands in ../relay.
export default defineConfig({
  base: "/relay/",
  plugins: [react()],
  server: { port: 8776, strictPort: true },
  preview: { port: 8776, strictPort: true },
  build: { outDir: "../relay", emptyOutDir: true, chunkSizeWarningLimit: 600 },
});
