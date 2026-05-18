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

  // 获取全局所有有效的 ID
  const globalListKey = "momoimage:image:list";
  const globalIds = ((await kv.get(globalListKey, "json")) ?? []) as string[];

  // 获取该分类下原有的 ID 列表
  let allIds = ((await kv.get(listKey, "json")) ?? []) as string[];

  // ==========================================
  // ⚡️ 极速自动修复与索引对齐系统
  // ==========================================
  // 并行获取所有全局图片的元数据
  const imageMetas = await Promise.all(
    globalIds.map(async (id) => {
      const meta = await kv.get(`momoimage:image:${id}`, "json") as ImageMeta | null;
      return { id, meta };
    })
  );

  // 筛选出属于当前 listKey 范围的有效图片 ID
  const activeIds = imageMetas
    .filter(({ meta }) => {
      if (!meta) return false;
      if (listKey === "momoimage:image:list") return true; // all
      
      const targetFolderId = (folderId === "root" || !folderId) ? undefined : folderId;
      return meta.folderId === targetFolderId;
    })
    .map(({ id }) => id);

  // 对比现有的 allIds 与计算出的 activeIds，若不符则说明发生不一致，自动覆写修复并对齐
  const isAligned = 
    allIds.length === activeIds.length && 
    allIds.every((val, index) => val === activeIds[index]);

  if (!isAligned) {
    console.log(`[Self-Healing] Index mismatch resolved for key: ${listKey}`);
    allIds = activeIds;
    await kv.put(listKey, JSON.stringify(allIds));
  }

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

/** 批量移动图片至其他文件夹 */
images.post("/batch/move", async (c) => {
  const { ids, folderId } = await c.req.json<{ ids: string[]; folderId?: string }>();
  const kv = c.env.KV_META;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ success: false, error: "请选择要移动的图片" }, 400);
  }

  const targetFolderId = folderId || undefined;

  // 1. 获取所有图片的元数据并分组（按原文件夹分组，方便一次性更新）
  const metas: ImageMeta[] = [];
  const folderToImageIds: Record<string, string[]> = {};

  for (const id of ids) {
    const meta = (await kv.get(`momoimage:image:${id}`, "json")) as ImageMeta | null;
    if (meta) {
      metas.push(meta);
      const oldFolderId = meta.folderId || "root";
      if (!folderToImageIds[oldFolderId]) {
        folderToImageIds[oldFolderId] = [];
      }
      folderToImageIds[oldFolderId].push(id);
    }
  }

  if (metas.length === 0) {
    return c.json({ success: false, error: "未找到有效的图片元数据" }, 404);
  }

  // 2. 更新每张图片的元数据中的 folderId
  for (const meta of metas) {
    const oldFolderId = meta.folderId;
    if (oldFolderId === targetFolderId) continue;

    if (targetFolderId) {
      meta.folderId = targetFolderId;
    } else {
      delete meta.folderId;
    }
    await kv.put(`momoimage:image:${meta.id}`, JSON.stringify(meta));
  }

  // 3. 从各个原文件夹索引中移除选中的 ID
  for (const [oldFolderId, removeIds] of Object.entries(folderToImageIds)) {
    if (oldFolderId === (targetFolderId || "root")) continue;

    const oldFolderKey = oldFolderId === "root"
      ? "momoimage:folder:root:images"
      : `momoimage:folder:${oldFolderId}:images`;

    const oldList = ((await kv.get(oldFolderKey, "json")) ?? []) as string[];
    const newOldList = oldList.filter((itemId) => !removeIds.includes(itemId));
    await kv.put(oldFolderKey, JSON.stringify(newOldList));
  }

  // 4. 追加至新存储分类索引中
  const newFolderKey = targetFolderId
    ? `momoimage:folder:${targetFolderId}:images`
    : "momoimage:folder:root:images";
  const newList = ((await kv.get(newFolderKey, "json")) ?? []) as string[];
  
  // 过滤掉原本就在目标分类中的 ID，避免重复添加
  const idsToInsert = ids.filter(id => {
    const meta = metas.find(m => m.id === id);
    return meta && meta.folderId === targetFolderId;
  });

  const newCombinedList = [...idsToInsert, ...newList.filter(id => !idsToInsert.includes(id))];
  await kv.put(newFolderKey, JSON.stringify(newCombinedList));

  return c.json({ success: true });
});

/** 批量删除图片 */
images.post("/batch/delete", async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  const kv = c.env.KV_META;
  const storageManager = c.get("storageManager") as StorageManager;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ success: false, error: "请选择要删除的图片" }, 400);
  }

  const metas: ImageMeta[] = [];
  const folderToImageIds: Record<string, string[]> = {};

  // 1. 读取并分组
  for (const id of ids) {
    const meta = (await kv.get(`momoimage:image:${id}`, "json")) as ImageMeta | null;
    if (meta) {
      metas.push(meta);
      const oldFolderId = meta.folderId || "root";
      if (!folderToImageIds[oldFolderId]) {
        folderToImageIds[oldFolderId] = [];
      }
      folderToImageIds[oldFolderId].push(id);
    }
  }

  if (metas.length === 0) {
    return c.json({ success: false, error: "未找到有效的图片元数据" }, 404);
  }

  // 2. 从物理存储中删除文件，并删除单个 KV 元数据
  const deletePromises = metas.map(async (meta) => {
    try {
      const adapter = storageManager.getAdapter(meta.storageId);
      if (adapter) {
        await adapter.delete(meta.key);
      }
    } catch (err) {
      console.error(`Failed to delete physical file for key ${meta.key}:`, err);
    }
    await kv.delete(`momoimage:image:${meta.id}`);
    await kv.delete(`momoimage:key:${meta.key}`);
  });

  await Promise.all(deletePromises);

  // 3. 一次性从全局列表索引中移除
  const globalListKey = "momoimage:image:list";
  const globalList = ((await kv.get(globalListKey, "json")) ?? []) as string[];
  const newGlobalList = globalList.filter((itemId) => !ids.includes(itemId));
  await kv.put(globalListKey, JSON.stringify(newGlobalList));

  // 4. 一次性从各个分类索引中移除
  for (const [folderId, removeIds] of Object.entries(folderToImageIds)) {
    const folderKey = folderId === "root"
      ? "momoimage:folder:root:images"
      : `momoimage:folder:${folderId}:images`;
    const oldList = ((await kv.get(folderKey, "json")) ?? []) as string[];
    const newList = oldList.filter((itemId) => !removeIds.includes(itemId));
    await kv.put(folderKey, JSON.stringify(newList));
  }

  return c.json({ success: true });
});

export default images;
