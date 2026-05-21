// ============================================
// 默默图床 — 存储配置页面
// ============================================

import { useState, useEffect } from "react";
import type { StorageConfig as StorageConfigType, StorageType } from "@shared/types";
import * as api from "../lib/api";
import { getStorageTypeName, formatFileSize } from "../lib/utils";
import { useToastContext } from "../App";

export function StorageConfig() {
  const [configs, setConfigs] = useState<StorageConfigType[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<StorageConfigType | null>(null);
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

  const handleSetDefault = async (config: StorageConfigType) => {
    try {
      await api.updateStorage(config.id, { ...config, isDefault: true });
      showToast(`已成功将 "${config.name}" 设为默认存储`, "success");
      loadConfigs();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "设置默认失败", "error");
    }
  };

  const handleSaved = () => {
    setShowAddForm(false);
    setEditingConfig(null);
    loadConfigs();
  };

  const getIcon = (type: StorageType) => {
    switch (type) {
      case "r2-binding": return { cls: "storage-item__icon--r2", emoji: "☁️" };
      case "s3": return { cls: "storage-item__icon--s3", emoji: "📦" };
      case "vercel-blob": return { cls: "storage-item__icon--blob", emoji: "▲" };
      case "oracle": return { cls: "storage-item__icon--s3", emoji: "🍊" };
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
          <button
            className="btn btn--primary btn--sm"
            onClick={() => {
              if (showAddForm) {
                setShowAddForm(false);
                setEditingConfig(null);
              } else {
                setShowAddForm(true);
                setEditingConfig(null);
              }
            }}
          >
            {showAddForm ? "取消" : "➕ 添加存储"}
          </button>
        </div>
        <div className="card__body">
          {showAddForm && (
            <StorageForm
              key={editingConfig?.id || "new"}
              config={editingConfig}
              onSaved={handleSaved}
            />
          )}

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
                    <div className="storage-item__type">
                      {getStorageTypeName(config.type, config)}
                      {config.usedSize !== undefined && (
                        <span style={{ marginLeft: 12, opacity: 0.6, fontSize: "11px" }}>
                          📊 已存容量: {formatFileSize(config.usedSize)}{config.warningThresholdValue !== undefined ? ` / ${config.warningThresholdValue} ${config.warningThresholdUnit}` : ""} ({config.fileCount} 张图片)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="storage-item__actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => handleTest(config.id)}>测试</button>
                    {!config.isDefault && (
                      <button className="btn btn--ghost btn--sm" onClick={() => handleSetDefault(config)}>设为默认</button>
                    )}
                    {config.id !== "local-r2" && (
                      <>
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            setEditingConfig(config);
                            setShowAddForm(true);
                          }}
                        >
                          编辑
                        </button>
                        <button className="btn btn--danger btn--sm" onClick={() => handleDelete(config.id)}>删除</button>
                      </>
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

// ========= 存储配置表单 (添加/编辑) =========
interface StorageFormProps {
  config?: StorageConfigType | null;
  onSaved: () => void;
}

function StorageForm({ config, onSaved }: StorageFormProps) {
  const isEdit = !!config;
  const isLocal = config?.id === "local-blob" || config?.id === "local-r2";

  // 根据 Endpoint 特征自动判断供应商类别（是否是外部 R2 或甲骨文云）
  const getInitialProvider = (): "r2-external" | "s3-general" | "vercel-blob" | "oracle" => {
    if (!config) return "r2-external";
    if (config.type === "vercel-blob") return "vercel-blob";
    if (config.type === "oracle") return "oracle";
    if (config.type === "s3") {
      const ep = config.s3Config?.endpoint || "";
      if (ep.includes("r2.cloudflarestorage.com")) return "r2-external";
      return "s3-general";
    }
    return "s3-general";
  };

  const [provider, setProvider] = useState<"r2-external" | "s3-general" | "vercel-blob" | "oracle">(getInitialProvider());
  const [name, setName] = useState(config?.name || "");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToastContext();

  const [warningThresholdValue, setWarningThresholdValue] = useState<number | "">(config?.warningThresholdValue ?? "");
  const [warningThresholdUnit, setWarningThresholdUnit] = useState<"MB" | "GB">(config?.warningThresholdUnit ?? "GB");

  // R2 外部专有字段 (将 endpoint 和 bucket 拼装回完整的 R2 S3 API 链接)
  const getInitialR2Url = () => {
    if (config?.type === "s3" && config.s3Config) {
      const ep = config.s3Config.endpoint || "";
      const bk = config.s3Config.bucket || "";
      if (ep.includes("r2.cloudflarestorage.com")) {
        return `${ep}/${bk}`;
      }
    }
    return "";
  };
  const [r2S3ApiUrl, setR2S3ApiUrl] = useState(getInitialR2Url());

  // 甲骨文云专有字段
  const [namespace, setNamespace] = useState(config?.oracleConfig?.namespace || "");

  // 基础 S3 字段
  const [endpoint, setEndpoint] = useState(config?.s3Config?.endpoint || "");
  const [region, setRegion] = useState(config?.oracleConfig?.region || config?.s3Config?.region || "auto");
  const [bucket, setBucket] = useState(config?.oracleConfig?.bucket || config?.s3Config?.bucket || "");
  const [accessKeyId, setAccessKeyId] = useState(config?.oracleConfig?.accessKeyId || config?.s3Config?.accessKeyId || "");
  const [secretAccessKey, setSecretAccessKey] = useState(config?.oracleConfig?.secretAccessKey || config?.s3Config?.secretAccessKey || "");
  const [publicUrl, setPublicUrl] = useState(config?.oracleConfig?.publicUrl || config?.s3Config?.publicUrl || "");

  // Vercel Blob 字段
  const [blobToken, setBlobToken] = useState(config?.vercelBlobConfig?.token || "");

  // 解析 R2 完整链接的工具函数
  const parseR2Url = (url: string) => {
    try {
      const trimmed = url.trim();
      const parsed = new URL(trimmed);
      const bucketName = parsed.pathname.replace(/^\//, "").split("/")[0] || "";
      const endpointUrl = `${parsed.protocol}//${parsed.host}`;
      return { bucket: bucketName, endpoint: endpointUrl };
    } catch {
      return { bucket: "", endpoint: "" };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { showToast("请输入显示名称", "error"); return; }
    setLoading(true);

    try {
      if (isLocal) {
        const submitConfig: any = {
          id: config!.id,
          name: config!.name,
          type: config!.type,
          isDefault: config!.isDefault || false,
          enabled: config!.enabled ?? true,
          warningThresholdValue: warningThresholdValue !== "" ? Number(warningThresholdValue) : undefined,
          warningThresholdUnit: warningThresholdValue !== "" ? warningThresholdUnit : undefined,
        };
        await api.updateStorage(config!.id, submitConfig);
        showToast("本地存储限额预警保存成功", "success");
        onSaved();
        return;
      }

      // 确定提交的底层类型：s3, vercel-blob 或 oracle
      let type: StorageType = "s3";
      if (provider === "vercel-blob") type = "vercel-blob";
      else if (provider === "oracle") type = "oracle";

      const submitConfig: StorageConfigType = {
        id: config?.id || "",
        name: name.trim(),
        type,
        isDefault: config?.isDefault || false,
        enabled: config?.enabled ?? true,
        warningThresholdValue: warningThresholdValue !== "" ? Number(warningThresholdValue) : undefined,
        warningThresholdUnit: warningThresholdValue !== "" ? warningThresholdUnit : undefined,
      };

      if (type === "s3") {
        let finalEndpoint = endpoint.trim();
        let finalBucket = bucket.trim();
        let finalRegion = region.trim() || "auto";

        if (provider === "r2-external") {
          if (!r2S3ApiUrl.trim()) {
            showToast("请输入 R2 S3 API 链接", "error");
            setLoading(false);
            return;
          }
          const parsed = parseR2Url(r2S3ApiUrl);
          if (!parsed.bucket || !parsed.endpoint) {
            showToast("无法解析 R2 链接，请输入正确的 R2 S3 API 地址", "error");
            setLoading(false);
            return;
          }
          finalEndpoint = parsed.endpoint;
          finalBucket = parsed.bucket;
          finalRegion = "auto";
        } else {
          if (!finalEndpoint) { showToast("请输入 Endpoint 地址", "error"); setLoading(false); return; }
          if (!finalBucket) { showToast("请输入 Bucket 名称", "error"); setLoading(false); return; }
        }

        if (!accessKeyId.trim()) { showToast("请输入 Access Key ID", "error"); setLoading(false); return; }
        if (!secretAccessKey.trim()) { showToast("请输入 Secret Access Key", "error"); setLoading(false); return; }

        submitConfig.s3Config = {
          endpoint: finalEndpoint,
          region: finalRegion,
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
          bucket: finalBucket,
          publicUrl: publicUrl.trim() || undefined,
        };
      } else if (type === "oracle") {
        if (!namespace.trim()) { showToast("请输入对象存储命名空间 (Namespace)", "error"); setLoading(false); return; }
        if (!region.trim()) { showToast("请输入租户区域 (Region)", "error"); setLoading(false); return; }
        if (!bucket.trim()) { showToast("请输入存储桶名称 (Bucket)", "error"); setLoading(false); return; }
        if (!accessKeyId.trim()) { showToast("请输入客户密钥的访问密钥 (Access Key ID)", "error"); setLoading(false); return; }
        if (!secretAccessKey.trim()) { showToast("请输入客户密钥的密钥 (Secret Access Key)", "error"); setLoading(false); return; }

        submitConfig.oracleConfig = {
          namespace: namespace.trim(),
          region: region.trim(),
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
          bucket: bucket.trim(),
          publicUrl: publicUrl.trim() || undefined,
        };
      } else if (type === "vercel-blob") {
        if (!blobToken.trim()) { showToast("请输入 Vercel Blob Token", "error"); setLoading(false); return; }
        submitConfig.vercelBlobConfig = {
          token: blobToken.trim(),
        };
      }

      if (isEdit) {
        await api.updateStorage(config!.id, submitConfig);
        showToast("存储配置修改成功", "success");
      } else {
        await api.addStorage(submitConfig);
        showToast("存储后端添加成功", "success");
      }
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const renderAwsCredentialsHelp = () => (
    <div style={{
      background: "rgba(245, 158, 11, 0.08)",
      borderLeft: "4px solid #f59e0b",
      padding: "10px 14px",
      borderRadius: "0 6px 6px 0",
      fontSize: "12px",
      color: "var(--color-text-secondary)",
      lineHeight: "1.5",
      margin: "8px 0"
    }}>
      <span style={{ fontWeight: "bold", color: "#d97706", display: "block", marginBottom: 4 }}>
        ⚠️ 警惕：此处需要填入 R2 S3 凭证，而非普通的 Cloudflare API 令牌！
      </span>
      以 <code style={{ background: "rgba(0,0,0,0.05)", padding: "2px 4px", borderRadius: 4 }}>cfat_</code> 或 <code style={{ background: "rgba(0,0,0,0.05)", padding: "2px 4px", borderRadius: 4 }}>cfut_</code> 开头的 Cloudflare 主 API 令牌<strong>无法</strong>直接用作 S3 的签名密钥！
      <br />
      <strong>正确获取路径：</strong>
      打开另一个账户的 R2 控制台主页，在右侧边栏点击 <strong>“管理 R2 API 令牌 (Manage R2 API Tokens)”</strong> 并创建令牌（权限选择“编辑”并勾选特定的存储桶）。
      <strong>令牌生成后，请向下滑动页面</strong>，在最底部的 <strong>“S3 API 凭证 (S3 API Credentials)”</strong> 中看到的 <strong>Access Key ID</strong> 与 <strong>Secret Access Key</strong> 才是此表单真正需要的凭证！
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 20, padding: 16, background: "var(--color-bg-surface)", borderRadius: "var(--radius-md)" }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>接入供应商 / 协议</label>
          <select
            className="input"
            value={isLocal ? config!.type : provider}
            onChange={(e) => {
              const val = e.target.value as any;
              setProvider(val);
              if (val === "oracle") {
                if (region === "auto") {
                  setRegion("");
                }
              } else if (val === "r2-external" || val === "s3-general") {
                if (!region) {
                  setRegion("auto");
                }
              }
            }}
            disabled={isEdit || isLocal}
          >
            {isLocal && <option value={config!.type}>本地内置存储 ({config!.type === "r2-binding" ? "Cloudflare R2" : "Vercel Blob"})</option>}
            <option value="r2-external">Cloudflare R2（外部账号）</option>
            <option value="oracle">甲骨文云 OCI 对象存储</option>
            <option value="s3-general">AWS S3 / 其他 S3 兼容存储</option>
            <option value="vercel-blob">Vercel Blob</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>显示名称</label>
          <input className="input" placeholder="如：甲骨文云免费存储" value={name} onChange={(e) => setName(e.target.value)} disabled={isLocal} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>空间限额预警（可选）</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input 
              type="number" 
              className="input" 
              placeholder="留空则不开启预警，例如：5" 
              value={warningThresholdValue} 
              onChange={(e) => {
                const val = e.target.value;
                setWarningThresholdValue(val === "" ? "" : Number(val));
              }} 
              style={{ flex: 1 }}
              min="1"
            />
            <select
              className="input"
              value={warningThresholdUnit}
              onChange={(e) => setWarningThresholdUnit(e.target.value as "MB" | "GB")}
              style={{ width: 100 }}
            >
              <option value="MB">MB</option>
              <option value="GB">GB</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            💡 设置后，当该存储的已用容量接近或超过此限额时，将在图片上传页面进行友好提示。
          </div>
        </div>

        {provider === "r2-external" && !isLocal && (
          <>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>R2 S3 API 链接（直接从 CF 后台粘贴）</label>
              <input
                className="input"
                placeholder="如：https://xxx.r2.cloudflarestorage.com/momoimage"
                value={r2S3ApiUrl}
                onChange={(e) => setR2S3ApiUrl(e.target.value)}
              />
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                💡 直接粘贴 Cloudflare 桶设置中展示的完整 <strong>S3 API</strong> 直链，系统会自动拆分出 Endpoint 和 Bucket，省心省力！
              </div>
            </div>
            {renderAwsCredentialsHelp()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Access Key ID</label>
                <input
                  className="input"
                  placeholder={isEdit ? "留空或保持未更改" : "请填写 S3 凭证中的 Access Key ID"}
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Secret Access Key</label>
                <input
                  className="input"
                  type="password"
                  placeholder={isEdit ? "留空或保持未更改" : "请填写 S3 凭证中的 Secret Access Key"}
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>公开 URL 前缀（可选）</label>
              <input
                className="input"
                placeholder="如：https://img2.yourdomain.com (留空则默认通过图床本域代理路由进行强缓存访问)"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
              />
            </div>
          </>
        )}

        {provider === "oracle" && !isLocal && (
          <>
            <div style={{
              background: "rgba(59, 130, 246, 0.08)",
              borderLeft: "4px solid #3b82f6",
              padding: "10px 14px",
              borderRadius: "0 6px 6px 0",
              fontSize: "12px",
              color: "var(--color-text-secondary)",
              lineHeight: "1.5",
              margin: "8px 0"
            }}>
              <span style={{ fontWeight: "bold", color: "#2563eb", display: "block", marginBottom: 4 }}>
                🍊 提示：系统会自动拼接 Endpoint
              </span>
              我们会根据您填写的 <strong>对象存储命名空间 (Namespace)</strong> 与 <strong>租户区域 (Region)</strong>，在后台自动拼接出标准的 S3 服务终点 Endpoint，无需您手动输入复杂的 URL 链接！
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>对象存储命名空间 (Namespace)</label>
                <input
                  className="input"
                  placeholder="请输入如：ax3o8gxxxxx"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>租户区域 (Region)</label>
                <input
                  className="input"
                  placeholder="如：ap-tokyo-1"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>客户密钥的访问密钥 (Access Key ID)</label>
                <input
                  className="input"
                  placeholder={isEdit ? "留空或保持未更改" : "请填写甲骨文云客户密钥中的 Access Key"}
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>客户密钥的密钥 (Secret Access Key)</label>
                <input
                  className="input"
                  type="password"
                  placeholder={isEdit ? "留空或保持未更改" : "请填写甲骨文云生成时展示的 Secret Key"}
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>存储桶的名称 (Bucket)</label>
              <input
                className="input"
                placeholder="如：momoimage"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>自定义直链域名 (Public URL) (可选)</label>
              <input
                className="input"
                placeholder="若设为公共桶，可填写拼接的 OCI 直链 (留空则默认通过图床系统安全代理流式输出)"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
              />
            </div>
          </>
        )}

        {provider === "s3-general" && !isLocal && (
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
                <input className="input" type="password" placeholder={isEdit ? "******" : ""} value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} />
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

        {provider === "vercel-blob" && !isLocal && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>BLOB_READ_WRITE_TOKEN</label>
            <input className="input" type="password" placeholder={isEdit ? "******" : ""} value={blobToken} onChange={(e) => setBlobToken(e.target.value)} />
          </div>
        )}

        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "保存中..." : (isEdit ? "保存修改" : "添加存储")}
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
    api.listApiTokens().then(setTokens).catch(() => { });
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
