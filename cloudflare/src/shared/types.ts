// ============================================
// 默默图床 — 前后端共享类型定义
// ============================================

/** 图片元数据 */
export interface ImageMeta {
  /** 唯一 ID */
  id: string;
  /** 存储 key（在存储桶中的路径） */
  key: string;
  /** 原始文件名 */
  originalName: string;
  /** MIME 类型 */
  mimeType: string;
  /** 文件大小（字节） */
  size: number;
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
  /** 上传时间（ISO 字符串） */
  uploadedAt: string;
  /** 使用的存储后端 ID */
  storageId: string;
  /** 公开访问 URL */
  url: string;
  /** 缩略图公开访问 URL */
  thumbnailUrl?: string;
  /** 缩略图文件大小（字节） */
  thumbnailSize?: number;
  /** 所属文件夹 ID */
  folderId?: string;
}

/** 文件夹定义 */
export interface Folder {
  id: string;
  name: string;
  createdAt: string;
}

/** 存储后端类型 */
export type StorageType = "r2-binding" | "s3" | "vercel-blob" | "oracle";

/** 存储后端配置 */
export interface StorageConfig {
  /** 唯一 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 存储类型 */
  type: StorageType;
  /** 是否为默认存储 */
  isDefault: boolean;
  /** 是否启用 */
  enabled: boolean;
  /** S3 兼容配置（type 为 s3 时使用） */
  s3Config?: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicUrl?: string;
  };
  /** Vercel Blob 配置（type 为 vercel-blob 时使用） */
  vercelBlobConfig?: {
    token: string;
    storeId?: string;
  };
  /** 甲骨文云 OCI 配置（type 为 oracle 时使用） */
  oracleConfig?: {
    namespace: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicUrl?: string;
  };
  /** 已用容量大小（字节，后端计算返回） */
  usedSize?: number;
  /** 已存文件数量（后端计算返回） */
  fileCount?: number;
  /** 空间限额预警数值 */
  warningThresholdValue?: number;
  /** 空间限额预警单位 */
  warningThresholdUnit?: "MB" | "GB";
  /** 存储标签颜色（十六进制，如 #3B82F6） */
  color?: string;
}

/** API Token */
export interface ApiToken {
  /** Token ID */
  id: string;
  /** Token 名称/备注 */
  name: string;
  /** Token 值（只在创建时返回完整值） */
  token: string;
  /** 创建时间 */
  createdAt: string;
  /** 最后使用时间 */
  lastUsedAt?: string;
}

/** API 响应包装 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** 分页参数 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 上传结果 */
export interface UploadResult {
  id: string;
  url: string;
  thumbnailUrl?: string;
  originalName: string;
  size: number;
  mimeType: string;
  /** 各种格式的链接 */
  links: {
    url: string;
    markdown: string;
    html: string;
    bbcode: string;
  };
}

/** 系统信息 */
export interface SystemInfo {
  /** 站点 URL */
  siteUrl: string;
  /** 是否已配置自定义域名 */
  hasCustomDomain: boolean;
  /** 部署平台 */
  deployTarget: string;
  /** 版本 */
  version: string;
  /** 是否使用的是默认登录密码 */
  isDefaultPassword?: boolean;
  /** 数据库是否配置且可用 */
  isKvValid?: boolean;
  /** 内置本地存储是否配置且可用 */
  isStorageValid?: boolean;
}
