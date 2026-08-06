// ============================================
// 默默图床 — 页脚组件
// ============================================

interface FooterProps {
  /** 版本号，由 /api/info 动态提供 */
  version?: string;
}

export function Footer({ version }: FooterProps) {
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
      {version && <span> · v{version}</span>}
    </footer>
  );
}
