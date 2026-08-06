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
    // 端口由 scripts/dev.mjs 通过 MOMO_VITE_PORT 环境变量注入
    // 直接运行 npm run dev 时回退到 5173
    port: Number(process.env.MOMO_VITE_PORT) || 5173,
    strictPort: true,
    proxy: {
      // 代理目标由 scripts/dev.mjs 通过 MOMO_API_PORT 环境变量注入
      // 直接运行 npm run dev 时回退到 8787（wrangler 默认端口）
      "/api": `http://localhost:${process.env.MOMO_API_PORT || 8787}`,
      "/i": `http://localhost:${process.env.MOMO_API_PORT || 8787}`,
    },
  },
});
