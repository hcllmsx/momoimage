// ============================================
// 默默图床 — 登录表单
// ============================================

import { useState } from "react";
import * as api from "../lib/api";

export function LoginForm({
  onLogin,
  isDefaultPassword,
}: {
  onLogin: () => void;
  isDefaultPassword?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("请输入密码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.login(password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card card">
        <div className="card__body" style={{ padding: 32 }}>
          <div className="login-logo">
            <img src="/favicon.svg" alt="MomoImage" style={{ width: 56, height: 56, display: "block" }} />
          </div>
          <h1 className="login-title">默默图床</h1>
          <p className="login-subtitle">MomoImage · 简洁高效的图片托管</p>

          {isDefaultPassword && (
            <div style={{
              background: "var(--color-primary-subtle)",
              border: "1px solid rgba(240, 160, 80, 0.15)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
              fontSize: "12.5px",
              color: "var(--color-primary)",
              textAlign: "left",
              marginBottom: 18,
              lineHeight: 1.6,
            }}>
              💡 <strong>提示：</strong>当前系统未设置自定义密码，已启用默认登录密码：<code style={{ background: "var(--color-bg-surface)", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", fontWeight: "bold" }}>momoimage</code>。为了安全，建议部署后到 Vercel 控制台的「Settings → Environment Variables」中配置自定义 <code>ADMIN_PASSWORD</code>。
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
            {error && <div className="login-error">{error}</div>}
            <input
              id="login-password"
              className="input"
              type="password"
              placeholder="请输入管理员密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button
              id="login-submit"
              className="btn btn--primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", padding: "12px" }}
            >
              {loading ? "登录中..." : "登 录"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
