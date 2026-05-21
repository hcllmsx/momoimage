// ============================================
// 默默图床 — Vercel 原生 KV 数据库操作模块
// 直接使用 @upstash/redis 官方 SDK (Upstash Redis)
// ============================================

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

/**
 * 尝试从标准 Redis 连接 URL (如 KV_URL 或 REDIS_URL) 解析出 Upstash REST URL 和 Token
 * 例如：rediss://default:gQAA...@evolving-grub-132687.upstash.io:6379
 */
function parseRedisUrl(redisUrl: string): { url: string; token: string } | null {
  try {
    const parsed = new URL(redisUrl.trim());
    const token = parsed.password || parsed.username;
    const host = parsed.hostname;
    if (token && host) {
      return {
        url: `https://${host}`,
        token,
      };
    }
  } catch (e) {
    // 解析失败
  }
  return null;
}

/**
 * 统一获取 Redis 的 REST URL 和 Token 凭证
 */
function getRedisCredentials(): { url: string; token: string } | null {
  // 1. 优先使用 UPSTASH_REDIS_REST_URL / TOKEN
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      url: process.env.UPSTASH_REDIS_REST_URL.trim(),
      token: process.env.UPSTASH_REDIS_REST_TOKEN.trim(),
    };
  }

  // 2. 其次使用 KV_REST_API_URL / TOKEN
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return {
      url: process.env.KV_REST_API_URL.trim(),
      token: process.env.KV_REST_API_TOKEN.trim(),
    };
  }

  // 3. 再次尝试解析 KV_URL (redis 协议)
  if (process.env.KV_URL) {
    const creds = parseRedisUrl(process.env.KV_URL);
    if (creds) return creds;
  }

  // 4. 最后尝试解析 REDIS_URL (redis 协议)
  if (process.env.REDIS_URL) {
    const creds = parseRedisUrl(process.env.REDIS_URL);
    if (creds) return creds;
  }

  return null;
}

/**
 * 获取或初始化 Redis 客户端实例
 */
function getRedisInstance(): Redis {
  if (!_redis) {
    const creds = getRedisCredentials();
    if (!creds) {
      throw new Error(
        "Redis 环境变量未配置，请配置以下任意一组环境变量：\n" +
        "1. UPSTASH_REDIS_REST_URL 和 UPSTASH_REDIS_REST_TOKEN\n" +
        "2. KV_REST_API_URL 和 KV_REST_API_TOKEN\n" +
        "3. KV_URL 或 REDIS_URL"
      );
    }

    _redis = new Redis({
      url: creds.url,
      token: creds.token,
    });
  }
  return _redis;
}

/**
 * 检查 Redis 是否已配置环境变量
 */
export function isKvConfigured(): boolean {
  return getRedisCredentials() !== null;
}

/**
 * 从 Redis 中读取文本值
 */
export async function kvGet(key: string): Promise<string | null> {
  const redis = getRedisInstance();
  const val = await redis.get(key);
  if (val === null || val === undefined) return null;
  return typeof val === "string" ? val : JSON.stringify(val);
}

/**
 * 从 Redis 中读取 JSON 对象
 */
export async function kvGetJSON<T = unknown>(key: string): Promise<T | null> {
  const redis = getRedisInstance();
  const val = await redis.get(key);
  if (val === null || val === undefined) return null;
  
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }
  return val as T;
}

/**
 * 写入值到 Redis（@upstash/redis 自动将对象处理为 JSON 字符串）
 */
export async function kvSet(key: string, value: unknown): Promise<void> {
  const redis = getRedisInstance();
  await redis.set(key, value);
}

/**
 * 从 Redis 中删除键
 */
export async function kvDel(key: string): Promise<void> {
  const redis = getRedisInstance();
  await redis.del(key);
}

