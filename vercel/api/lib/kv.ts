// ============================================
// 默默图床 — Vercel 原生 KV 数据库操作模块
// 直接使用 @upstash/redis 官方 SDK (Upstash Redis)
// ============================================

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

/**
 * 获取或初始化 Redis 客户端实例
 */
function getRedisInstance(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error("Redis 环境变量未配置 (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)");
    }

    _redis = new Redis({
      url,
      token,
    });
  }
  return _redis;
}

/**
 * 检查 Redis 是否已配置环境变量
 */
export function isKvConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
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

