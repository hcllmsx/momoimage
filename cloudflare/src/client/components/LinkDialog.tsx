// ============================================
// 默默图床 — 链接复制弹窗
// ============================================

import type { UploadResult } from "@shared/types";
import { copyToClipboard } from "../lib/utils";
import { useToastContext } from "../App";

export function LinkDialog({
  data,
  onClose,
}: {
  data: UploadResult;
  onClose: () => void;
}) {
  const { showToast } = useToastContext();

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    showToast(ok ? `${label} 已复制` : "复制失败", ok ? "success" : "error");
  };

  const links = [
    { label: "URL", value: data.links.url },
    { label: "Markdown", value: data.links.markdown },
    { label: "HTML", value: data.links.html },
    { label: "BBCode", value: data.links.bbcode },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">图片链接</h3>
          <button className="modal__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal__body">
          {/* 预览 */}
          <div
            style={{
              marginBottom: 16,
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "var(--color-bg-surface)",
              maxHeight: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={data.url}
              alt={data.originalName}
              style={{
                maxWidth: "100%",
                maxHeight: 200,
                objectFit: "contain",
              }}
            />
          </div>

          {/* 各格式链接 */}
          {links.map((link) => (
            <div key={link.label} className="link-item">
              <div className="link-item__label">{link.label}</div>
              <div className="link-item__row">
                <div className="link-item__value">{link.value}</div>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => handleCopy(link.value, link.label)}
                >
                  复制
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
