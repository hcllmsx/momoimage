// ============================================
// 默默图床 — 存储管理路由
// ============================================

import { Hono } from "hono";
import type { StorageConfig } from "@shared/types";
import { StorageManager } from "../storage/manager";

type Variables = { storageManager: StorageManager };
const storage = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 获取所有存储后端配置（包括已用空间和文件数统计） */
storage.get("/", async (c) => {
  const storageManager = c.get("storageManager") as StorageManager;
  const kv = c.env.KV_META;

  const configs = storageManager.getConfigs();
  const usedSizes: Record<string, number> = {};
  const fileCounts: Record<string, number> = {};

  configs.forEach(cfg => {
    usedSizes[cfg.id] = 0;
    fileCounts[cfg.id] = 0;
  });

  try {
    const allIds = ((await kv.get("momoimage:image:list", "json")) ?? []) as string[];
    const batchSize = 100;
    for (let i = 0; i < allIds.length; i += batchSize) {
      const batchIds = allIds.slice(i, i + batchSize);
      const batchPromises = batchIds.map(id => kv.get(`momoimage:image:${id}`, "json"));
      const batchResults = await Promise.all(batchPromises);
      for (const meta of batchResults) {
        if (meta && typeof meta === "object") {
          const m = meta as any;
          const sId = m.storageId || "local-r2";
          const size = m.size || 0;
          if (usedSizes[sId] !== undefined) {
            usedSizes[sId] += size;
            fileCounts[sId] += 1;
          } else {
            usedSizes[sId] = size;
            fileCounts[sId] = 1;
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to calculate storage stats:", err);
  }

  const data = configs.map(cfg => ({
    ...cfg,
    usedSize: usedSizes[cfg.id] || 0,
    fileCount: fileCounts[cfg.id] || 0
  }));

  return c.json({ success: true, data });
});

/** 添加存储后端 */
storage.post("/", async (c) => {
  const storageManager = c.get("storageManager") as StorageManager;
  const body = await c.req.json<StorageConfig>();
  if (!body.id) body.id = `storage-${Date.now().toString(36)}`;
  try {
    await storageManager.addStorage(body);
    return c.json({ success: true, data: { id: body.id } });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "添加失败" }, 400);
  }
});

/** 更新存储后端 */
storage.put("/:id", async (c) => {
  const id = c.req.param("id");
  const storageManager = c.get("storageManager") as StorageManager;
  const body = await c.req.json<Partial<StorageConfig>>();
  try {
    await storageManager.updateStorage(id, body);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "更新失败" }, 400);
  }
});

/** 删除存储后端 */
storage.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const storageManager = c.get("storageManager") as StorageManager;
  try {
    await storageManager.removeStorage(id);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "删除失败" }, 400);
  }
});

/** 测试存储连接 */
storage.post("/:id/test", async (c) => {
  const id = c.req.param("id");
  const storageManager = c.get("storageManager") as StorageManager;
  const result = await storageManager.testStorage(id);
  return c.json({ success: true, data: result });
});

export default storage;
