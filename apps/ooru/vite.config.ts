import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/client",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/client"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../../dist/public",
    emptyOutDir: true,
  },
});
