// ============================================
// 默默图床 — Vercel Serverless Function 入口
// 极简网关：仅负责 polyfill 注入、环境变量桥接和 Hono 导出
// ============================================

import { DOMParser, Node } from "@xmldom/xmldom";
(globalThis as any).DOMParser = DOMParser;
(globalThis as any).Node = Node;

import { handle } from "hono/vercel";
import app from "../src/api/index";

// 将 Vercel 的 process.env 环境变量同步注入到 Hono 的 c.env 容器中
app.use("*", async (c, next) => {
  c.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
  c.env.JWT_SECRET = process.env.JWT_SECRET || "";
  c.env.SITE_URL = process.env.SITE_URL || "";
  c.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
  await next();
});

// 导出为符合 Vercel Serverless Function 规格的 handler
export default handle(app);
