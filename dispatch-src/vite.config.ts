import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://invokfung.github.io/dispatch/ ; the build lands in ../dispatch.
export default defineConfig({
  base: "/dispatch/",
  plugins: [react()],
  worker: { format: "es" },
  server: { port: 8775, strictPort: true },
  preview: { port: 8775, strictPort: true },
  build: { outDir: "../dispatch", emptyOutDir: true, target: "es2022" },
});
