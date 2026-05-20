// ============================================
// 默默图床 — Toast 通知组件
// ============================================

import { useState, useCallback, useEffect } from "react";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error";
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // 错误通知保留 15 秒以便用户阅读和复制，成功通知保留 4 秒
    const duration = type === "error" ? 15000 : 4000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}

export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.type}`}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, userSelect: "text" }}
        >
          <div style={{ flex: 1, wordBreak: "break-word" }}>
            {t.type === "success" ? "✅ " : "❌ "}
            {t.message}
          </div>
          <button
            onClick={() => onRemove(t.id)}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-tertiary)",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: 14,
              lineHeight: 1,
              borderRadius: 4,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-text-primary)";
              e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-tertiary)";
              e.currentTarget.style.background = "none";
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
