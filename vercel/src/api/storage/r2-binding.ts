// ============================================
// 默默图床 — R2 Binding 存储适配器 (编译兼容版)
// 用于 Cloudflare Workers 内直接通过 Binding 访问本账号 R2
// ============================================

import type {
  StorageAdapter,
  PutOptions,
  PutResult,
  GetResult,
  ListOptions,
  ListResult,
} from "./types";

export class R2BindingAdapter implements StorageAdapter {
  readonly type = "r2-binding" as const;
  private bucket: any;
  private publicUrlBase: string;

  constructor(bucket: any, publicUrlBase: string) {
    this.bucket = bucket;
    this.publicUrlBase = publicUrlBase.replace(/\/$/, "");
  }

  async put(
    key: string,
    data: ReadableStream | ArrayBuffer | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult> {
    const r2Object = await this.bucket.put(key, data, {
      httpMetadata: options?.contentType
        ? { contentType: options.contentType }
        : undefined,
      customMetadata: options?.metadata,
    });

    return {
      key,
      size: r2Object?.size ?? 0,
      url: this.getPublicUrl(key),
    };
  }

  async get(key: string): Promise<GetResult | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;

    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      size: object.size,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const listed = await this.bucket.list({
      prefix: options?.prefix,
      cursor: options?.cursor,
      limit: options?.limit ?? 100,
    });

    return {
      objects: listed.objects.map((obj: any) => ({
        key: obj.key,
        size: obj.size,
        lastModified: obj.uploaded,
      })),
      cursor: listed.truncated ? listed.cursor : undefined,
      truncated: listed.truncated,
    };
  }

  async exists(key: string): Promise<boolean> {
    const head = await this.bucket.head(key);
    return head !== null;
  }

  getPublicUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.publicUrlBase}/i/${encodedKey}`;
  }
}
