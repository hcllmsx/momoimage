// ============================================
// 默默图床 — 主应用组件
// ============================================

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import type { SystemInfo, ImageMeta, UploadResult, Folder } from "@shared/types";
import * as api from "./lib/api";
import { LoginForm } from "./components/LoginForm";
import { Header } from "./components/Header";
import { UploadZone } from "./components/UploadZone";
import { ImageGrid } from "./components/ImageGrid";
import { LinkDialog } from "./components/LinkDialog";
import { StorageConfig } from "./components/StorageConfig";
import { ToastContainer, useToast } from "./components/Toast";

// ========= Toast 上下文 =========
interface ToastContextValue {
  showToast: (message: string, type?: "success" | "error") => void;
}
export const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});
export const useToastContext = () => useContext(ToastContext);

// ========= 应用 =========
type Tab = "upload" | "images" | "storage";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(api.isLoggedIn());
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [linkDialogData, setLinkDialogData] = useState<UploadResult | null>(null);
  const [images, setImages] = useState<ImageMeta[]>([]);
  const [totalImages, setTotalImages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [domainBannerDismissed, setDomainBannerDismissed] = useState(
    localStorage.getItem("momoimage_domain_banner_dismissed") === "true"
  );
  const { toasts, showToast, removeToast } = useToast();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // 加载文件夹列表
  const loadFolders = useCallback(async () => {
    try {
      const list = await api.getFolders();
      setFolders(list);
    } catch (err) {
      console.error("Failed to load folders:", err);
    }
  }, []);

  useEffect(() => {
    if (loggedIn) {
      loadFolders();
    }
  }, [loggedIn, loadFolders]);

  // 获取系统信息
  useEffect(() => {
    api.getSystemInfo().then(setSystemInfo).catch(console.error);
  }, []);

  // 登录后加载图片
  const loadImages = useCallback(async (p = 1, folderId = currentFolderId) => {
    setLoading(true);
    try {
      const result = await api.getImages(p, 20, folderId || undefined);
      setImages(p === 1 ? result.items : (prev) => [...prev, ...result.items]);
      setTotalImages(result.total);
      setPage(p);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, currentFolderId]);

  useEffect(() => {
    if (loggedIn) {
      loadImages(1, currentFolderId);
    }
  }, [loggedIn, currentFolderId, loadImages]);

  const handleLogin = () => setLoggedIn(true);

  const handleLogout = () => {
    api.clearToken();
    setLoggedIn(false);
    setImages([]);
    setFolders([]);
    setCurrentFolderId(null);
  };

  const handleUploadSuccess = (results: UploadResult[]) => {
    if (results.length === 1) {
      setLinkDialogData(results[0]);
    }
    showToast(`成功上传 ${results.length} 张图片`, "success");
    loadImages(1, currentFolderId); // 刷新列表
    loadFolders(); // 刷新分类统计数
  };

  const handleDeleteImage = async (id: string) => {
    try {
      await api.deleteImage(id);
      setImages((prev) => prev.filter((img) => img.id !== id));
      setTotalImages((prev) => prev - 1);
      showToast("图片已删除", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败", "error");
    }
  };

  const handleCreateFolder = async (name: string) => {
    const newFolder = await api.createFolder(name);
    setFolders((prev) => [...prev, newFolder]);
    showToast(`分类 "${name}" 创建成功`, "success");
  };

  const handleDeleteFolder = async (id: string) => {
    await api.deleteFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setCurrentFolderId(null); // 安全返回根目录
    showToast("分类已解散，图片已放回根目录", "success");
  };

  const handleMoveImage = async (imageId: string, folderId: string | null) => {
    await api.moveImage(imageId, folderId || undefined);
    // 从当前列表视图中安全过滤/调整
    if (currentFolderId !== folderId) {
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      setTotalImages((prev) => prev - 1);
    } else {
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId ? { ...img, folderId: folderId || undefined } : img
        )
      );
    }
  };

  const handleCopyLink = (image: ImageMeta) => {
    const siteUrl = systemInfo?.siteUrl || "";
    const imageUrl = `${siteUrl}/i/${image.key}`;
    setLinkDialogData({
      id: image.id,
      url: imageUrl,
      originalName: image.originalName,
      size: image.size,
      mimeType: image.mimeType,
      links: {
        url: imageUrl,
        markdown: `![${image.originalName}](${imageUrl})`,
        html: `<img src="${imageUrl}" alt="${image.originalName}" />`,
        bbcode: `[img]${imageUrl}[/img]`,
      },
    });
  };

  const dismissDomainBanner = () => {
    setDomainBannerDismissed(true);
    localStorage.setItem("momoimage_domain_banner_dismissed", "true");
  };

  // 需要初始化配置
  if (systemInfo?.needSetup) {
    return (
      <ToastContext.Provider value={{ showToast }}>
        <div className="login-container">
          <div className="login-card card">
            <div className="card__body" style={{ padding: 32 }}>
              <div className="login-logo">M</div>
              <h1 className="login-title">默默图床</h1>
              <p className="login-subtitle">MomoImage · 初始配置</p>
              <div style={{
                background: "rgba(251, 191, 36, 0.08)",
                border: "1px solid rgba(251, 191, 36, 0.2)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
                textAlign: "left",
                fontSize: 13,
                lineHeight: 1.8,
              }}>
                <p style={{ fontWeight: 600, color: "var(--color-warning)", marginBottom: 8 }}>
                  ⚠️ 还需要一步配置
                </p>
                <p>请在 Cloudflare 控制台完成以下设置：</p>
                <ol style={{ paddingLeft: 20, margin: "8px 0" }}>
                  <li>进入你的 Worker <strong>momoimage</strong></li>
                  <li>点击顶部的 <strong>设置</strong> 标签</li>
                  <li>在 <strong>变量和机密</strong> 区域点击「添加」</li>
                  <li>名称填 <code style={{ background: "var(--color-bg-surface)", padding: "1px 6px", borderRadius: 4 }}>ADMIN_PASSWORD</code></li>
                  <li>值填入你想要的登录密码</li>
                  <li>类型选择 <strong>机密 (Secret)</strong></li>
                  <li>保存后重新部署</li>
                </ol>
                <p style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
                  设置完成后刷新此页面即可开始使用。
                </p>
              </div>
            </div>
          </div>
        </div>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </ToastContext.Provider>
    );
  }

  // 未登录 → 显示登录
  if (!loggedIn) {
    return (
      <ToastContext.Provider value={{ showToast }}>
        <LoginForm onLogin={handleLogin} />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </ToastContext.Provider>
    );
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div className="app-layout">
        <Header onLogout={handleLogout} />

        <main className="app-main">
          {/* 域名提示 */}
          {systemInfo && !systemInfo.hasCustomDomain && !domainBannerDismissed && (
            <div className="domain-banner">
              <span className="domain-banner__icon">⚠️</span>
              <span>
                当前使用的是默认域名，建议绑定自定义域名以获得更好的访问体验。
                在 Cloudflare 控制台的 Workers 设置中添加自定义域名，并更新 SITE_URL 环境变量。
              </span>
              <button className="domain-banner__close" onClick={dismissDomainBanner}>
                ✕
              </button>
            </div>
          )}

          {/* 导航标签 */}
          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === "upload" ? "nav-tab--active" : ""}`}
              onClick={() => setActiveTab("upload")}
            >
              📤 上传
            </button>
            <button
              className={`nav-tab ${activeTab === "images" ? "nav-tab--active" : ""}`}
              onClick={() => setActiveTab("images")}
            >
              🖼️ 图库 ({totalImages})
            </button>
            <button
              className={`nav-tab ${activeTab === "storage" ? "nav-tab--active" : ""}`}
              onClick={() => setActiveTab("storage")}
            >
              💾 存储
            </button>
          </div>

          {/* 上传页 */}
          {activeTab === "upload" && (
            <UploadZone onUploadSuccess={handleUploadSuccess} />
          )}

          {/* 图库页 */}
          {activeTab === "images" && (
            <ImageGrid
              images={images}
              loading={loading}
              hasMore={images.length < totalImages}
              onLoadMore={() => loadImages(page + 1)}
              onDelete={handleDeleteImage}
              onCopyLink={handleCopyLink}
              folders={folders}
              currentFolderId={currentFolderId}
              onFolderChange={setCurrentFolderId}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveImage={handleMoveImage}
            />
          )}

          {/* 存储配置页 */}
          {activeTab === "storage" && <StorageConfig />}
        </main>

        {/* 链接弹窗 */}
        {linkDialogData && (
          <LinkDialog
            data={linkDialogData}
            onClose={() => setLinkDialogData(null)}
          />
        )}

        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    </ToastContext.Provider>
  );
}
