// ============================================
// 默默图床 — 存储管理路由
// ============================================

import { Hono } from "hono";
import type { StorageConfig } from "@shared/types";
import { StorageManager } from "../storage/manager";

type Variables = { storageManager: StorageManager };
const storage = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 获取所有存储后端配置 */
storage.get("/", async (c) => {
  const storageManager = c.get("storageManager") as StorageManager;
  return c.json({ success: true, data: storageManager.getConfigs() });
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
  const ok = await storageManager.testStorage(id);
  return c.json({ success: true, data: { connected: ok, message: ok ? "连接成功" : "连接失败" } });
});

export default storage;
