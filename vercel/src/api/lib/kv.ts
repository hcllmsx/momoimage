// ============================================
// 默默图床 — Vercel 原生 KV 数据库操作模块
// 直接使用 @vercel/kv (Upstash for Redis) 原生 API
// ============================================

import { kv } from "@vercel/kv";

/**
 * 检查 Vercel KV (Upstash Redis) 是否已配置环境变量
 */
export function isKvConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * 从 Redis 中读取文本值
 */
export async function kvGet(key: string): Promise<string | null> {
  const val = await kv.get<string>(key);
  return val ?? null;
}

/**
 * 从 Redis 中读取 JSON 对象
 */
export async function kvGetJSON<T = unknown>(key: string): Promise<T | null> {
  const val = await kv.get<T>(key);
  return val ?? null;
}

/**
 * 写入值到 Redis（支持对象和字符串，@vercel/kv 自动处理序列化）
 */
export async function kvSet(key: string, value: unknown): Promise<void> {
  await kv.set(key, value);
}

/**
 * 从 Redis 中删除键
 */
export async function kvDel(key: string): Promise<void> {
  await kv.del(key);
}
