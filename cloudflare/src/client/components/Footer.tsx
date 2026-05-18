// ============================================
// 默默图床 — 页脚组件
// ============================================

import packageInfo from "../../../package.json";

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="app-footer">
      <span>© {currentYear} </span>
      <a 
        href="https://github.com/hcllmsx/momoimage" 
        target="_blank" 
        rel="noopener noreferrer"
      >
        默默图床
      </a>
      <span> · v{packageInfo.version}</span>
    </footer>
  );
}
