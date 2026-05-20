import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@api": fileURLToPath(new URL("./src/api", import.meta.url)),
      "@client": fileURLToPath(new URL("./src/client", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/i": "http://localhost:3000",
    },
  },
});
