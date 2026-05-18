// ============================================
// 默默图床 — 图片网格组件
// ============================================

import type { ImageMeta } from "@shared/types";
import { formatFileSize, formatDate, copyToClipboard } from "../lib/utils";
import { useToastContext } from "../App";

export function ImageGrid({
  images,
  loading,
  hasMore,
  onLoadMore,
  onDelete,
  onCopyLink,
}: {
  images: ImageMeta[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
  onCopyLink: (image: ImageMeta) => void;
}) {
  const { showToast } = useToastContext();

  if (images.length === 0 && !loading) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🖼️</div>
        <div className="empty-state__title">还没有图片</div>
        <p>上传你的第一张图片吧</p>
      </div>
    );
  }

  const handleQuickCopy = async (image: ImageMeta) => {
    const ok = await copyToClipboard(image.url);
    showToast(ok ? "链接已复制" : "复制失败", ok ? "success" : "error");
  };

  return (
    <div>
      <div className="image-grid">
        {images.map((image) => (
          <div key={image.id} className="image-card">
            <div className="image-card__preview">
              <img
                src={image.url}
                alt={image.originalName}
                loading="lazy"
              />
            </div>
            <div className="image-card__overlay">
              <div className="image-card__actions">
                <button
                  className="btn btn--primary btn--sm"
                  style={{ flex: 1 }}
                  onClick={() => onCopyLink(image)}
                >
                  📋 链接
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => handleQuickCopy(image)}
                  title="快速复制 URL"
                >
                  🔗
                </button>
                <button
                  className="btn btn--danger btn--sm"
                  onClick={() => {
                    if (confirm("确定要删除这张图片吗？")) {
                      onDelete(image.id);
                    }
                  }}
                >
                  🗑️
                </button>
              </div>
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
    </div>
  );
}
