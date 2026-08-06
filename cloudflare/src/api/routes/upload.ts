// ============================================
// 默默图床 — 图片上传路由
// ============================================

import { Hono } from "hono";
import type { ImageMeta, UploadResult, Folder } from "@shared/types";
import { StorageManager } from "../storage/manager";

type Variables = { storageManager: StorageManager };
const upload = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 允许的图片 MIME 类型 */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "image/x-icon",
]);

/** 最大文件大小：20MB */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** 上传图片 */
upload.post("/", async (c) => {
  const storageManager = c.get("storageManager") as StorageManager;
  let siteUrl = (c.env.SITE_URL || "").replace(/\/$/, "");
  if (!siteUrl) {
    const url = new URL(c.req.url);
    siteUrl = `${url.protocol}//${url.host}`;
  }

  const body = await c.req.parseBody();
  const file = body["file"];
  const thumbnail = body["thumbnail"];

  if (!(file instanceof File)) {
    return c.json({ success: false, error: "请提供图片文件" }, 400);
  }

  // 验证文件类型
  if (!ALLOWED_TYPES.has(file.type)) {
    return c.json(
      {
        success: false,
        error: `不支持的文件类型: ${file.type}。支持: JPEG, PNG, GIF, WebP, SVG, AVIF`,
      },
      400
    );
  }

  // 验证文件大小
  if (file.size > MAX_FILE_SIZE) {
    return c.json(
      {
        success: false,
        error: `文件太大，最大支持 ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      },
      400
    );
  }

  // 获取指定的存储后端，或使用默认
  const storageId = c.req.query("storage");
  let folderId = (c.req.query("folderId") || body["folderId"]) as
    | string
    | undefined;

  // 支持 folderName 参数：若未提供 folderId 但提供了 folderName，
  // 则按名称查找已有文件夹，找不到则自动新建一个
  const folderName = (c.req.query("folderName") || body["folderName"]) as
    | string
    | undefined;
  if (!folderId && folderName && folderName.trim()) {
    const kv = c.env.KV_META;
    if (kv) {
      const folders =
        ((await kv.get("momoimage:folders", "json")) ?? []) as Folder[];
      const existing = folders.find(
        (f) => f.name.toLowerCase() === folderName.trim().toLowerCase()
      );
      if (existing) {
        folderId = existing.id;
      } else {
        const newId = `folder-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const newFolder: Folder = {
          id: newId,
          name: folderName.trim(),
          createdAt: new Date().toISOString(),
        };
        folders.push(newFolder);
        await kv.put("momoimage:folders", JSON.stringify(folders));
        folderId = newId;
      }
    }
  }

  let finalStorageId = storageId;
  if (!finalStorageId) {
    const configs = storageManager.getConfigs();
    const defaultConfig = configs.find((c) => c.isDefault && c.enabled);
    if (defaultConfig) {
      finalStorageId = defaultConfig.id;
    } else {
      const first = configs.find((c) => c.enabled);
      finalStorageId = first ? first.id : "local-r2";
    }
  }

  const adapter = storageManager.getAdapter(finalStorageId);

  if (!adapter) {
    return c.json(
      { success: false, error: "没有可用的存储后端，请先配置存储" },
      500
    );
  }

  // 生成文件 key: 根文件夹/yyyyMM/dd/随机6位/原文件名
  const datePrefix = formatDatePrefix(c);
  const randomChars = Math.random().toString(36).substring(2, 8);
  
  // 保留中英文、数字和常见符号，其他替换为下划线
  let originalName = file.name;
  const ext = getExtension(file.name, file.type);
  if (!originalName.includes('.')) originalName += ext;
  const safeName = originalName.replace(/[^a-zA-Z0-9.\-_\u4e00-\u9fa5]/g, '_');
  
  const id = generateId(); // 保留给数据库的唯一ID
  const key = `${datePrefix}/${randomChars}/${safeName}`;

  try {
    // 上传文件
    const arrayBuffer = await file.arrayBuffer();
    const result = await adapter.put(key, arrayBuffer, {
      contentType: file.type,
      metadata: {
        originalName: file.name,
      },
    });

    // 缩略图物理保存逻辑
    let hasThumbnail = false;
    let thumbnailKey = "";
    let thumbnailSize = 0;
    if (thumbnail instanceof File) {
      const lastDotIndex = key.lastIndexOf(".");
      thumbnailKey = lastDotIndex !== -1 
        ? `${key.slice(0, lastDotIndex)}_thumb.jpg` 
        : `${key}_thumb.jpg`;
      
      const thumbBuffer = await thumbnail.arrayBuffer();
      await adapter.put(thumbnailKey, thumbBuffer, {
        contentType: "image/jpeg",
        metadata: {
          originalName: `thumb_${file.name}`,
        },
      });
      thumbnailSize = thumbnail.size;
      hasThumbnail = true;
    }

    // 保存元数据到 KV
    const meta: ImageMeta = {
      id,
      key,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      storageId: finalStorageId,
      url: result.url,
      thumbnailUrl: hasThumbnail ? `${siteUrl}/i/${thumbnailKey}` : undefined,
      thumbnailSize: hasThumbnail ? thumbnailSize : undefined,
      folderId: folderId || undefined,
    };

    const kv = c.env.KV_META;
    await kv.put(`momoimage:image:${id}`, JSON.stringify(meta));
    await kv.put(`momoimage:key:${key}`, id);
    if (hasThumbnail) {
      await kv.put(`momoimage:key:${thumbnailKey}`, id);
    }

    // 更新图片列表索引
    await addToImageIndex(kv, id, folderId);

    // 生成各种格式的链接
    const imageUrl = `${siteUrl}/i/${key}`;
    const uploadResult: UploadResult = {
      id,
      url: imageUrl,
      thumbnailUrl: hasThumbnail ? `${siteUrl}/i/${thumbnailKey}` : undefined,
      originalName: file.name,
      size: file.size,
      mimeType: file.type,
      links: {
        url: imageUrl,
        markdown: `![${file.name}](${imageUrl})`,
        html: `<img src="${imageUrl}" alt="${file.name}" />`,
        bbcode: `[img]${imageUrl}[/img]`,
      },
    };

    return c.json({ success: true, data: uploadResult });
  } catch (err) {
    console.error("Upload failed:", err);
    return c.json(
      {
        success: false,
        error: `上传失败: ${err instanceof Error ? err.message : "未知错误"}`,
      },
      500
    );
  }
});

