// ============================================
// 默默图床 — 认证路由 (Vercel 原生版)
// ============================================

import { Hono } from "hono";
import { signJwt, getJwtSecret } from "../middleware/auth";
import { kvGet, kvGetJSON, kvSet, kvDel } from "../lib/kv";
import type { ApiToken } from "../shared/types";

const auth = new Hono<{ Bindings: Env }>();

/** 管理员登录 */
auth.post("/login", async (c) => {
  const body = await c.req.json<{ password: string }>();
  const adminPassword = c.env.ADMIN_PASSWORD || "momoimage";

  if (body.password !== adminPassword) {
    return c.json({ success: false, error: "密码错误" }, 401);
  }

  const jwtSecret = await getJwtSecret(c.env.JWT_SECRET);
  const token = await signJwt({ sub: "admin" }, jwtSecret);

  return c.json({
    success: true,
    data: { token },
  });
});

/** 创建 API Token */
auth.post("/token", async (c) => {
  // 生成随机 Token
  const body = await c.req.json<{ name: string }>();
  const tokenValue = generateToken();
  const tokenId = tokenValue.slice(0, 8);

  const tokenData: ApiToken = {
    id: tokenId,
    name: body.name || "未命名 Token",
    token: tokenValue,
    createdAt: new Date().toISOString(),
  };

  // 存储 Token 数据
  await kvSet(`momoimage:token:${tokenValue}`, tokenData);

  // 存储 Token 列表索引
  const tokenList = ((await kvGetJSON<Array<{ id: string; token: string }>>("momoimage:token:list")) ?? []);
  tokenList.push({ id: tokenId, token: tokenValue });
  await kvSet("momoimage:token:list", tokenList);

  return c.json({
    success: true,
    data: tokenData,
  });
});

/** 列出 API Tokens */
auth.get("/tokens", async (c) => {
  const tokenList = ((await kvGetJSON<Array<{ id: string; token: string }>>("momoimage:token:list")) ?? []);

  const tokens: ApiToken[] = [];
  for (const item of tokenList) {
    const data = await kvGetJSON<ApiToken>(`momoimage:token:${item.token}`);
    if (data) {
      // 隐藏完整 token 值
      tokens.push({
        ...data,
        token: data.token.slice(0, 8) + "..." + data.token.slice(-4),
      });
    }
  }

  return c.json({ success: true, data: tokens });
});

/** 删除 API Token */
auth.delete("/token/:id", async (c) => {
  const id = c.req.param("id");

  const tokenList = ((await kvGetJSON<Array<{ id: string; token: string }>>("momoimage:token:list")) ?? []);

  const item = tokenList.find((t) => t.id === id);
  if (!item) {
    return c.json({ success: false, error: "Token 不存在" }, 404);
  }

  // 删除 Token 数据
  await kvDel(`momoimage:token:${item.token}`);

  // 更新列表
  const newList = tokenList.filter((t) => t.id !== id);
  await kvSet("momoimage:token:list", newList);

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
