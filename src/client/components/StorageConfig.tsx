// ============================================
// 默默图床 — 存储配置页面
// ============================================

import { useState, useEffect } from "react";
import type { StorageConfig as StorageConfigType, StorageType } from "@shared/types";
import * as api from "../lib/api";
import { getStorageTypeName } from "../lib/utils";
import { useToastContext } from "../App";

export function StorageConfig() {
  const [configs, setConfigs] = useState<StorageConfigType[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToastContext();

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const data = await api.getStorageConfigs();
      setConfigs(data);
    } catch (err) {
      showToast("加载存储配置失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (id: string) => {
    try {
      const result = await api.testStorage(id);
      showToast(result.message, result.connected ? "success" : "error");
    } catch {
      showToast("测试失败", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个存储配置吗？")) return;
    try {
      await api.deleteStorage(id);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
      showToast("已删除", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败", "error");
    }
  };

  const handleAdded = () => {
    setShowAddForm(false);
    loadConfigs();
  };

  const getIcon = (type: StorageType) => {
    switch (type) {
      case "r2-binding": return { cls: "storage-item__icon--r2", emoji: "☁️" };
      case "s3": return { cls: "storage-item__icon--s3", emoji: "📦" };
      case "vercel-blob": return { cls: "storage-item__icon--blob", emoji: "▲" };
    }
  };

  if (loading) {
    return <div className="empty-state"><p>加载中...</p></div>;
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__header">
          <span className="card__title">存储后端</span>
          <button className="btn btn--primary btn--sm" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "取消" : "➕ 添加存储"}
          </button>
        </div>
        <div className="card__body">
          {showAddForm && <AddStorageForm onAdded={handleAdded} />}

          <div className="storage-list">
            {configs.map((config) => {
              const icon = getIcon(config.type);
              return (
                <div key={config.id} className="storage-item">
                  <div className={`storage-item__icon ${icon.cls}`}>{icon.emoji}</div>
                  <div className="storage-item__info">
                    <div className="storage-item__name">
                      {config.name}
                      {config.isDefault && <span className="storage-item__badge" style={{ marginLeft: 8 }}>默认</span>}
                    </div>
                    <div className="storage-item__type">{getStorageTypeName(config.type)}</div>
                  </div>
                  <div className="storage-item__actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => handleTest(config.id)}>测试</button>
                    {config.id !== "local-r2" && (
                      <button className="btn btn--danger btn--sm" onClick={() => handleDelete(config.id)}>删除</button>
                    )}
                  </div>
                </div>
              );
            })}

            {configs.length === 0 && (
              <div className="empty-state">
                <div className="empty-state__icon">💾</div>
                <div className="empty-state__title">暂无存储后端</div>
                <p>点击上方"添加存储"来配置存储后端</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* API Token 管理 */}
      <TokenManager />
    </div>
  );
}

// ========= 添加存储表单 =========
function AddStorageForm({ onAdded }: { onAdded: () => void }) {
  const [type, setType] = useState<StorageType>("s3");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("auto");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [bucket, setBucket] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [blobToken, setBlobToken] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToastContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { showToast("请输入名称", "error"); return; }
    setLoading(true);

    try {
      const config: StorageConfigType = {
        id: "",
        name: name.trim(),
        type,
        isDefault: false,
        enabled: true,
      };

      if (type === "s3") {
        config.s3Config = { endpoint, region, accessKeyId, secretAccessKey, bucket, publicUrl };
      } else if (type === "vercel-blob") {
        config.vercelBlobConfig = { token: blobToken };
      }

      await api.addStorage(config);
      showToast("存储添加成功", "success");
      onAdded();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "添加失败", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 20, padding: 16, background: "var(--color-bg-surface)", borderRadius: "var(--radius-md)" }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>存储类型</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as StorageType)}>
            <option value="s3">S3 兼容存储（R2 外部账号 / AWS S3）</option>
            <option value="vercel-blob">Vercel Blob</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>显示名称</label>
          <input className="input" placeholder="如：我的 R2 存储" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {type === "s3" && (
          <>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Endpoint</label>
              <input className="input" placeholder="如：https://xxx.r2.cloudflarestorage.com" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Access Key ID</label>
                <input className="input" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Secret Access Key</label>
                <input className="input" type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Bucket</label>
                <input className="input" value={bucket} onChange={(e) => setBucket(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Region</label>
                <input className="input" placeholder="auto" value={region} onChange={(e) => setRegion(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>公开 URL 前缀（可选）</label>
              <input className="input" placeholder="如：https://img.example.com" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} />
            </div>
          </>
        )}

        {type === "vercel-blob" && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>BLOB_READ_WRITE_TOKEN</label>
            <input className="input" type="password" value={blobToken} onChange={(e) => setBlobToken(e.target.value)} />
          </div>
        )}

        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "添加中..." : "添加存储"}
        </button>
      </div>
    </form>
  );
}

// ========= API Token 管理 =========
function TokenManager() {
  const [tokens, setTokens] = useState<Array<{ id: string; name: string; token: string; createdAt: string }>>([]);
  const [newTokenName, setNewTokenName] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToastContext();

  useEffect(() => {
    api.listApiTokens().then(setTokens).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!newTokenName.trim()) { showToast("请输入 Token 名称", "error"); return; }
    setLoading(true);
    try {
      const token = await api.createApiToken(newTokenName.trim());
      showToast("Token 已创建，请立即复制保存！", "success");
      // 显示完整 token 值
      alert(`API Token 已创建！请立即复制保存，关闭后无法再次查看：\n\n${token.token}`);
      setNewTokenName("");
      // 刷新列表
      const list = await api.listApiTokens();
      setTokens(list);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "创建失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个 Token 吗？")) return;
    try {
      await api.deleteApiToken(id);
      setTokens((prev) => prev.filter((t) => t.id !== id));
      showToast("Token 已删除", "success");
    } catch (err) {
      showToast("删除失败", "error");
    }
  };

  return (
    <div className="card">
      <div className="card__header">
        <span className="card__title">API Token</span>
      </div>
      <div className="card__body">
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
          API Token 用于通过外部工具上传图片。使用方式：在请求头中添加 <code style={{ background: "var(--color-bg-surface)", padding: "2px 6px", borderRadius: 4 }}>Authorization: Token your-token-here</code>
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input className="input" placeholder="Token 名称/备注" value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn--primary" onClick={handleCreate} disabled={loading}>创建</button>
        </div>

        {tokens.length > 0 ? (
          <div className="storage-list">
            {tokens.map((token) => (
              <div key={token.id} className="storage-item">
                <div className="storage-item__icon" style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>🔑</div>
                <div className="storage-item__info">
                  <div className="storage-item__name">{token.name}</div>
                  <div className="storage-item__type" style={{ fontFamily: "monospace" }}>{token.token}</div>
                </div>
                <button className="btn btn--danger btn--sm" onClick={() => handleDelete(token.id)}>删除</button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center", padding: 16 }}>暂无 API Token</p>
        )}
      </div>
    </div>
  );
}
