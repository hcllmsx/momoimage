// ============================================
// 默默图床 — 存储管理器
// 统一管理多个存储后端，提供存储后端的增删改查
// ============================================

import type { StorageConfig, StorageType } from "@shared/types";
import type { StorageAdapter } from "./types";
import { R2BindingAdapter } from "./r2-binding";
// S3Adapter 和 VercelBlobAdapter 使用动态导入，避免 @aws-sdk/client-s3 在启动时就加载
import type { S3Adapter } from "./s3";
import type { VercelBlobAdapter } from "./vercel-blob";

/** KV 中存储配置列表的 key */
const STORAGE_CONFIG_KEY = "momoimage:storage:configs";

/**
 * 存储管理器
 * 负责管理多个存储后端实例，支持动态添加/删除
 */
export class StorageManager {
  private adapters: Map<string, StorageAdapter> = new Map();
  private configs: StorageConfig[] = [];
  private kv: KVNamespace | null;
  private siteUrl: string;
  private r2Bucket: R2Bucket | null;

  constructor(options: {
    kv: KVNamespace | null;
    siteUrl: string;
    r2Bucket?: R2Bucket | null;
  }) {
    this.kv = options.kv;
    this.siteUrl = options.siteUrl;
    this.r2Bucket = options.r2Bucket ?? null;
  }

  /** 初始化：加载已保存的存储配置并创建适配器实例 */
  async initialize(): Promise<void> {
    let hasDefaultExternal = false;
    let savedConfigs: StorageConfig[] = [];

    // 1. 先从 KV 读取外部配置以确定是否有默认配置
    if (this.kv) {
      const data = await this.kv.get(STORAGE_CONFIG_KEY, "json");
      if (data && Array.isArray(data)) {
        savedConfigs = data as StorageConfig[];
        hasDefaultExternal = savedConfigs.some((c) => c.isDefault && c.enabled);
      }
    }

    // 2. 如果有 R2 Binding，自动注册本账号 R2
    if (this.r2Bucket) {
      const savedLocalR2 = savedConfigs.find((c) => c.id === "local-r2");
      const localR2Config: StorageConfig = {
        id: "local-r2",
        name: "本地 R2 存储",
        type: "r2-binding",
        isDefault: savedLocalR2 ? savedLocalR2.isDefault : !hasDefaultExternal, // 如果外部已经有默认存储，则本地存储不作为默认
        enabled: savedLocalR2 ? savedLocalR2.enabled : true,
        warningThresholdValue: savedLocalR2?.warningThresholdValue,
        warningThresholdUnit: savedLocalR2?.warningThresholdUnit,
        color: savedLocalR2?.color,
      };
      this.configs.push(localR2Config);
      this.adapters.set(
        "local-r2",
        new R2BindingAdapter(this.r2Bucket, this.siteUrl)
      );
    }

    // 3. 加载外部存储适配器并保存到 configs
    for (const config of savedConfigs) {
      if (config.id === "local-r2") continue;
      try {
        await this.createAdapter(config);
        this.configs.push(config);
      } catch (err) {
        console.error(`Failed to create adapter for ${config.name}:`, err);
      }
    }

    // 4. 如果没有任何存储后端，且没有 R2 Binding，则无默认存储
    if (this.configs.length === 0) {
      console.warn("No storage backends configured");
    }
  }

  /** 获取默认存储适配器 */
  getDefault(): StorageAdapter | null {
    const defaultConfig = this.configs.find((c) => c.isDefault && c.enabled);
    if (defaultConfig) {
      return this.adapters.get(defaultConfig.id) ?? null;
    }
    // 如果没有标记为默认的，返回第一个启用的
    const first = this.configs.find((c) => c.enabled);
    return first ? (this.adapters.get(first.id) ?? null) : null;
  }

  /** 根据 ID 获取存储适配器 */
  getAdapter(id: string): StorageAdapter | null {
    return this.adapters.get(id) ?? null;
  }

  /** 获取所有存储配置 */
  getConfigs(): StorageConfig[] {
    // 返回脱敏后的配置（隐藏密钥）
    return this.configs.map((c) => this.sanitizeConfig(c));
  }

  /** 添加存储后端 */
  async addStorage(config: StorageConfig): Promise<void> {
    // 检查 ID 是否重复
    if (this.adapters.has(config.id)) {
      throw new Error(`Storage with id "${config.id}" already exists`);
    }

    // 如果设为默认，取消其他默认
    if (config.isDefault) {
      this.configs.forEach((c) => (c.isDefault = false));
    }

    await this.createAdapter(config);
    this.configs.push(config);
    await this.saveConfigs();
  }

