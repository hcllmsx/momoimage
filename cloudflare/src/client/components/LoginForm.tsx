// ============================================
// 默默图床 — 登录表单
// ============================================

import { useState } from "react";
import * as api from "../lib/api";

export function LoginForm({ onLogin }: { onLogin: () => void }) {
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
          <div className="login-logo">M</div>
          <h1 className="login-title">默默图床</h1>
          <p className="login-subtitle">MomoImage · 简洁高效的图片托管</p>

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
