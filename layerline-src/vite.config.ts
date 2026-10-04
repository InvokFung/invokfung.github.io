import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://invokfung.github.io/layerline/ ; the build lands in ../layerline.
export default defineConfig({
  base: "/layerline/",
  plugins: [react()],
  worker: { format: "es" },
  build: { outDir: "../layerline", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
