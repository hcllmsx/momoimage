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

  // 获取全部文件夹和已启用存储列表
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

  const handleFolderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "__create_new__") {
      const name = prompt("请输入新文件夹的名称：");
      if (!name || !name.trim()) {
        setSelectedFolderId(""); // 重置为根目录
        return;
      }
      try {
        const newFolder = await api.createFolder(name.trim());
        setFolders((prev) => [...prev, newFolder]);
        setSelectedFolderId(newFolder.id);
        showToast(`文件夹 "${name.trim()}" 创建成功`, "success");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "创建失败", "error");
        setSelectedFolderId("");
      }
    } else {
      setSelectedFolderId(value);
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

      const items: UploadItem[] = imageFiles.map((file) => ({
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
          u.id === item.id ? { ...u, status: "uploading" } : u
        )
      );

      try {
        const result = await api.uploadImage(
          item.file,
          selectedStorageId || undefined,
          selectedFolderId || undefined,
          (percent) => {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === item.id ? { ...u, progress: percent } : u
              )
            );
          }
        );
        results.push(result);
        setUploads((prev) =>
          prev.map((u) =>
            u.id === item.id ? { ...u, status: "success", progress: 100, result } : u
          )
        );
      } catch (err) {
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
      onUploadSuccess(results);
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
            let bgStyle: React.CSSProperties = {};
            if (item.status === "uploading") {
              const pct = item.progress || 0;
              bgStyle = {
                background: `linear-gradient(to right, var(--color-primary-subtle) ${pct}%, var(--color-bg-surface) ${pct}%)`,
                transition: "background 0.08s ease, border-color var(--transition-fast)",
                borderColor: "var(--color-primary-hover)"
              };
            } else if (item.status === "success") {
              bgStyle = {
                background: `linear-gradient(to right, rgba(52, 211, 153, 0.08) 100%, var(--color-bg-surface) 0%)`,
                transition: "background var(--transition-normal), border-color var(--transition-normal)",
                borderColor: "rgba(52, 211, 153, 0.24)"
              };
            } else if (item.status === "error") {
              bgStyle = {
                background: `linear-gradient(to right, rgba(248, 113, 113, 0.08) 100%, var(--color-bg-surface) 0%)`,
                transition: "background var(--transition-normal), border-color var(--transition-normal)",
                borderColor: "rgba(248, 113, 113, 0.24)"
              };
            } else {
              bgStyle = {
                background: "var(--color-bg-surface)",
                transition: "background var(--transition-normal), border-color var(--transition-normal)",
                borderColor: "var(--color-border)"
              };
            }

            return (
              <div
                key={item.id}
                className="upload-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  ...bgStyle,
                }}
              >
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
                    {item.status === "uploading" && `上传中... ${item.progress || 0}%`}
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
    </div>
  );
}
