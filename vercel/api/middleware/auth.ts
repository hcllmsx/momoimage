// ============================================
// 默默图床 — 认证中间件 (Vercel 原生版)
// 支持 JWT 会话认证和 API Token 认证
// ============================================

import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { kvGet, kvSet, kvGetJSON } from "../lib/kv";

/**
 * 获取 JWT 密钥：优先用环境变量，否则自动生成并存储到 KV
 * 这样用户不需要手动配置 JWT_SECRET
 */
export async function getJwtSecret(jwtSecretEnv?: string): Promise<string> {
  // 1. 优先使用环境变量
  if (jwtSecretEnv) return jwtSecretEnv;

  // 2. 从 KV 读取已生成的密钥
  const kvKey = "momoimage:system:jwt_secret";
  try {
    const saved = await kvGet(kvKey);
    if (saved) return saved;

    // 3. 首次使用，自动生成并保存
    const bytes = new Uint8Array(48);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes)
      .map((b) => b.toString(36).padStart(2, "0"))
      .join("");
    
    try {
      await kvSet(kvKey, secret);
    } catch (putErr) {
      console.error("[VercelKV] Failed to save auto-generated JWT secret:", putErr);
    }
    return secret;
  } catch (getErr) {
    console.error("[VercelKV] Failed to read JWT secret from KV:", getErr);
  }

  // 实在没有 KV 也没有环境变量，用一个固定备用值（不安全，仅用于防崩溃）
  return "momoimage-fallback-secret-please-configure";
}

/** JWT Payload 结构 */
interface JwtPayload {
  sub: string;
  exp: number;
  iat: number;
}

/** 从 Hono Context 获取认证信息 */
export function getAuth(c: Context): { isAdmin: boolean; tokenId?: string } {
  return c.get("auth") ?? { isAdmin: false };
}

/**
 * 认证中间件
 * 同时支持:
 *   - Authorization: Bearer <jwt>  （管理后台登录后的 JWT）
 *   - Authorization: Token <api-token>  （外部 API 调用的 Token）
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json({ success: false, error: "未提供认证信息" }, 401);
  }

  const jwtSecret = await getJwtSecret(c.env.JWT_SECRET);

  // JWT Bearer 认证
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = await verifyJwt(token, jwtSecret);
      if (payload.sub === "admin") {
        c.set("auth", { isAdmin: true });
        await next();
        return;
      }
    } catch {
      return c.json({ success: false, error: "JWT 无效或已过期" }, 401);
    }
  }

  // API Token 认证
  if (authHeader.startsWith("Token ")) {
    const token = authHeader.slice(6);
    const isValid = await validateApiToken(token);
    if (isValid) {
      c.set("auth", { isAdmin: false, tokenId: token.slice(0, 8) });
      await next();
      return;
    }
    return c.json({ success: false, error: "API Token 无效" }, 401);
  }

  return c.json({ success: false, error: "认证格式错误" }, 401);
});

// ============================================
// JWT 工具函数（使用 Web Crypto API，无需外部依赖）
// ============================================

/** 生成 JWT */
export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: number = 7 * 24 * 60 * 60 // 默认 7 天
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const jwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(jwtPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  );

  const encodedSignature = base64UrlEncodeBuffer(signature);
  return `${signingInput}.${encodedSignature}`;
}

/** 验证 JWT */
async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await getSigningKey(secret);
  const signature = base64UrlDecodeToBuffer(encodedSignature);

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(signingInput)
  );

  if (!valid) throw new Error("Invalid signature");

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("JWT expired");
  }

  return payload;
}

/** 验证 API Token */
async function validateApiToken(token: string): Promise<boolean> {
  const tokenData = await kvGetJSON<Record<string, unknown>>(`momoimage:token:${token}`);
  if (!tokenData) return false;

  // 更新最后使用时间
  await kvSet(`momoimage:token:${token}`, {
    ...tokenData,
    lastUsedAt: new Date().toISOString(),
  });

  return true;
}

/** 获取 HMAC 签名密钥 */
async function getSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// ============================================
// Base64 URL 编解码工具
// ============================================

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  return atob(base64);
}

function base64UrlEncodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToBuffer(str: string): ArrayBuffer {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
