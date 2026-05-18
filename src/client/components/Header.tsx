// ============================================
// 默默图床 — 顶栏组件
// ============================================

export function Header({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <div className="app-header__logo">M</div>
        <div>
          <div className="app-header__title">默默图床</div>
          <div className="app-header__subtitle">MomoImage</div>
        </div>
      </div>
      <div className="app-header__actions">
        <button className="btn btn--ghost btn--sm" onClick={onLogout}>
          退出登录
        </button>
      </div>
    </header>
  );
}
