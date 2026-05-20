// ============================================
// 默默图床 — Hono 后端入口
// ============================================

import { DOMParser, Node } from "@xmldom/xmldom";
(globalThis as any).DOMParser = DOMParser;
(globalThis as any).Node = Node;

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware } from "./middleware/auth";
import { StorageManager } from "./storage/manager";
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

// 全局中间件
app.use("*", cors());
app.use("*", logger());

// 全局错误拦截器，拦截 Cloudflare Workers 运行期间的未捕获错误并安全返回 JSON，防止抛出 HTML 异常
app.onError((err, c) => {
  console.error("[Hono] Uncaught Worker Error:", err);
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
    kv: c.env.KV_META ?? null,
    siteUrl,
    r2Bucket: c.env.R2_BUCKET ?? null,
  });
  await manager.initialize();
  c.set("storageManager", manager);
  await next();
});

// ========= 公开路由（无需认证） =========

// 系统信息
app.get("/api/info", async (c) => {
  const siteUrl = getSiteUrl(c);
  const isDefaultDomain =
    siteUrl.includes(".workers.dev") || siteUrl.includes(".pages.dev");
  const isDefaultPassword = !c.env.ADMIN_PASSWORD;

  // 主动诊断 KV_META 资源绑定连通性
  let isKvValid = false;
  const kv = c.env.KV_META;
  if (kv) {
    try {
      await kv.get("momoimage:system:test_connection");
      isKvValid = true;
    } catch (err) {
      console.error("[Diagnostics] CF KV connection check failed:", err);
    }
  }

  // 诊断内置本地 R2 存储资源是否已绑定
  const isStorageValid = !!c.env.R2_BUCKET;

  return c.json({
    success: true,
    data: {
      siteUrl,
      hasCustomDomain: !isDefaultDomain,
      deployTarget: "cloudflare",
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
    kv: c.env.KV_META ?? null,
    siteUrl,
    r2Bucket: c.env.R2_BUCKET ?? null,
  });
  await manager.initialize();

  const kv = c.env.KV_META;
  let adapter = manager.getDefault();
  let resolvedStorageId = manager.getConfigs().find(cfg => cfg.isDefault && cfg.enabled)?.id || "local-r2";

  // 尝试通过 KV 映射关系查询该图片具体存储在哪个后端
  try {
    const decodedKey = decodeURIComponent(key);
    const mappedId = await kv.get(`momoimage:key:${decodedKey}`);
    if (mappedId) {
      const meta = (await kv.get(`momoimage:image:${mappedId}`, "json")) as any;
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
  
  // 自愈降级与自愈机制：如果从指定/默认适配器找不到图片（通常是由于老旧图片缺乏对应映射），则尝试从其他启用的存储中拉取
  if (!result) {
    const configs = manager.getConfigs().filter((cfg) => cfg.enabled && cfg.id !== resolvedStorageId);
    for (const config of configs) {
      const targetAdapter = manager.getAdapter(config.id);
      if (targetAdapter) {
        try {
          const fallbackResult = await targetAdapter.get(decodeURIComponent(key));
          if (fallbackResult) {
            result = fallbackResult;
            
            // 自愈：在后台自动寻找匹配此 key 的图片 id，并重新注册 KV 的 key->id 映射，实现数据库自动升级自愈
            const repairTask = async () => {
              try {
                const list = ((await kv.get("momoimage:image:list", "json")) ?? []) as string[];
                for (const imgId of list) {
                  const meta = (await kv.get(`momoimage:image:${imgId}`, "json")) as any;
                  if (meta && meta.key === decodeURIComponent(key)) {
                    await kv.put(`momoimage:key:${decodeURIComponent(key)}`, imgId);
                    console.log(`[Auto-Repair] Successfully auto-repaired legacy key mapping for ${key} -> ${imgId}`);
                    break;
                  }
                }
              } catch (repairErr) {
                console.error("[Auto-Repair] Failed to repair key mapping:", repairErr);
              }
            };

            if (c.executionCtx) {
              c.executionCtx.waitUntil(repairTask());
            } else {
              repairTask();
            }
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
// 如果没有任何 API 路由匹配，则将请求交给 Cloudflare 静态资产服务（前端页面）
// 这样可以避免 `/i/*` 等直接访问被 Vite 插件拦截到 SPA 导致的需要登录问题
app.get("*", async (c) => {
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    // 如果 ASSETS 找不到该文件，并且不是 API 请求，则返回 index.html（SPA 路由回退）
    if (res.status === 404 && !c.req.path.startsWith("/api/") && !c.req.path.startsWith("/i/")) {
      const url = new URL(c.req.url);
      url.pathname = "/index.html";
      return c.env.ASSETS.fetch(url.toString());
    }
    return res;
  }
  return c.text("Not Found", 404);
});

export default app;
