// ============================================
// 默默图床 — 存储适配器接口定义
// ============================================

import type { StorageType } from "@shared/types";

/** 上传选项 */
export interface PutOptions {
  /** 内容类型 */
  contentType?: string;
  /** 自定义元数据 */
  metadata?: Record<string, string>;
}

/** 上传结果 */
export interface PutResult {
  key: string;
  size: number;
  url: string;
}

/** 获取结果 */
export interface GetResult {
  body: ReadableStream;
  contentType: string;
  size: number;
}

/** 列表选项 */
export interface ListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
}

/** 列表中的对象 */
export interface ListObject {
  key: string;
  size: number;
  lastModified?: Date;
}

/** 列表结果 */
export interface ListResult {
  objects: ListObject[];
  cursor?: string;
  truncated: boolean;
}

/**
 * 存储适配器统一接口
 * 所有存储后端（R2 Binding / S3 / Vercel Blob）都必须实现此接口
 */
export interface StorageAdapter {
  /** 适配器类型标识 */
  readonly type: StorageType;

  /** 上传文件 */
  put(
    key: string,
    data: ReadableStream | ArrayBuffer | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult>;

  /** 获取文件 */
  get(key: string): Promise<GetResult | null>;

  /** 删除文件 */
  delete(key: string): Promise<void>;

  /** 列出文件 */
  list(options?: ListOptions): Promise<ListResult>;

  /** 检查文件是否存在 */
  exists(key: string): Promise<boolean>;

  /** 获取公开访问 URL */
  getPublicUrl(key: string): string;
}
