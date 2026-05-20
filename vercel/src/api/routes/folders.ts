// ============================================
// 默默图床 — 文件夹分类管理路由 (Vercel 原生版)
// ============================================

import { Hono } from "hono";
import { kvGetJSON, kvSet, kvDel } from "../lib/kv";
import type { Folder, ImageMeta } from "@shared/types";

const folders = new Hono<{ Bindings: Env }>();

/** 列出所有文件夹 */
folders.get("/", async (c) => {
  const list = ((await kvGetJSON<Folder[]>("momoimage:folders")) ?? []);
  return c.json({ success: true, data: list });
});

/** 创建新文件夹 */
folders.post("/", async (c) => {
  const body = await c.req.json<{ name: string }>();
  if (!body.name || !body.name.trim()) {
    return c.json({ success: false, error: "文件夹名称不能为空" }, 400);
  }

  const name = body.name.trim();

  // 获取所有文件夹并检查重名
  const list = ((await kvGetJSON<Folder[]>("momoimage:folders")) ?? []);
  if (list.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    return c.json({ success: false, error: "已存在同名文件夹" }, 400);
  }

  // 生成唯一短 ID
  const id = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newFolder: Folder = {
    id,
    name,
    createdAt: new Date().toISOString(),
  };

  list.push(newFolder);
  await kvSet("momoimage:folders", list);

  return c.json({ success: true, data: newFolder });
});

/** 删除文件夹 */
folders.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const list = ((await kvGetJSON<Folder[]>("momoimage:folders")) ?? []);
  const folderExists = list.some((f) => f.id === id);
  if (!folderExists) {
    return c.json({ success: false, error: "文件夹不存在" }, 404);
  }

  // 1. 从列表中移除文件夹
  const newList = list.filter((f) => f.id !== id);
  await kvSet("momoimage:folders", newList);

  // 2. 安全处理：将此文件夹下的所有图片移到根目录，防止丢失分类
  const folderImagesKey = `momoimage:folder:${id}:images`;
  const folderImageIds = ((await kvGetJSON<string[]>(folderImagesKey)) ?? []);

  if (folderImageIds.length > 0) {
    // 读取根目录图片列表
    const rootImagesKey = "momoimage:folder:root:images";
    const rootImageIds = ((await kvGetJSON<string[]>(rootImagesKey)) ?? []);

    // 合并图片 ID 到根目录（原文件夹内的文件插在最前）
    const newRootImageIds = [...folderImageIds, ...rootImageIds];
    await kvSet(rootImagesKey, newRootImageIds);

    // 批量更新图片元数据中的 folderId 字段为 undefined
    for (const imageId of folderImageIds) {
      const meta = await kvGetJSON<ImageMeta>(`momoimage:image:${imageId}`);
      if (meta) {
        delete meta.folderId;
        await kvSet(`momoimage:image:${imageId}`, meta);
      }
    }
  }

  // 3. 删除该文件夹的图片索引键
  await kvDel(folderImagesKey);

  return c.json({ success: true });
});

export default folders;
