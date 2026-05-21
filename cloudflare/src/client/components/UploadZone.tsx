// ============================================
// 默默图床 — 上传区域组件
// ============================================

import { useState, useRef, useCallback, useEffect } from "react";
import type { UploadResult, Folder, StorageConfig as StorageConfigType } from "@shared/types";
import * as api from "../lib/api";
import { formatFileSize } from "../lib/utils";
import { useToastContext } from "../App";

interface UploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress?: number;
  result?: UploadResult;
  error?: string;
}

/**
 * 产生缩略图的辅助函数 (Canvas 硬件加速)
 * 仅对原图大小 > 800KB 或者 分辨率(单边长) > 1200px 的非 GIF / SVG 进行压制
 */
function generateThumbnailIfNeeded(file: File): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    // 过滤掉 GIF 和 SVG，保留其完美动效和矢量特征
    if (file.type === "image/gif" || file.type === "image/svg+xml") {
      return resolve(undefined);
    }

    // 排除非图片文件类型
    if (!file.type.startsWith("image/")) {
      return resolve(undefined);
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;

    img.onload = () => {
      URL.revokeObjectURL(url);

      const width = img.naturalWidth;
      const height = img.naturalHeight;

      // 双轨边界触发：大小 > 800KB 或单边长 > 1200px
      if (file.size > 800 * 1024 || width > 1200 || height > 1200) {
        const maxSide = 400;
        let targetWidth = width;
        let targetHeight = height;

        if (width > maxSide || height > maxSide) {
          if (width > height) {
            targetWidth = maxSide;
            targetHeight = Math.round((height * maxSide) / width);
          } else {
            targetHeight = maxSide;
            targetWidth = Math.round((width * maxSide) / height);
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(undefined);
        }

        // 启用高质量图像平滑以确保画面锐利清晰
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // 导出通用 JPEG 格式（0.7 质量），100% 浏览器兼容，体积约 15-25KB
        canvas.toBlob(
          (blob) => {
            resolve(blob || undefined);
          },
          "image/jpeg",
          0.7
        );
      } else {
        resolve(undefined);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
  });
}

export function UploadZone({
  onUploadSuccess,
}: {
  onUploadSuccess: (results: UploadResult[]) => void;
}) {
  const [dragover, setDragover] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToastContext();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [storages, setStorages] = useState<StorageConfigType[]>([]);
  const [selectedStorageId, setSelectedStorageId] = useState<string>("");

  // 新建分类文件夹弹窗状态
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // 获取全部文件夹 and 已启用存储列表
  useEffect(() => {
    api.getFolders().then(setFolders).catch(console.error);
    
    api.getStorageConfigs().then((configs) => {
      const enabledStorages = configs.filter((c) => c.enabled);
      setStorages(enabledStorages);
      
      const defaultStorage = enabledStorages.find((c) => c.isDefault);
      if (defaultStorage) {
        setSelectedStorageId(defaultStorage.id);
      } else if (enabledStorages.length > 0) {
        setSelectedStorageId(enabledStorages[0].id);
      }
    }).catch(console.error);
  }, []);

  const handleFolderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "__create_new__") {
      setNewFolderName("");
      setIsCreatingFolder(true);
    } else {
      setSelectedFolderId(value);
    }
  };

  const handleConfirmCreateFolder = async () => {
    if (!newFolderName || !newFolderName.trim()) return;
    try {
      const newFolder = await api.createFolder(newFolderName.trim());
      setFolders((prev) => [...prev, newFolder]);
      setSelectedFolderId(newFolder.id);
      setIsCreatingFolder(false);
      showToast(`文件夹 "${newFolderName.trim()}" 创建成功`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "创建失败", "error");
    }
  };

  const processFiles = useCallback(
    (files: File[]) => {
      if (isUploading) {
        showToast("正在上传中，请稍后再添加文件", "error");
        return;
      }

      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        showToast("请选择图片文件", "error");
        return;
      }

      const MAX_SIZE = 20 * 1024 * 1024; // 20MB
      const tooLargeFiles = imageFiles.filter((f) => f.size > MAX_SIZE);
      const validFiles = imageFiles.filter((f) => f.size <= MAX_SIZE);

      if (tooLargeFiles.length > 0) {
        showToast(
          tooLargeFiles.length === 1
            ? `图片 "${tooLargeFiles[0].name}" 超过 20MB 限制，已被跳过`
            : `有 ${tooLargeFiles.length} 张图片超过 20MB 限制，已被自动跳过`,
          "error"
        );
      }

      if (validFiles.length === 0) {
        return;
      }

      const items: UploadItem[] = validFiles.map((file) => ({
        id: Math.random().toString(36).slice(2),
        file,
        status: "pending" as const,
      }));

      setUploads((prev) => [...prev, ...items]);
    },
    [isUploading, showToast]
  );

  const startUpload = useCallback(async () => {
    const pendingItems = uploads.filter((u) => u.status === "pending");
    if (pendingItems.length === 0) {
      showToast("没有等待上传的图片", "error");
      return;
    }

    setIsUploading(true);
    const results: UploadResult[] = [];

    for (const item of pendingItems) {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === item.id ? { ...u, status: "uploading", progress: 0 } : u
        )
      );

      let simulatedProgress = 0;

      // 60ms 刷新率的极客拟合曲线定时器，确保视觉动效极致丝滑
      const progressTimer = setInterval(() => {
        if (simulatedProgress < 30) {
          // 起步爆发段：每次递增 5% 到 9%
          simulatedProgress += Math.floor(Math.random() * 5) + 5;
        } else if (simulatedProgress < 90) {
          // 中期稳步爬行段：每次递增 0.5% 到 1.5%
          simulatedProgress += Math.random() * 1.0 + 0.5;
        } else if (simulatedProgress < 99) {
          // 后期云端处理阻尼段：每次极缓爬升 0.05% 到 0.15%
          simulatedProgress += Math.random() * 0.1 + 0.05;
        }

        const displayProgress = Math.min(99, Math.round(simulatedProgress));

        setUploads((prev) =>
          prev.map((u) =>
            u.id === item.id ? { ...u, progress: displayProgress } : u
          )
        );
      }, 60);

      try {
        // 在前端利用 Canvas 硬件加速生成缩略图（若满足大图/高分辨率触发阈值）
        const thumbnailBlob = await generateThumbnailIfNeeded(item.file);

        const result = await api.uploadImage(
          item.file,
          selectedStorageId || undefined,
          selectedFolderId || undefined,
          undefined,
          thumbnailBlob
        );

        clearInterval(progressTimer);
        results.push(result);

        setUploads((prev) =>
          prev.map((u) =>
            u.id === item.id ? { ...u, status: "success", progress: 100, result } : u
          )
        );
      } catch (err) {
        clearInterval(progressTimer);
        const errorMsg = err instanceof Error ? err.message : "上传失败";
        setUploads((prev) =>
          prev.map((u) =>
            u.id === item.id ? { ...u, status: "error", error: errorMsg } : u
          )
        );
      }
    }

    setIsUploading(false);
    if (results.length > 0) {
      if (results.length === 1) {
        // 单张图片上传成功，特意延迟 250ms 弹出详情弹窗，留足时间给眼睛感受绿光充满的解压动效
        setTimeout(() => {
          onUploadSuccess(results);
        }, 250);
      } else {
        onUploadSuccess(results);
      }
    }
  }, [uploads, onUploadSuccess, showToast, selectedFolderId, selectedStorageId]);

  const handleRemoveItem = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragover(false);
      const files = Array.from(e.dataTransfer.files);
      processFiles(files);
    },
    [processFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      if (files.length > 0) {
        e.preventDefault();
        processFiles(files);
      }
    },
    [processFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      processFiles(files);
      e.target.value = ""; // 重置 input
    },
    [processFiles]
  );

  return (
    <div onPaste={handlePaste}>
      {/* 文件夹分类与存储后端选择区域 */}
      <div className="upload-options" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 16,
        background: "var(--color-bg-surface)",
        padding: "12px 16px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
        flexWrap: "wrap",
      }}>
        {/* 左侧：文件夹分类选择框 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>
            📂 上传至分类文件夹：
          </span>
          <select
            value={selectedFolderId}
            onChange={handleFolderChange}
            className="select"
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
              fontSize: 14,
              outline: "none",
              cursor: "pointer",
              minWidth: 160,
            }}
          >
            <option value="">根目录 (无分类)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
            <option value="__create_new__" style={{ color: "var(--color-primary)", fontWeight: "bold" }}>
              + 新建文件夹...
            </option>
          </select>
        </div>

        {/* 右侧：存储后端选择框 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>
            💾 存储至后端：
          </span>
          <select
            value={selectedStorageId}
            onChange={(e) => setSelectedStorageId(e.target.value)}
            className="select"
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
              fontSize: 14,
              outline: "none",
              cursor: "pointer",
              minWidth: 180,
            }}
          >
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.isDefault ? " (默认)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className={`upload-zone ${dragover ? "upload-zone--dragover" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragover(true);
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
      >
        <div className="upload-zone__icon">📷</div>
        <div className="upload-zone__title">
          拖拽图片到这里，或点击选择文件
        </div>
        <div className="upload-zone__desc">
          也可以直接粘贴剪贴板中的图片 · 支持 JPEG / PNG / GIF / WebP / SVG / AVIF · 最大 20MB
        </div>
        <input
          ref={inputRef}
          className="upload-zone__input"
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
        />
      </div>

      {/* 上传进度列表 */}
      {uploads.length > 0 && (
        <div className="upload-progress">
          {uploads.slice(0, 10).map((item) => {
            let borderStyle: React.CSSProperties = {};
            if (item.status === "uploading") {
              borderStyle = {
                borderColor: "var(--color-primary-hover)",
                transition: "border-color var(--transition-fast)"
              };
            } else if (item.status === "success") {
              borderStyle = {
                borderColor: "rgba(52, 211, 153, 0.24)",
                transition: "border-color var(--transition-normal)"
              };
            } else if (item.status === "error") {
              borderStyle = {
                borderColor: "rgba(248, 113, 113, 0.24)",
                transition: "border-color var(--transition-normal)"
              };
            } else {
              borderStyle = {
                borderColor: "var(--color-border)",
                transition: "border-color var(--transition-normal)"
              };
            }

            return (
              <div
                key={item.id}
                className="upload-item"
                style={borderStyle}
              >
                {/* 绝对定位的平滑硬件加速进度背景层 */}
                <div
                  className={`upload-item__progress ${
                    item.status === "success"
                      ? "upload-item__progress--success"
                      : item.status === "error"
                      ? "upload-item__progress--error"
                      : ""
                  }`}
                  style={{
                    width: `${
                      item.status === "pending"
                        ? 0
                        : item.status === "success" || item.status === "error"
                        ? 100
                        : item.progress || 0
                    }%`
                  }}
                />

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="upload-item__name">
                    {item.file.name}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                    {formatFileSize(item.file.size)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    className={`upload-item__status ${
                      item.status === "success"
                        ? "upload-item__status--success"
                        : item.status === "error"
                        ? "upload-item__status--error"
                        : ""
                    }`}
                  >
                    {item.status === "pending" && "等待中"}
                    {item.status === "uploading" && (
                      item.progress && item.progress >= 90
                        ? `处理中... ${item.progress}%`
                        : `上传中... ${item.progress || 0}%`
                    )}
                    {item.status === "success" && "✓ 完成"}
                    {item.status === "error" && `✗ ${item.error}`}
                  </span>
                  {item.status === "pending" && !isUploading && (
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ padding: "2px 6px", minWidth: "auto", border: "none", marginLeft: 4 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveItem(item.id);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            {uploads.some((u) => u.status === "pending") && (
              <button
                className="btn btn--primary"
                onClick={startUpload}
                disabled={isUploading}
              >
                {isUploading ? "正在上传..." : "开始上传"}
              </button>
            )}
            <button
              className="btn btn--ghost"
              onClick={() => setUploads([])}
              disabled={isUploading}
            >
              清除全部
            </button>
          </div>
        </div>
      )}

      {/* 新建分类文件夹弹窗 */}
      {isCreatingFolder && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1001,
          backdropFilter: "blur(4px)",
        }} onClick={() => setIsCreatingFolder(false)}>
          <div className="card" style={{
            width: "100%",
            maxWidth: 360,
            padding: 24,
            background: "var(--color-bg-surface)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span>📁</span> 新建分类文件夹
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="text"
                className="input"
                placeholder="请输入分类名称"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmCreateFolder();
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-input)",
                  color: "var(--color-text)",
                  width: "100%",
                  outline: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setIsCreatingFolder(false)}
                style={{ padding: "6px 16px" }}
              >
                取消
              </button>
              <button
                className="btn btn--primary btn--sm"
                onClick={handleConfirmCreateFolder}
                disabled={!newFolderName || !newFolderName.trim()}
                style={{ padding: "6px 16px" }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
