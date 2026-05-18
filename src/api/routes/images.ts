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

  // 获取图片 ID 列表（支持文件夹过滤与向下兼容）
  const folderId = c.req.query("folderId");
  let listKey: string;

  if (folderId && folderId !== "root" && folderId !== "all") {
    listKey = `momoimage:folder:${folderId}:images`;
  } else if (folderId === "all") {
    listKey = "momoimage:image:list";
  } else {
    // 根目录逻辑：如果系统内一个文件夹都没有创建过，为向下兼容显示全部图片
    const folders = ((await kv.get("momoimage:folders", "json")) ?? []) as unknown[];
    if (folders.length === 0) {
      listKey = "momoimage:image:list";
    } else {
      listKey = "momoimage:folder:root:images";
    }
  }

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
    await kv.delete(`momoimage:key:${meta.key}`);

    // 从全局列表索引中移除
    const listKey = "momoimage:image:list";
    const allIds = ((await kv.get(listKey, "json")) ?? []) as string[];
    const newIds = allIds.filter((itemId) => itemId !== id);
    await kv.put(listKey, JSON.stringify(newIds));

    // 从文件夹/根目录索引中移除
    const folderListKey = meta.folderId 
      ? `momoimage:folder:${meta.folderId}:images` 
      : "momoimage:folder:root:images";
    const folderImageIds = ((await kv.get(folderListKey, "json")) ?? []) as string[];
    const newFolderImageIds = folderImageIds.filter((itemId) => itemId !== id);
    await kv.put(folderListKey, JSON.stringify(newFolderImageIds));

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

/** 移动图片至其他文件夹 (分类迁移) */
images.put("/:id/move", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ folderId?: string }>();
  const kv = c.env.KV_META;

  // 获取图片元数据
  const meta = (await kv.get(`momoimage:image:${id}`, "json")) as ImageMeta | null;
  if (!meta) {
    return c.json({ success: false, error: "图片不存在" }, 404);
  }

  const oldFolderId = meta.folderId;
  const newFolderId = body.folderId || undefined;

  if (oldFolderId === newFolderId) {
    return c.json({ success: true, data: meta });
  }

  // 1. 更新元数据
  if (newFolderId) {
    meta.folderId = newFolderId;
  } else {
    delete meta.folderId;
  }
  await kv.put(`momoimage:image:${id}`, JSON.stringify(meta));

  // 2. 从原存储分类索引中移除
  const oldFolderKey = oldFolderId 
    ? `momoimage:folder:${oldFolderId}:images` 
    : "momoimage:folder:root:images";
  const oldList = ((await kv.get(oldFolderKey, "json")) ?? []) as string[];
  const newOldList = oldList.filter((itemId) => itemId !== id);
  await kv.put(oldFolderKey, JSON.stringify(newOldList));

  // 3. 追加至新存储分类索引中
  const newFolderKey = newFolderId 
    ? `momoimage:folder:${newFolderId}:images` 
    : "momoimage:folder:root:images";
  const newList = ((await kv.get(newFolderKey, "json")) ?? []) as string[];
  newList.unshift(id); // 新插入的文件放置于最前
  await kv.put(newFolderKey, JSON.stringify(newList));

  return c.json({ success: true, data: meta });
});

export default images;
