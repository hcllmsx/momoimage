// ============================================
// 默默图床 — Vercel Serverless Function 入口
// Vercel 零配置模式：直接导出 Hono app 实例
// ============================================

import { DOMParser, Node } from "@xmldom/xmldom";
(globalThis as any).DOMParser = DOMParser;
(globalThis as any).Node = Node;

import app from "../src/api/index";

export default app;
