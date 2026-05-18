// ============================================
// 默默图床 — 顶栏组件
// ============================================

export function Header({
  theme,
  onToggleTheme,
  onLogout,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <div className="app-header__logo">M</div>
        <div>
          <div className="app-header__title">默默图床</div>
          <div className="app-header__subtitle">MomoImage</div>
        </div>
      </div>
      <div className="app-header__actions" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          className="btn btn--ghost btn--sm"
          onClick={onToggleTheme}
          style={{
            fontSize: 14,
            padding: "6px 12px",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            background: "var(--color-bg-input)",
            color: "var(--color-text-secondary)",
            borderRadius: "var(--radius-sm)",
          }}
          title={theme === "light" ? "切换为暗夜模式" : "切换为白天模式"}
        >
          {theme === "light" ? "🌙 暗夜" : "☀️ 白天"}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onLogout}>
          退出登录
        </button>
      </div>
    </header>
  );
}
