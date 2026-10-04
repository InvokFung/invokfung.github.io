import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://invokfung.github.io/tracewise/ ; the build lands in ../tracewise.
export default defineConfig({
  base: "/tracewise/",
  plugins: [react()],
  worker: { format: "es" },
  build: { outDir: "../tracewise", emptyOutDir: true, target: "es2022" },
  server: { port: 8775, strictPort: true },
  preview: { port: 8775, strictPort: true },
});
