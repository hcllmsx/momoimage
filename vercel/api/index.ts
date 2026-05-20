// ============================================
// 默默图床 — Vercel Serverless API 后端入口
// ============================================

import { DOMParser, Node } from "@xmldom/xmldom";
(globalThis as any).DOMParser = DOMParser;
(globalThis as any).Node = Node;

import { handle } from "hono/vercel";
import { kv as vercelKV } from "@vercel/kv";
import app from "../src/api/index";

/**
 * Vercel KV 兼容适配器
 * 将 Vercel KV (@vercel/kv) 接口包装为 Cloudflare KVNamespace 兼容的鸭子类型
 * 支持 Hono 业务层无缝调用 get / put / delete
 */
class VercelKVCompat {
  async get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream") {
    try {
      const val = await vercelKV.get(key);
      if (val === null || val === undefined) return null;

      // 如果调用方要求 JSON 格式，且底层直接返回了对象（@vercel/kv 会自动解析对象），则直接返回
      if (type === "json") {
        if (typeof val === "object") {
          return val;
        }
        try {
          return JSON.parse(val as string);
        } catch {
          return val;
        }
      }

      // 如果返回的是对象，我们转为 JSON 字符串以模拟 CF KV 的默认文本输出
      if (typeof val === "object") {
        return JSON.stringify(val);
      }

      return String(val);
    } catch (err) {
      console.error(`[VercelKV] Get error for key ${key}:`, err);
      return null;
    }
  }

  async put(key: string, value: string): Promise<void> {
    try {
      // 在 Redis / Vercel KV 中，我们最好直接存对象以保证最佳数据形态
      // 这里尝试解析为对象存入，如果是非 JSON 字符串，则直接以字符串存入
      try {
        const parsed = JSON.parse(value);
        if (parsed !== null && typeof parsed === "object") {
          await vercelKV.set(key, parsed);
          return;
        }
      } catch {}
      await vercelKV.set(key, value);
    } catch (err) {
      console.error(`[VercelKV] Put error for key ${key}:`, err);
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await vercelKV.del(key);
    } catch (err) {
      console.error(`[VercelKV] Delete error for key ${key}:`, err);
      throw err;
    }
  }
}

// 实例化 KV 兼容桥接层
const kvMetaInstance = new VercelKVCompat();

// 使用 Hono 的全局中间件注入 Vercel 绑定的环境变量与模拟的 KV/Blob
app.use("*", async (c, next) => {
  // 注入模拟的 KV_META 对象
  c.env.KV_META = kvMetaInstance;
  
  // R2 设为 null，因为 Vercel 下我们默认使用 Vercel Blob 作为本地内置存储
  c.env.R2_BUCKET = null;

  // 将 Vercel 环境变量无缝同步至 Hono 的 c.env 容器中
  c.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
  c.env.JWT_SECRET = process.env.JWT_SECRET || "";
  c.env.SITE_URL = process.env.SITE_URL || "";
  c.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";

  await next();
});

// 导出为符合 Vercel Serverless Function 规格的 handler
export default handle(app);
