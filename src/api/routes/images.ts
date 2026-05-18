// ============================================
// 默默图床 — 图片管理路由
// ============================================

import { Hono } from "hono";
import type { ImageMeta, PaginatedResult } from "@shared/types";
import { StorageManager } from "../storage/manager";

type Variables = { storageManager: StorageManager };
const images = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 获取图片列表（分页） */
images.get("/", async (c) => {
  const kv = c.env.KV_META;
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || "20", 10);

  // 获取图片 ID 列表
  const listKey = "momoimage:image:list";
  const allIds = ((await kv.get(listKey, "json")) ?? []) as string[];

  const total = allIds.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const pageIds = allIds.slice(start, end);

  // 批量获取图片元数据
  const items: ImageMeta[] = [];
  for (const id of pageIds) {
    const meta = await kv.get(`momoimage:image:${id}`, "json");
    if (meta) {
      items.push(meta as ImageMeta);
    }
  }

  const result: PaginatedResult<ImageMeta> = {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };

  return c.json({ success: true, data: result });
});

/** 获取图片详情 */
images.get("/:id", async (c) => {
  const id = c.req.param("id");
  const kv = c.env.KV_META;

  const meta = await kv.get(`momoimage:image:${id}`, "json");
  if (!meta) {
    return c.json({ success: false, error: "图片不存在" }, 404);
  }

  return c.json({ success: true, data: meta });
});

/** 删除图片 */
images.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const kv = c.env.KV_META;
  const storageManager = c.get("storageManager") as StorageManager;

  // 获取图片元数据
  const meta = (await kv.get(`momoimage:image:${id}`, "json")) as ImageMeta | null;
  if (!meta) {
    return c.json({ success: false, error: "图片不存在" }, 404);
  }

  try {
    // 从存储中删除文件
    const adapter = storageManager.getAdapter(meta.storageId);
    if (adapter) {
      await adapter.delete(meta.key);
    }

    // 删除元数据
    await kv.delete(`momoimage:image:${id}`);

    // 从列表索引中移除
    const listKey = "momoimage:image:list";
    const allIds = ((await kv.get(listKey, "json")) ?? []) as string[];
    const newIds = allIds.filter((itemId) => itemId !== id);
    await kv.put(listKey, JSON.stringify(newIds));

    return c.json({ success: true });
  } catch (err) {
    console.error("Delete failed:", err);
    return c.json(
      {
        success: false,
        error: `删除失败: ${err instanceof Error ? err.message : "未知错误"}`,
      },
      500
    );
  }
});

export default images;
