// ============================================
// 默默图床 — Hono 后端入口 (Vercel 原生版)
// ============================================

import { DOMParser, Node } from "@xmldom/xmldom";
(globalThis as any).DOMParser = DOMParser;
(globalThis as any).Node = Node;

import { handle } from "hono/vercel";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware } from "./middleware/auth";
import { StorageManager } from "./storage/manager";
import { kvGet, isKvConfigured } from "./lib/kv";
import authRoutes from "./routes/auth";
import uploadRoutes from "./routes/upload";
import imageRoutes from "./routes/images";
import storageRoutes from "./routes/storage";
import folderRoutes from "./routes/folders";

type Variables = {
  storageManager: StorageManager;
  auth: { isAdmin: boolean; tokenId?: string };
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// 环境变量注入中间件 — 必须最先注册
// 将 Vercel 的 process.env 同步到 Hono 的 c.env 容器
app.use("*", async (c, next) => {
  if (!c.env) {
    c.env = {} as any;
  }
  c.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
  c.env.JWT_SECRET = process.env.JWT_SECRET || "";
  c.env.SITE_URL = process.env.SITE_URL || "";
  c.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
  await next();
});

// 全局中间件
app.use("*", cors());
app.use("*", logger());

// 全局错误拦截器，拦截所有未捕获的运行时错误，统一以 JSON 响应返回
app.onError((err, c) => {
  console.error("[Hono] Uncaught API Error:", err);
  return c.json({
    success: false,
    error: err.message || "服务器内部错误",
  }, 500);
});

// 从请求中获取站点 URL（如果环境变量未设置，则自动检测）
function getSiteUrl(c: { env: Env; req: { url: string } }): string {
  if (c.env.SITE_URL) return c.env.SITE_URL.replace(/\/$/, "");
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

// 每次请求初始化存储管理器
app.use("/api/*", async (c, next) => {
  const siteUrl = getSiteUrl(c);
  const manager = new StorageManager({
    siteUrl,
    vercelBlobToken: c.env.BLOB_READ_WRITE_TOKEN ?? null,
  });
  await manager.initialize();
  c.set("storageManager", manager);
  await next();
});

// ========= 公开路由（无需认证） =========

// 系统信息
app.get("/api/info", async (c) => {
  const siteUrl = getSiteUrl(c);
  const isDefaultDomain = siteUrl.includes(".vercel.app");
  const isDefaultPassword = !c.env.ADMIN_PASSWORD;

  // 主动诊断 Vercel KV (Upstash Redis) 连通性
  let isKvValid = false;
  if (isKvConfigured()) {
    try {
      await kvGet("momoimage:system:test_connection");
      isKvValid = true;
    } catch (err) {
      console.error("[Diagnostics] Vercel KV connection check failed:", err);
    }
  }

  // 诊断 Vercel Blob 存储是否已配置
  const isStorageValid = !!c.env.BLOB_READ_WRITE_TOKEN;

  return c.json({
    success: true,
    data: {
      siteUrl,
      hasCustomDomain: !isDefaultDomain,
      deployTarget: "vercel",
      version: "1.0.0",
      isDefaultPassword,
      isKvValid,
      isStorageValid,
    },
  });
});

// 图片访问（公开）
app.get("/i/*", async (c) => {
  const key = c.req.path.replace("/i/", "");
  if (!key) return c.text("Not Found", 404);

  // 图片访问路由也需要存储管理器，手动初始化
  const siteUrl = getSiteUrl(c);
  const manager = new StorageManager({
    siteUrl,
    vercelBlobToken: c.env.BLOB_READ_WRITE_TOKEN ?? null,
  });
  await manager.initialize();

  let adapter = manager.getDefault();
  let resolvedStorageId = manager.getConfigs().find(cfg => cfg.isDefault && cfg.enabled)?.id || "local-blob";

  // 尝试通过 KV 映射关系查询该图片具体存储在哪个后端
  try {
    const { kvGet: kvGetText, kvGetJSON: kvGetJSONLocal } = await import("./lib/kv");
    const decodedKey = decodeURIComponent(key);
    const mappedId = await kvGetText(`momoimage:key:${decodedKey}`);
    if (mappedId) {
      const meta = await kvGetJSONLocal<any>(`momoimage:image:${mappedId}`);
      if (meta && meta.storageId) {
        const targetAdapter = manager.getAdapter(meta.storageId);
        if (targetAdapter) {
          adapter = targetAdapter;
          resolvedStorageId = meta.storageId;
        }
      }
    }
  } catch (err) {
    console.error("Failed to resolve storage adapter by key mapping:", err);
  }

  if (!adapter) return c.text("Storage not configured", 500);

  let result = await adapter.get(decodeURIComponent(key));
  
  // 自愈降级与自愈机制：如果从指定/默认适配器找不到图片，则尝试从其他启用的存储中拉取
  if (!result) {
    const configs = manager.getConfigs().filter((cfg) => cfg.enabled && cfg.id !== resolvedStorageId);
    for (const config of configs) {
      const targetAdapter = manager.getAdapter(config.id);
      if (targetAdapter) {
        try {
          const fallbackResult = await targetAdapter.get(decodeURIComponent(key));
          if (fallbackResult) {
            result = fallbackResult;
            
            // 自愈：在后台自动寻找匹配此 key 的图片 id，并重新注册 KV 的 key->id 映射
            const repairTask = async () => {
              try {
                const { kvGetJSON: kvGetJSONRepair, kvSet: kvSetRepair } = await import("./lib/kv");
                const list = ((await kvGetJSONRepair<string[]>("momoimage:image:list")) ?? []);
                for (const imgId of list) {
                  const meta = await kvGetJSONRepair<any>(`momoimage:image:${imgId}`);
                  if (meta && meta.key === decodeURIComponent(key)) {
                    await kvSetRepair(`momoimage:key:${decodeURIComponent(key)}`, imgId);
                    console.log(`[Auto-Repair] Successfully auto-repaired legacy key mapping for ${key} -> ${imgId}`);
                    break;
                  }
                }
              } catch (repairErr) {
                console.error("[Auto-Repair] Failed to repair key mapping:", repairErr);
              }
            };

            // Vercel Serverless 环境中没有 executionCtx.waitUntil
            repairTask();
            break;
          }
        } catch (err) {
          console.error(`Fallback failed for adapter ${config.id}:`, err);
        }
      }
    }
  }

  if (!result) return c.text("Not Found", 404);

  return new Response(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(result.size),
    },
  });
});

// 登录路由（无需认证）
app.route("/api/auth", authRoutes);

// ========= 受保护路由（需要认证） =========
app.use("/api/upload/*", authMiddleware);
app.use("/api/images/*", authMiddleware);
app.use("/api/storage/*", authMiddleware);
app.use("/api/folders/*", authMiddleware);
app.use("/api/auth/token*", authMiddleware);

app.route("/api/upload", uploadRoutes);
app.route("/api/images", imageRoutes);
app.route("/api/folders", folderRoutes);
app.route("/api/storage", storageRoutes);

// ========= 前端静态资源回退 =========
app.get("*", async (c) => {
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.status === 404 && !c.req.path.startsWith("/api/") && !c.req.path.startsWith("/i/")) {
      const url = new URL(c.req.url);
      url.pathname = "/index.html";
      return c.env.ASSETS.fetch(url.toString());
    }
    return res;
  }
  return c.text("Not Found", 404);
});

export default handle(app);
