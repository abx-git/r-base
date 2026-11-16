import { defineConfig } from "vite";

export default defineConfig({
  /** GitHub Pages: BASE_PATH=/r-base/ npm run build */
  base: process.env.BASE_PATH ?? "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});