// ============================================
// 默默图床 — 顶栏组件
// ============================================

import { useState } from "react";

export function Header({
  onLogout,
}: {
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
        <button className="btn btn--ghost btn--sm" onClick={onLogout}>
          退出登录
        </button>
      </div>
    </header>
  );
}
