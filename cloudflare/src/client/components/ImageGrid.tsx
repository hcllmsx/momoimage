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
  onCreateFolder: (name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onMoveImage: (id: string, folderId: string | null) => Promise<void>;
  onMoveMultiple: (ids: string[], folderId: string | null) => Promise<void>;
}) {
  const { showToast } = useToastContext();
  const [movingImageId, setMovingImageId] = useState<string | null>(null);

  // 批量操作相关的状态
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchMoving, setIsBatchMoving] = useState(false);

  const currentFolder = folders.find((f) => f.id === currentFolderId);

  const handleQuickCopy = async (image: ImageMeta) => {
    const ok = await copyToClipboard(image.url);
    showToast(ok ? "链接已复制" : "复制失败", ok ? "success" : "error");
  };

  const handleCreateFolderClick = async () => {
    const name = prompt("请输入新分类文件夹的名称：");
    if (!name || !name.trim()) return;
    try {
      await onCreateFolder(name.trim());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "创建失败", "error");
    }
  };

  const handleDeleteCurrentFolder = async () => {
    if (!currentFolderId) return;
    if (confirm(`确定要删除分类 "${currentFolder?.name}" 吗？\n注意：此操作并不会删除里面的图片文件，图片将会安全移回根目录。`)) {
      try {
        await onDeleteFolder(currentFolderId);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "删除失败", "error");
      }
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

  const handleBatchDeleteClick = async () => {
    if (selectedIds.length === 0) return;
    if (confirm(`确定要删除选中的 ${selectedIds.length} 张图片吗？此操作无法恢复！`)) {
      try {
        await onDeleteMultiple(selectedIds);
        setSelectedIds([]);
        setIsMultiSelectMode(false);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "批量删除失败", "error");
      }
    }
  };

  const handleConfirmBatchMove = async (folderId: string | null) => {
    if (selectedIds.length === 0) return;
    try {
      await onMoveMultiple(selectedIds, folderId);
      setIsBatchMoving(false);
      setSelectedIds([]);
      setIsMultiSelectMode(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "批量分类失败", "error");
    }
  };

  return (
    <div>
      {/* 文件夹头部与面包屑导航 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        background: "var(--color-bg-surface)",
        padding: "12px 16px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
        flexWrap: "wrap",
        gap: 12,
      }}>
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
                    className="btn btn--ghost btn--sm"
                    onClick={() => onFolderChange(null)}
                  >
                    ⬅️ 返回根目录
                  </button>
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  background: "var(--color-bg-surface)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  cursor: "pointer",
                  transition: "transform 0.2s ease, border-color 0.2s ease",
                  userSelect: "none",
                }}
                className="folder-card-hover"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-primary-light)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.transform = "none";
                }}
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
                cursor: "pointer",
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

              <div className="image-card__preview">
                <img
                  src={image.url}
                  alt={image.originalName}
                  loading="lazy"
                />
              </div>

              {/* 仅在非多选模式下显示悬浮动作栏 */}
              {!isMultiSelectMode && (
                <div className="image-card__overlay">
                  <div className="image-card__actions" style={{ gap: 6 }}>
                    <button
                      className="btn btn--ghost btn--sm"
                      title="图片详情"
                      style={{ minWidth: 32, padding: 0 }}
                      onClick={() => onCopyLink(image)}
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
                      onClick={() => handleQuickCopy(image)}
                      title="快速复制 URL"
                      style={{ minWidth: 32, padding: 0 }}
                    >
                      🔗
                    </button>
                    <button
                      className="btn btn--ghost btn--sm btn--delete"
                      onClick={() => {
                        if (confirm("确定要删除这张图片吗？")) {
                          onDelete(image.id);
                        }
                      }}
                      style={{ minWidth: 32, padding: 0 }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )}

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
        }} onClick={() => setMovingImageId(null)}>
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
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setMovingImageId(null)}
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
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
          zIndex: 1000,
          backdropFilter: "blur(8px)",
          animation: "barSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
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
        }} onClick={() => setIsBatchMoving(false)}>
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
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setIsBatchMoving(false)}
                style={{ padding: "6px 16px" }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
