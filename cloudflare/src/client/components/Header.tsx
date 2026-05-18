// ============================================
// 默默图床 — 顶栏组件
// ============================================

import { useState } from "react";

export function Header({
  theme,
  onToggleTheme,
  onLogout,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const [showEnglishText, setShowEnglishText] = useState(false);

  return (
    <header className="app-header">
      <div 
        className="app-header__brand" 
        onClick={() => setShowEnglishText(!showEnglishText)}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <img 
          src="/favicon.svg" 
          alt="MomoImage Logo" 
          style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }}
        />
        <div className="app-header__title">
          {showEnglishText ? "MomoImage" : "默默图床"}
        </div>
      </div>
      <div className="app-header__actions" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          className="btn btn--ghost btn--sm"
          onClick={onToggleTheme}
          style={{
            fontSize: 14,
            width: 32,
            height: 32,
            padding: 0,
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            background: "var(--color-bg-input)",
            color: "var(--color-text-secondary)",
            borderRadius: "var(--radius-sm)",
          }}
          title={theme === "light" ? "切换为暗夜模式" : "切换为白天模式"}
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onLogout}>
          退出登录
        </button>
      </div>
    </header>
  );
}