  /** 更新存储后端配置 */
  async updateStorage(
    id: string,
    updates: Partial<StorageConfig>
  ): Promise<void> {
    const index = this.configs.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`Storage with id "${id}" not found`);
    }

    // 如果客户端上传了 ***hidden*** 掩码，则还原为实际密钥
    if (updates.s3Config && updates.s3Config.secretAccessKey === "***hidden***") {
      const oldSecret = this.configs[index].s3Config?.secretAccessKey;
      if (oldSecret) {
        updates.s3Config.secretAccessKey = oldSecret;
      }
    }
    if (updates.vercelBlobConfig && updates.vercelBlobConfig.token === "***hidden***") {
      const oldToken = this.configs[index].vercelBlobConfig?.token;
      if (oldToken) {
        updates.vercelBlobConfig.token = oldToken;
      }
    }
    if (updates.oracleConfig && updates.oracleConfig.secretAccessKey === "***hidden***") {
      const oldSecret = this.configs[index].oracleConfig?.secretAccessKey;
      if (oldSecret) {
        updates.oracleConfig.secretAccessKey = oldSecret;
      }
    }

    // 不允许修改 local-r2 的类型
    if (id === "local-r2" && updates.type && updates.type !== "r2-binding") {
      throw new Error("Cannot change type of local R2 storage");
    }

    const config = { ...this.configs[index], ...updates, id };

    // 如果设为默认，取消其他默认
    if (config.isDefault) {
      this.configs.forEach((c) => (c.isDefault = false));
    }

    // 重建适配器
    if (id !== "local-r2") {
      this.adapters.delete(id);
      await this.createAdapter(config);
    }

    this.configs[index] = config;
    await this.saveConfigs();
  }

  /** 删除存储后端 */
  async removeStorage(id: string): Promise<void> {
    if (id === "local-r2") {
      throw new Error("Cannot remove local R2 storage");
    }

    this.adapters.delete(id);
    this.configs = this.configs.filter((c) => c.id !== id);
    await this.saveConfigs();
  }

  /** 测试存储后端连接 */
  async testStorage(id: string): Promise<{ connected: boolean; message: string }> {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      return { connected: false, message: `未找到存储 ID 为 "${id}" 的适配器` };
    }

    try {
      // 尝试列出文件来测试连接
      await adapter.list({ limit: 1 });
      return { connected: true, message: "连接成功" };
    } catch (err) {
      console.error(`Failed to test connection for storage "${id}":`, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      return { connected: false, message: errMsg };
    }
  }

  /** 创建适配器实例（使用动态导入） */
  private async createAdapter(config: StorageConfig): Promise<void> {
    let adapter: StorageAdapter;

    switch (config.type) {
      case "r2-binding":
        // R2 Binding 只能在初始化时通过环境绑定创建
        return;

      case "s3": {
        if (!config.s3Config) {
          throw new Error("S3 config is required for S3 storage type");
        }
        const { S3Adapter } = await import("./s3");
        adapter = new S3Adapter(config.s3Config, this.siteUrl);
        break;
      }

      case "vercel-blob": {
        if (!config.vercelBlobConfig) {
          throw new Error(
            "Vercel Blob config is required for Vercel Blob storage type"
          );
        }
        const { VercelBlobAdapter } = await import("./vercel-blob");
        adapter = new VercelBlobAdapter(config.vercelBlobConfig, this.siteUrl);
        break;
      }

      case "oracle": {
        if (!config.oracleConfig) {
          throw new Error("Oracle config is required for Oracle storage type");
        }
        const oci = config.oracleConfig;
        // 根据名称空间与租户区域，自动拼接生成甲骨文云专属的 S3 兼容 Endpoint 服务终点
        const endpoint = `https://${oci.namespace}.compat.objectstorage.${oci.region}.oraclecloud.com`;
        const { S3Adapter } = await import("./s3");
        adapter = new S3Adapter(
          {
            endpoint,
            region: oci.region,
            accessKeyId: oci.accessKeyId,
            secretAccessKey: oci.secretAccessKey,
            bucket: oci.bucket,
            publicUrl: oci.publicUrl,
          },
          this.siteUrl
        );
        break;
      }

      default:
        throw new Error(`Unknown storage type: ${config.type}`);
    }

    this.adapters.set(config.id, adapter);
  }

  /** 保存配置到 KV */
  private async saveConfigs(): Promise<void> {
    if (!this.kv) return;
    await this.kv.put(STORAGE_CONFIG_KEY, JSON.stringify(this.configs));
  }

  /** 脱敏配置：隐藏密钥 */
  private sanitizeConfig(config: StorageConfig): StorageConfig {
    const sanitized = { ...config };
    if (sanitized.s3Config) {
      sanitized.s3Config = {
        ...sanitized.s3Config,
        secretAccessKey: "***hidden***",
      };
    }
    if (sanitized.vercelBlobConfig) {
      sanitized.vercelBlobConfig = {
        ...sanitized.vercelBlobConfig,
        token: "***hidden***",
      };
    }
    if (sanitized.oracleConfig) {
      sanitized.oracleConfig = {
        ...sanitized.oracleConfig,
        secretAccessKey: "***hidden***",
      };
    }
    return sanitized;
  }
}
