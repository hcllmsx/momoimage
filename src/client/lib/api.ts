// ============================================
// 默默图床 — API 客户端
// ============================================

import type {
  ApiResponse,
  ImageMeta,
  PaginatedResult,
  UploadResult,
  StorageConfig,
  ApiToken,
  SystemInfo,
  Folder,
} from "@shared/types";

const API_BASE = "/api";

/** 获取存储的 JWT Token */
function getToken(): string | null {
  return localStorage.getItem("momoimage_token");
}

/** 保存 JWT Token */
export function setToken(token: string): void {
  localStorage.setItem("momoimage_token", token);
}

/** 清除 JWT Token */
export function clearToken(): void {
  localStorage.removeItem("momoimage_token");
}

/** 检查是否已登录 */
export function isLoggedIn(): boolean {
  return !!getToken();
}

/** 通用请求方法 */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // 如果不是 FormData，添加 JSON content-type
  if (!(options.body instanceof FormData) && options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = (await response.json()) as ApiResponse<T>;

  if (!response.ok && !data.success) {
    throw new Error(data.error || `请求失败 (${response.status})`);
  }

  return data;
}

// ========= 认证 API =========

export async function login(password: string): Promise<string> {
  const res = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  const token = res.data!.token;
  setToken(token);
  return token;
}

export async function createApiToken(
  name: string
): Promise<ApiToken> {
  const res = await request<ApiToken>("/auth/token", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return res.data!;
}

export async function listApiTokens(): Promise<ApiToken[]> {
  const res = await request<ApiToken[]>("/auth/tokens");
  return res.data!;
}

export async function deleteApiToken(id: string): Promise<void> {
  await request(`/auth/token/${id}`, { method: "DELETE" });
}

// ========= 图片 API =========

export async function uploadImage(
  file: File,
  storageId?: string,
  folderId?: string
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (folderId) {
    formData.append("folderId", folderId);
  }

  const params = new URLSearchParams();
  if (storageId) params.set("storage", storageId);
  if (folderId) params.set("folderId", folderId);
  const query = params.toString() ? `?${params.toString()}` : "";

  const res = await request<UploadResult>(`/upload${query}`, {
    method: "POST",
    body: formData,
  });
  return res.data!;
}

export async function getImages(
  page = 1,
  pageSize = 20,
  folderId?: string
): Promise<PaginatedResult<ImageMeta>> {
  const query = folderId ? `&folderId=${folderId}` : "";
  const res = await request<PaginatedResult<ImageMeta>>(
    `/images?page=${page}&pageSize=${pageSize}${query}`
  );
  return res.data!;
}

export async function deleteImage(id: string): Promise<void> {
  await request(`/images/${id}`, { method: "DELETE" });
}

// ========= 文件夹 API =========

export async function getFolders(): Promise<Folder[]> {
  const res = await request<Folder[]>("/folders");
  return res.data!;
}

export async function createFolder(name: string): Promise<Folder> {
  const res = await request<Folder>("/folders", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return res.data!;
}

export async function deleteFolder(id: string): Promise<void> {
  await request(`/folders/${id}`, { method: "DELETE" });
}

export async function moveImage(id: string, folderId?: string): Promise<ImageMeta> {
  const res = await request<ImageMeta>(`/images/${id}/move`, {
    method: "PUT",
    body: JSON.stringify({ folderId }),
  });
  return res.data!;
}

// ========= 存储 API =========

export async function getStorageConfigs(): Promise<StorageConfig[]> {
  const res = await request<StorageConfig[]>("/storage");
  return res.data!;
}

export async function addStorage(
  config: StorageConfig
): Promise<{ id: string }> {
  const res = await request<{ id: string }>("/storage", {
    method: "POST",
    body: JSON.stringify(config),
  });
  return res.data!;
}

export async function deleteStorage(id: string): Promise<void> {
  await request(`/storage/${id}`, { method: "DELETE" });
}

export async function testStorage(
  id: string
): Promise<{ connected: boolean; message: string }> {
  const res = await request<{ connected: boolean; message: string }>(
    `/storage/${id}/test`,
    { method: "POST" }
  );
  return res.data!;
}

// ========= 系统 API =========

export async function getSystemInfo(): Promise<SystemInfo> {
  const res = await request<SystemInfo>("/info");
  return res.data!;
}