/** 获取文件扩展名 */
function getExtension(filename: string, mimeType: string): string {
  // 先从文件名获取
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex !== -1) {
    return filename.slice(dotIndex);
  }

  // 从 MIME 类型推断
  const mimeToExt: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "image/x-icon": ".ico",
  };

  return mimeToExt[mimeType] || ".bin";
}

/** 生成短 ID */
function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

/** 生成日期前缀：根文件夹/yyyyMM/dd */
function formatDatePrefix(c: any): string {
  const envVal = c.env.MOMO_STORAGE_ROOT;
  let rootFolder = "momoimageCloudflare";
  if (envVal && /^[a-zA-Z0-9]+$/.test(envVal)) {
    rootFolder = envVal;
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${rootFolder}/${year}${month}/${day}`;
}

/** 将图片 ID 添加到索引列表 */
async function addToImageIndex(kv: KVNamespace, id: string, folderId?: string): Promise<void> {
  // 1. 全局索引
  const globalListKey = "momoimage:image:list";
  const globalList = ((await kv.get(globalListKey, "json")) ?? []) as string[];
  globalList.unshift(id);
  await kv.put(globalListKey, JSON.stringify(globalList));

  // 2. 文件夹/分类索引
  const folderListKey = folderId 
    ? `momoimage:folder:${folderId}:images` 
    : "momoimage:folder:root:images";
  const folderList = ((await kv.get(folderListKey, "json")) ?? []) as string[];
  folderList.unshift(id);
  await kv.put(folderListKey, JSON.stringify(folderList));
}

export default upload;
