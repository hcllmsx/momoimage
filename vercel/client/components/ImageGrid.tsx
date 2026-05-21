// ============================================
// 默默图床 — 图片网格组件 (包含虚拟文件夹分类功能)
// ============================================

import { useState } from "react";
import type { ImageMeta, Folder } from "@shared/types";
import { formatFileSize, formatDate, copyToClipboard } from "../lib/utils";
import { useToastContext } from "../App";

export function ImageGrid({
  images,
  loading,
  hasMore,
  onLoadMore,
  onDelete,
  onDeleteMultiple,
  onCopyLink,
  folders,
  currentFolderId,
  onFolderChange,
  onCreateFolder,
  onDeleteFolder,
  onMoveImage,
  onMoveMultiple,
}: {
  images: ImageMeta[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
  onDeleteMultiple: (ids: string[]) => Promise<void>;
  onCopyLink: (image: ImageMeta) => void;
  folders: Folder[];
  currentFolderId: string | null;
  onFolderChange: (id: string | null) => void;
  onCreateFolder: (name: string) => Promise<Folder>;
  onDeleteFolder: (id: string) => Promise<void>;
  onMoveImage: (id: string, folderId: string | null) => Promise<void>;
  onMoveMultiple: (ids: string[], folderId: string | null) => Promise<void>;
}) {
  const { showToast } = useToastContext();
  const [movingImageId, setMovingImageId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<ImageMeta | null>(null);

  // 弹窗状态
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // 新增：解散分类与单张删除弹窗状态
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [deletingImage, setDeletingImage] = useState<ImageMeta | null>(null);

  // 新增：移动弹窗中的就地新建分类状态
  const [isCreatingInMove, setIsCreatingInMove] = useState(false);
  const [newFolderInMoveName, setNewFolderInMoveName] = useState("");

  // 批量操作相关的状态
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchMoving, setIsBatchMoving] = useState(false);
  const [isBatchOperating, setIsBatchOperating] = useState(false);

  const currentFolder = folders.find((f) => f.id === currentFolderId);

  const handleQuickCopy = async (image: ImageMeta) => {
    const ok = await copyToClipboard(image.url);
    showToast(ok ? "链接已复制" : "复制失败", ok ? "success" : "error");
  };

  const handleCreateFolderClick = () => {
    setNewFolderName("");
    setIsCreatingFolder(true);
  };

  const handleConfirmCreateFolder = async () => {
    if (!newFolderName || !newFolderName.trim()) return;
    try {
      await onCreateFolder(newFolderName.trim());
      setIsCreatingFolder(false);
      showToast(`分类文件夹 "${newFolderName.trim()}" 创建成功`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "创建失败", "error");
    }
  };

  const handleDeleteCurrentFolder = () => {
    setIsDeletingFolder(true);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!currentFolderId) return;
    setIsDeletingFolder(false);
    try {
      await onDeleteFolder(currentFolderId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "解散失败", "error");
    }
  };

  const handleConfirmSingleDelete = async () => {
    if (!deletingImage) return;
    const targetId = deletingImage.id;
    setDeletingImage(null);
    try {
      await onDelete(targetId);
      showToast("图片已成功删除", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败", "error");
    }
  };

  const handleCreateFolderInMove = async (isBatch: boolean) => {
    if (!newFolderInMoveName || !newFolderInMoveName.trim()) return;
    try {
      const folder = await onCreateFolder(newFolderInMoveName.trim());
      setIsCreatingInMove(false);
      setNewFolderInMoveName("");
      if (isBatch) {
        await handleConfirmBatchMove(folder.id);
      } else {
        await handleConfirmMove(folder.id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "创建分类失败", "error");
    }
  };

  const handleMoveClick = (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    setMovingImageId(imageId);
  };

  const handleConfirmMove = async (folderId: string | null) => {
    if (!movingImageId) return;
    try {
      await onMoveImage(movingImageId, folderId);
      setMovingImageId(null);
      showToast("图片分类转移成功", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "转移失败", "error");
    }
  };

  // 批量操作处理器
  const handleToggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const visibleImageIds = images.map((img) => img.id);
  const isAllSelected = visibleImageIds.length > 0 && visibleImageIds.every((id) => selectedIds.includes(id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleImageIds.includes(id)));
    } else {
      setSelectedIds((prev) => {
        const newSelection = [...prev];
        visibleImageIds.forEach((id) => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  const handleCancelMultiSelect = () => {
    setIsMultiSelectMode(false);
    setSelectedIds([]);
  };

  const handleBatchCopyLinks = async () => {
    const selectedImages = images.filter((img) => selectedIds.includes(img.id));
    if (selectedImages.length === 0) return;
    const urls = selectedImages.map((img) => img.url).join("\n");
    const ok = await copyToClipboard(urls);
    showToast(ok ? `已成功复制 ${selectedImages.length} 张图片的直链` : "复制失败", ok ? "success" : "error");
  };

  const handleBatchDeleteClick = () => {
    if (selectedIds.length === 0) return;
    setIsBatchDeleting(true);
  };

  const handleConfirmBatchDelete = async () => {
    try {
      setIsBatchDeleting(false);
      setIsBatchOperating(true);
      await onDeleteMultiple(selectedIds);
      setSelectedIds([]);
      setIsMultiSelectMode(false);
      showToast("所选图片已成功批量删除", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "批量删除失败", "error");
    } finally {
      setIsBatchOperating(false);
    }
  };

  const handleConfirmBatchMove = async (folderId: string | null) => {
    if (selectedIds.length === 0) return;
    setIsBatchMoving(false); // 立即关闭移动分类弹窗，让加载动画无遮挡展示
    try {
      setIsBatchOperating(true);
      await onMoveMultiple(selectedIds, folderId);
      setSelectedIds([]);
      setIsMultiSelectMode(false);
      showToast("所选图片已成功批量移动分类", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "批量分类失败", "error");
    } finally {
      setIsBatchOperating(false);
    }
  };

  return (
    <div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      {/* 文件夹头部与面包屑导航 */}
      <div className="folder-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 500 }}>
          <span
            style={{ cursor: "pointer", color: currentFolderId ? "var(--color-primary)" : "var(--color-text)" }}
            onClick={() => onFolderChange(null)}
          >
            📁 图库首页
          </span>
          {currentFolder && (
            <>
              <span style={{ color: "var(--color-text-tertiary)" }}>/</span>
              <span style={{ color: "var(--color-text)" }}>{currentFolder.name}</span>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* 正常文件夹操作 */}
          {!isMultiSelectMode && (
            <>
              {currentFolderId ? (
                <>
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={handleDeleteCurrentFolder}
                  >
                    🗑️ 解散该分类
                  </button>
                </>
              ) : (
                <button
                  className="btn btn--primary btn--sm"
                  onClick={handleCreateFolderClick}
                >
                  ➕ 新建分类文件夹
                </button>
              )}
            </>
          )}

          {/* 批量操作控制按钮 */}
          {images.length > 0 && (
            <>
              {isMultiSelectMode ? (
                <>
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ border: "1px solid var(--color-border)" }}
                    onClick={handleToggleSelectAll}
                  >
                    {isAllSelected ? "☑️ 取消全选" : "🔲 全选"}
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-warning)" }}
                    onClick={handleCancelMultiSelect}
                  >
                    ✕ 退出批量
                  </button>
                </>
              ) : (
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ border: "1px solid var(--color-border)" }}
                  onClick={() => setIsMultiSelectMode(true)}
                >
                  🛠️ 批量管理
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 根目录下的文件夹网格 */}
      {!currentFolderId && folders.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            分类文件夹 ({folders.length})
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
          }}>
            {folders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => onFolderChange(folder.id)}
                className="folder-card"
              >
                <span style={{ fontSize: 24 }}>📁</span>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>
                    {folder.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                    {formatDate(folder.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 图片头部标题 */}
      {images.length > 0 && (
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          图片列表 ({images.length})
        </h3>
      )}

      {images.length === 0 && !loading ? (
        <div className="empty-state" style={{ padding: "48px 0" }}>
          <div className="empty-state__icon">🖼️</div>
          <div className="empty-state__title">该目录下还没有图片</div>
          <p style={{ color: "var(--color-text-tertiary)", fontSize: 13, marginTop: 8 }}>
            上传图片时选择此分类，或在图库中将图片移动进来。
          </p>
        </div>
      ) : (
        <div className="image-grid">
          {images.map((image) => (
            <div
              key={image.id}
              className={`image-card ${selectedIds.includes(image.id) ? "image-card--selected" : ""}`}
              onClick={() => {
                if (isMultiSelectMode) {
                  handleToggleSelect(image.id);
                }
              }}
              style={{
                cursor: isMultiSelectMode ? "pointer" : "default",
                position: "relative",
                border: selectedIds.includes(image.id) ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                transform: selectedIds.includes(image.id) ? "scale(0.98)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              {/* 多选选择状态角标 */}
              {isMultiSelectMode && (
                <div
                  onClick={(e) => handleToggleSelect(image.id, e)}
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: selectedIds.includes(image.id) ? "none" : "2px solid rgba(255, 255, 255, 0.7)",
                    background: selectedIds.includes(image.id) ? "var(--color-primary)" : "rgba(0, 0, 0, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: "bold",
                    zIndex: 10,
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  {selectedIds.includes(image.id) ? "✓" : ""}
                </div>
              )}

              <div
                className="image-card__preview"
                style={{ position: "relative", cursor: "pointer" }}
                onClick={(e) => {
                  if (!isMultiSelectMode) {
                    e.stopPropagation();
                    onCopyLink(image);
                  }
                }}
              >
                <img
                  src={image.thumbnailUrl || image.url}
                  alt={image.originalName}
                  loading="lazy"
                />
                {/* 仅在非多选模式下显示悬浮动作栏 */}
                {!isMultiSelectMode && (
                  <div className="image-card__overlay">
                    <div className="image-card__actions" style={{ gap: 6 }}>
                      <button
                        className="btn btn--ghost btn--sm"
                        title="图片细节"
                        style={{ minWidth: 32, padding: 0 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImage(image);
                        }}
                      >
                        📋
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={(e) => handleMoveClick(e, image.id)}
                        title="移动至文件夹分类"
                        style={{ minWidth: 32, padding: 0 }}
                      >
                        📁
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickCopy(image);
                        }}
                        title="快速复制 URL"
                        style={{ minWidth: 32, padding: 0 }}
                      >
                        🔗
                      </button>
                      <button
                        className="btn btn--ghost btn--sm btn--delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingImage(image);
                        }}
                        style={{ minWidth: 32, padding: 0 }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="image-card__info">
                <div className="image-card__name" title={image.originalName}>
                  {image.originalName}
                </div>
                <div className="image-card__meta">
                  {formatFileSize(image.size)} · {formatDate(image.uploadedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 加载更多 */}
      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button
            className="btn btn--ghost"
            onClick={onLoadMore}
            disabled={loading}
          >
            {loading ? "加载中..." : "加载更多"}
          </button>
        </div>
      )}

      {/* 移动单张文件弹窗 */}
      {movingImageId && (
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
          zIndex: 1000,
          backdropFilter: "blur(4px)",
        }} onClick={() => { setMovingImageId(null); setIsCreatingInMove(false); setNewFolderInMoveName(""); }}>
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
              <span>📂</span> 移动图片到分类
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto", paddingRight: 4 }}>
              <button
                className="btn btn--ghost"
                style={{
                  textAlign: "left",
                  justifyContent: "flex-start",
                  padding: "10px 14px",
                  border: "1px solid var(--color-border)",
                  fontWeight: !images.find(img => img.id === movingImageId)?.folderId ? "bold" : "normal",
                  background: !images.find(img => img.id === movingImageId)?.folderId ? "rgba(var(--color-primary-rgb), 0.1)" : "transparent",
                }}
                onClick={() => handleConfirmMove(null)}
              >
                根目录 (无分类)
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  className="btn btn--ghost"
                  style={{
                    textAlign: "left",
                    justifyContent: "flex-start",
                    padding: "10px 14px",
                    border: "1px solid var(--color-border)",
                    fontWeight: images.find(img => img.id === movingImageId)?.folderId === f.id ? "bold" : "normal",
                    background: images.find(img => img.id === movingImageId)?.folderId === f.id ? "rgba(var(--color-primary-rgb), 0.1)" : "transparent",
                  }}
                  onClick={() => handleConfirmMove(f.id)}
                >
                  📁 {f.name}
                </button>
              ))}

              {!isCreatingInMove ? (
                <button
                  className="btn btn--ghost"
                  style={{
                    textAlign: "left",
                    justifyContent: "flex-start",
                    padding: "10px 14px",
                    border: "1px dashed var(--color-primary)",
                    color: "var(--color-primary)",
                    marginTop: 4,
                  }}
                  onClick={() => setIsCreatingInMove(true)}
                >
                  ➕ 新建分类...
                </button>
              ) : (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "8px 12px",
                  border: "1px dashed var(--color-primary)",
                  borderRadius: "var(--radius-sm)",
                  marginTop: 4,
                }}>
                  <input
                    type="text"
                    placeholder="请输入新分类名称"
                    value={newFolderInMoveName}
                    onChange={(e) => setNewFolderInMoveName(e.target.value)}
                    autoFocus
                    style={{
                      padding: "6px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-bg-input)",
                      color: "var(--color-text)",
                      width: "100%",
                      outline: "none",
                      fontSize: 13,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateFolderInMove(false);
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ padding: "2px 8px", fontSize: 12, height: "auto" }}
                      onClick={() => {
                        setIsCreatingInMove(false);
                        setNewFolderInMoveName("");
                      }}
                    >
                      取消
                    </button>
                    <button
                      className="btn btn--primary btn--sm"
                      style={{ padding: "2px 8px", fontSize: 12, height: "auto" }}
                      onClick={() => handleCreateFolderInMove(false)}
                      disabled={!newFolderInMoveName || !newFolderInMoveName.trim()}
                    >
                      创建并移动
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => { setMovingImageId(null); setIsCreatingInMove(false); setNewFolderInMoveName(""); }}
                style={{ padding: "6px 16px" }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底部悬浮批量操作栏 */}
      {isMultiSelectMode && selectedIds.length > 0 && (
        <div style={{
          position: "fixed",
          bottom: 80, // 整体上移，确保高于页脚文字
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          zIndex: 2000,
          pointerEvents: "none", // 允许鼠标事件穿透非交互区域
        }}>
          {/* 批量操作加载动画，显示在操作栏正上方 */}
          {isBatchOperating && (
            <div style={{
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
              backdropFilter: "blur(12px)",
              animation: "fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              pointerEvents: "auto",
            }}>
              <span className="spinner" style={{
                width: 14,
                height: 14,
                border: "2px solid var(--color-border)",
                borderTopColor: "var(--color-primary)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>
                正在处理中，请稍候...
              </span>
            </div>
          )}

          {/* 批量操作按钮栏 */}
          <div style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
            backdropFilter: "blur(12px)",
            animation: "barSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            opacity: isBatchOperating ? 0.6 : 1,
            pointerEvents: isBatchOperating ? "none" : "auto", // 正在处理时禁用全部按钮交互
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
              已选择 {selectedIds.length} 张图片
            </span>
            <div style={{ width: 1, height: 20, background: "var(--color-border)" }} />
            
            <button
              className="btn btn--primary btn--sm"
              onClick={handleBatchCopyLinks}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              🔗 批量复制链接
            </button>
            
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setIsBatchMoving(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--color-border)" }}
            >
              📁 批量分类
            </button>
            
            <button
              className="btn btn--danger btn--sm"
              onClick={handleBatchDeleteClick}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              🗑️ 批量删除
            </button>
          </div>
        </div>
      )}

      {/* 批量移动文件弹窗 */}
      {isBatchMoving && (
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
        }} onClick={() => { setIsBatchMoving(false); setIsCreatingInMove(false); setNewFolderInMoveName(""); }}>
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
              <span>📂</span> 批量移动图片到分类
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto", paddingRight: 4 }}>
              <button
                className="btn btn--ghost"
                style={{
                  textAlign: "left",
                  justifyContent: "flex-start",
                  padding: "10px 14px",
                  border: "1px solid var(--color-border)",
                }}
                onClick={() => handleConfirmBatchMove(null)}
              >
                根目录 (无分类)
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  className="btn btn--ghost"
                  style={{
                    textAlign: "left",
                    justifyContent: "flex-start",
                    padding: "10px 14px",
                    border: "1px solid var(--color-border)",
                  }}
                  onClick={() => handleConfirmBatchMove(f.id)}
                >
                  📁 {f.name}
                </button>
              ))}

              {!isCreatingInMove ? (
                <button
                  className="btn btn--ghost"
                  style={{
                    textAlign: "left",
                    justifyContent: "flex-start",
                    padding: "10px 14px",
                    border: "1px dashed var(--color-primary)",
                    color: "var(--color-primary)",
                    marginTop: 4,
                  }}
                  onClick={() => setIsCreatingInMove(true)}
                >
                  ➕ 新建分类...
                </button>
              ) : (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "8px 12px",
                  border: "1px dashed var(--color-primary)",
                  borderRadius: "var(--radius-sm)",
                  marginTop: 4,
                }}>
                  <input
                    type="text"
                    placeholder="请输入新分类名称"
                    value={newFolderInMoveName}
                    onChange={(e) => setNewFolderInMoveName(e.target.value)}
                    autoFocus
                    style={{
                      padding: "6px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-bg-input)",
                      color: "var(--color-text)",
                      width: "100%",
                      outline: "none",
                      fontSize: 13,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateFolderInMove(true);
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ padding: "2px 8px", fontSize: 12, height: "auto" }}
                      onClick={() => {
                        setIsCreatingInMove(false);
                        setNewFolderInMoveName("");
                      }}
                    >
                      取消
                    </button>
                    <button
                      className="btn btn--primary btn--sm"
                      style={{ padding: "2px 8px", fontSize: 12, height: "auto" }}
                      onClick={() => handleCreateFolderInMove(true)}
                      disabled={!newFolderInMoveName || !newFolderInMoveName.trim()}
                    >
                      创建并移动
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => { setIsBatchMoving(false); setIsCreatingInMove(false); setNewFolderInMoveName(""); }}
                style={{ padding: "6px 16px" }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 极简精致灯箱 (Lightbox) 效果，展示原图 */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(243, 244, 246, 0.95)",
            backdropFilter: "blur(20px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "zoom-out",
            animation: "fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes scaleIn {
              from { transform: scale(0.95); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
          `}</style>
          
          {/* 灯箱头部信息栏 */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 20,
              left: 20,
              right: 20,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 16px",
              background: "rgba(255, 255, 255, 0.8)",
              backdropFilter: "blur(10px)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
              border: "1px solid var(--color-border)",
              cursor: "default",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>
                {lightboxImage.originalName}
              </span>
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                {formatFileSize(lightboxImage.size)} · {lightboxImage.mimeType}
              </span>
            </div>
            <button
              onClick={() => setLightboxImage(null)}
              style={{
                background: "none",
                border: "none",
                fontSize: 18,
                cursor: "pointer",
                padding: 4,
                color: "var(--color-text-secondary)",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
            >
              ✕
            </button>
          </div>

          {/* 原图容器 */}
          <img
            src={lightboxImage.url}
            alt={lightboxImage.originalName}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90%",
              maxHeight: "85%",
              objectFit: "contain",
              borderRadius: "0",
              boxShadow: "none",
              cursor: "default",
              animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
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

      {/* 批量删除确认弹窗 */}
      {isBatchDeleting && (
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
        }} onClick={() => setIsBatchDeleting(false)}>
          <div className="card" style={{
            width: "100%",
            maxWidth: 380,
            padding: 24,
            background: "var(--color-bg-surface)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--color-danger)" }}>
              <span>⚠️</span> 确认批量删除
            </h3>
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
              确定要删除选中的 <strong>{selectedIds.length}</strong> 张图片吗？<br />
              此操作将物理删除云端存储中的图片，<strong>无法恢复！</strong>
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setIsBatchDeleting(false)}
                style={{ padding: "6px 16px" }}
              >
                取消
              </button>
              <button
                className="btn btn--danger btn--sm"
                onClick={handleConfirmBatchDelete}
                style={{ padding: "6px 16px" }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 解散虚拟分类确认弹窗 */}
      {isDeletingFolder && (
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
        }} onClick={() => setIsDeletingFolder(false)}>
          <div className="card" style={{
            width: "100%",
            maxWidth: 380,
            padding: 24,
            background: "var(--color-bg-surface)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--color-danger)" }}>
              <span>⚠️</span> 确认解散分类
            </h3>
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
              确定要解散分类文件夹 <strong>{currentFolder?.name}</strong> 吗？<br />
              解散分类不会删除分类内的图片，图片会自动转移到根目录。
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setIsDeletingFolder(false)}
                style={{ padding: "6px 16px" }}
              >
                取消
              </button>
              <button
                className="btn btn--danger btn--sm"
                onClick={handleConfirmDeleteFolder}
                style={{ padding: "6px 16px" }}
              >
                确认解散
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 单张图片删除确认弹窗 */}
      {deletingImage && (
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
        }} onClick={() => setDeletingImage(null)}>
          <div className="card" style={{
            width: "100%",
            maxWidth: 380,
            padding: 24,
            background: "var(--color-bg-surface)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--color-danger)" }}>
              <span>⚠️</span> 确认删除图片
            </h3>
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
              确定要删除图片 <strong>{deletingImage.originalName}</strong> 吗？<br />
              此操作将物理删除云端存储中的图片，<strong>无法恢复！</strong>
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setDeletingImage(null)}
                style={{ padding: "6px 16px" }}
              >
                取消
              </button>
              <button
                className="btn btn--danger btn--sm"
                onClick={handleConfirmSingleDelete}
                style={{ padding: "6px 16px" }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
