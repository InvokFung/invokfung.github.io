import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://invokfung.github.io/onboard/ ; the build lands in ../onboard.
export default defineConfig({
  base: "/onboard/",
  plugins: [react()],
  worker: { format: "es" },
  server: { port: 8774, strictPort: true },
  preview: { port: 8774, strictPort: true },
  build: { outDir: "../onboard", emptyOutDir: true, target: "es2022" },
});
