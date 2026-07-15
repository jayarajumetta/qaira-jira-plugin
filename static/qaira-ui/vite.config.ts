import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "forge-vendor": ["@forge/bridge"],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "flow-vendor": ["@xyflow/react"],
          "file-vendor": ["fflate", "read-excel-file/browser"]
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
