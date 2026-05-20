// ============================================
// 默默图床 — S3 兼容存储适配器
// 用于通过 S3 协议访问：外部 R2 账号 / AWS S3 / MinIO 等
// ============================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type {
  StorageAdapter,
  PutOptions,
  PutResult,
  GetResult,
  ListOptions,
  ListResult,
} from "./types";

export interface S3AdapterConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl?: string;
  forcePathStyle?: boolean;
}

export class S3Adapter implements StorageAdapter {
  readonly type = "s3" as const;
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;
  private siteUrl: string;

  constructor(config: S3AdapterConfig, siteUrl: string) {
    this.client = new S3Client({
      region: config.region || "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? true,
      // 禁用 S3 v3 默认自动在 PutObject 发送的现代校验算法（如 CRC32 等）
      // 解决甲骨文 OCI 对象存储等三方 S3 兼容服务在大文件上传时抛出“未提供完成身份验证所需信息”的兼容性问题
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    } as any); // 类型断言防止低版本 TS 报错
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl?.replace(/\/$/, "") || "";
    this.siteUrl = siteUrl.replace(/\/$/, "");
  }

  async put(
    key: string,
    data: ReadableStream | ArrayBuffer | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult> {
    // 将 ReadableStream 转为 Uint8Array
    let body: Uint8Array;
    if (data instanceof ReadableStream) {
      const reader = data.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      body = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    } else if (data instanceof ArrayBuffer) {
      body = new Uint8Array(data);
    } else {
      body = data;
    }

    const sanitizedMetadata = options?.metadata
      ? Object.fromEntries(
          Object.entries(options.metadata).map(([k, v]) => [k, encodeURIComponent(v)])
        )
      : undefined;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options?.contentType,
        Metadata: sanitizedMetadata,
      })
    );

    return {
      key,
      size: body.length,
      url: this.getPublicUrl(key),
    };
  }

  async get(key: string): Promise<GetResult | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!response.Body) return null;

      return {
        body: response.Body as unknown as ReadableStream,
        contentType: response.ContentType ?? "application/octet-stream",
        size: response.ContentLength ?? 0,
      };
    } catch (err: unknown) {
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "NoSuchKey") {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: options?.prefix,
        ContinuationToken: options?.cursor,
        MaxKeys: options?.limit ?? 100,
      })
    );

    return {
      objects: (response.Contents ?? []).map((obj) => ({
        key: obj.Key ?? "",
        size: obj.Size ?? 0,
        lastModified: obj.LastModified,
      })),
      cursor: response.NextContinuationToken,
      truncated: response.IsTruncated ?? false,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  getPublicUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    // 如果没有配置 publicUrl，通过本系统 API 代理访问
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.siteUrl}/i/${encodedKey}`;
  }
}
