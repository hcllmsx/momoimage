// ============================================
// 默默图床 — Vercel Serverless Function 入口
// 极简网关：polyfill 注入 + Hono 导出
// ============================================

import { DOMParser, Node } from "@xmldom/xmldom";
(globalThis as any).DOMParser = DOMParser;
(globalThis as any).Node = Node;

import { handle } from "hono/vercel";
import app from "../src/api/index";

export default handle(app);
