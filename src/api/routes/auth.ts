// ============================================
// 默默图床 — 认证路由
// ============================================

import { Hono } from "hono";
import { signJwt, getJwtSecret } from "../middleware/auth";
import type { ApiToken } from "@shared/types";

const auth = new Hono<{ Bindings: Env }>();

/** 管理员登录 */
auth.post("/login", async (c) => {
  const body = await c.req.json<{ password: string }>();
  const adminPassword = c.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return c.json(
      { success: false, error: "管理员密码未配置，请在 Cloudflare 控制台 → 设置 → 变量和机密 中添加 ADMIN_PASSWORD" },
      500
    );
  }

  if (body.password !== adminPassword) {
    return c.json({ success: false, error: "密码错误" }, 401);
  }

  const jwtSecret = await getJwtSecret(c.env);
  const token = await signJwt({ sub: "admin" }, jwtSecret);

  return c.json({
    success: true,
    data: { token },
  });
});

/** 创建 API Token */
auth.post("/token", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const kv = c.env.KV_META;

  // 生成随机 Token
  const tokenValue = generateToken();
  const tokenId = tokenValue.slice(0, 8);

  const tokenData: ApiToken = {
    id: tokenId,
    name: body.name || "未命名 Token",
    token: tokenValue,
    createdAt: new Date().toISOString(),
  };

  // 存储 Token 数据
  await kv.put(`momoimage:token:${tokenValue}`, JSON.stringify(tokenData));

  // 存储 Token 列表索引
  const tokenList = ((await kv.get("momoimage:token:list", "json")) ??
    []) as Array<{ id: string; token: string }>;
  tokenList.push({ id: tokenId, token: tokenValue });
  await kv.put("momoimage:token:list", JSON.stringify(tokenList));

  return c.json({
    success: true,
    data: tokenData,
  });
});

/** 列出 API Tokens */
auth.get("/tokens", async (c) => {
  const kv = c.env.KV_META;
  const tokenList = ((await kv.get("momoimage:token:list", "json")) ??
    []) as Array<{ id: string; token: string }>;

  const tokens: ApiToken[] = [];
  for (const item of tokenList) {
    const data = await kv.get(`momoimage:token:${item.token}`, "json");
    if (data) {
      const token = data as ApiToken;
      // 隐藏完整 token 值
      tokens.push({
        ...token,
        token: token.token.slice(0, 8) + "..." + token.token.slice(-4),
      });
    }
  }

  return c.json({ success: true, data: tokens });
});

/** 删除 API Token */
auth.delete("/token/:id", async (c) => {
  const id = c.req.param("id");
  const kv = c.env.KV_META;

  const tokenList = ((await kv.get("momoimage:token:list", "json")) ??
    []) as Array<{ id: string; token: string }>;

  const item = tokenList.find((t) => t.id === id);
  if (!item) {
    return c.json({ success: false, error: "Token 不存在" }, 404);
  }

  // 删除 Token 数据
  await kv.delete(`momoimage:token:${item.token}`);

  // 更新列表
  const newList = tokenList.filter((t) => t.id !== id);
  await kv.put("momoimage:token:list", JSON.stringify(newList));

  return c.json({ success: true });
});

/** 生成随机 Token */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default auth;
