// ============================================
// 默默图床 — Hono 后端入口
// ============================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware } from "./middleware/auth";
import { StorageManager } from "./storage/manager";
import authRoutes from "./routes/auth";
import uploadRoutes from "./routes/upload";
import imageRoutes from "./routes/images";
import storageRoutes from "./routes/storage";

type Variables = {
  storageManager: StorageManager;
  auth: { isAdmin: boolean; tokenId?: string };
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// 全局中间件
app.use("*", cors());
app.use("*", logger());

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
app.get("/api/info", (c) => {
  const siteUrl = getSiteUrl(c);
  const isDefaultDomain =
    siteUrl.includes(".workers.dev") || siteUrl.includes(".pages.dev");
  const needSetup = !c.env.ADMIN_PASSWORD;
  return c.json({
    success: true,
    data: {
      siteUrl,
      hasCustomDomain: !isDefaultDomain,
      deployTarget: c.env.DEPLOY_TARGET || "cloudflare",
      version: "1.0.0",
      needSetup,
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

  const adapter = manager.getDefault();
  if (!adapter) return c.text("Storage not configured", 500);

  const result = await adapter.get(decodeURIComponent(key));
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
app.use("/api/auth/token*", authMiddleware);

app.route("/api/upload", uploadRoutes);
app.route("/api/images", imageRoutes);
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
