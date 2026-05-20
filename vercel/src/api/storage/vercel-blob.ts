// ============================================
// 默默图床 — Vercel Blob 存储适配器
// 用于 Vercel 部署时使用 Vercel Blob 存储
// ============================================

import type {
  StorageAdapter,
  PutOptions,
  PutResult,
  GetResult,
  ListOptions,
  ListResult,
} from "./types";

export interface VercelBlobConfig {
  token: string;
  storeId?: string;
}

/**
 * Vercel Blob 适配器
 * 使用 Vercel Blob 的 REST API 直接操作
 * 这样无需引入 @vercel/blob 包，保持包体积最小
 */
export class VercelBlobAdapter implements StorageAdapter {
  readonly type = "vercel-blob" as const;
  private token: string;
  private siteUrl: string;

  constructor(config: VercelBlobConfig, siteUrl: string) {
    this.token = config.token;
    this.siteUrl = siteUrl.replace(/\/$/, "");
  }

  async put(
    key: string,
    data: ReadableStream | ArrayBuffer | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult> {
    // Vercel Blob PUT API
    const response = await fetch(
      `https://blob.vercel-storage.com/${key}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "x-api-version": "7",
          ...(options?.contentType
            ? { "x-content-type": options.contentType }
            : {}),
          "x-add-random-suffix": "0", // 不添加随机后缀，使用我们自己的 key
        },
        body: data instanceof Uint8Array ? (data.buffer as ArrayBuffer) : data as BodyInit,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vercel Blob upload failed: ${error}`);
    }

    const result = (await response.json()) as { url: string; size: number };

    return {
      key,
      size: result.size,
      url: result.url,
    };
  }

  private async listRaw(options?: ListOptions): Promise<{
    blobs: Array<{
      pathname: string;
      size: number;
      uploadedAt: string;
      url: string;
    }>;
    cursor?: string;
    hasMore: boolean;
  }> {
    const params = new URLSearchParams();
    if (options?.prefix) params.set("prefix", options.prefix);
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit) params.set("limit", String(options.limit));

    const response = await fetch(
      `https://blob.vercel-storage.com?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "x-api-version": "7",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Vercel Blob list failed: ${await response.text()}`);
    }

    return response.json();
  }

  private async resolvePublicUrl(key: string): Promise<string | null> {
    try {
      const listResult = await this.listRaw({ prefix: key, limit: 1 });
      const blob = listResult.blobs.find((b) => b.pathname === key);
      return blob ? blob.url : null;
    } catch (err) {
      console.error(`Failed to resolve public URL for key ${key}:`, err);
      return null;
    }
  }

  async get(key: string): Promise<GetResult | null> {
    const url = await this.resolvePublicUrl(key);
    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) return null;

    return {
      body: response.body!,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      size: parseInt(response.headers.get("content-length") ?? "0", 10),
    };
  }

  async delete(key: string): Promise<void> {
    const url = await this.resolvePublicUrl(key);
    if (!url) return; // 图片在 Vercel 端本身就不存在，直接跳过

    const response = await fetch(
      "https://blob.vercel-storage.com/delete",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "x-api-version": "7",
        },
        body: JSON.stringify({ urls: [url] }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vercel Blob delete failed: ${error}`);
    }
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const result = await this.listRaw(options);
    return {
      objects: result.blobs.map((blob) => ({
        key: blob.pathname,
        size: blob.size,
        lastModified: new Date(blob.uploadedAt),
      })),
      cursor: result.cursor,
      truncated: result.hasMore,
    };
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.list({ prefix: key, limit: 1 });
    return result.objects.some((obj) => obj.key === key);
  }

  getPublicUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.siteUrl}/i/${encodedKey}`;
  }
}
