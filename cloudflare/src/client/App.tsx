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
import { Footer } from "./components/Footer";

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
  const [activeTab, setActiveTab] = useState<Tab>(
    () => (localStorage.getItem("momoimage:activeTab") as Tab) || "upload"
  );
  const [linkDialogData, setLinkDialogData] = useState<UploadResult | null>(null);
  const [images, setImages] = useState<ImageMeta[]>([]);
  const [totalImages, setTotalImages] = useState(0);
  const [systemTotalImages, setSystemTotalImages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [domainBannerDismissed, setDomainBannerDismissed] = useState(
    localStorage.getItem("momoimage_domain_banner_dismissed") === "true"
  );
  const { toasts, showToast, removeToast } = useToast();

  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("momoimage:theme") as "light" | "dark") || "light"
  );

  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // 保存当前选项卡状态至 localStorage
  useEffect(() => {
    localStorage.setItem("momoimage:activeTab", activeTab);
  }, [activeTab]);

  // 挂载主题类名
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light-theme");
    } else {
      root.classList.remove("light-theme");
    }
    localStorage.setItem("momoimage:theme", theme);
  }, [theme]);

  // 加载系统级全部图片总数统计
  const loadSystemStats = useCallback(async () => {
    try {
      const result = await api.getImages(1, 1, "all");
      setSystemTotalImages(result.total);
    } catch (err) {
      console.error("Failed to load system stats:", err);
    }
  }, []);

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
      loadSystemStats();
    }
  }, [loggedIn, loadFolders, loadSystemStats]);

  // 获取系统信息
  useEffect(() => {
    api.getSystemInfo().then(setSystemInfo).catch(console.error);
  }, []);

  // 登录后加载图片
  const loadImages = useCallback(async (p = 1, folderId = currentFolderId) => {
    setLoading(true);
    if (p === 1) {
      setImages([]); // 切换分类或加载第一页时，立即清空旧数据，防止残影与视觉闪烁！
    }
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
    setActiveTab("upload");
    localStorage.removeItem("momoimage:activeTab");
  };

  // 监听全局 API 未授权错误（如 JWT 无效/过期），自动清理状态并登出
  useEffect(() => {
    api.onUnauthorized(() => {
      handleLogout();
    });
  }, []);

  const handleUploadSuccess = (results: UploadResult[]) => {
    if (results.length === 1) {
      setLinkDialogData(results[0]);
    }
    showToast(`成功上传 ${results.length} 张图片`, "success");
    loadImages(1, currentFolderId); // 刷新列表
    loadFolders(); // 刷新分类统计数
    setSystemTotalImages((prev) => prev + results.length);
  };

  const handleDeleteImage = async (id: string) => {
    try {
      await api.deleteImage(id);
      setImages((prev) => prev.filter((img) => img.id !== id));
      setTotalImages((prev) => prev - 1);
      setSystemTotalImages((prev) => prev - 1);
      showToast("图片已删除", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败", "error");
    }
  };

  const handleDeleteMultipleImages = async (ids: string[]) => {
    try {
      await api.deleteMultipleImages(ids);
      setImages((prev) => prev.filter((img) => !ids.includes(img.id)));
      setTotalImages((prev) => prev - ids.length);
      setSystemTotalImages((prev) => prev - ids.length);
      showToast(`成功批量删除 ${ids.length} 张图片`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "批量删除失败", "error");
      loadImages(1, currentFolderId);
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

  const handleMoveMultipleImages = async (ids: string[], folderId: string | null) => {
    try {
      await api.moveMultipleImages(ids, folderId || undefined);
      if (currentFolderId !== folderId) {
        setImages((prev) => prev.filter((img) => !ids.includes(img.id)));
        setTotalImages((prev) => prev - ids.length);
      } else {
        setImages((prev) =>
          prev.map((img) =>
            ids.includes(img.id) ? { ...img, folderId: folderId || undefined } : img
          )
        );
      }
      showToast(`成功将 ${ids.length} 张图片移至目标分类`, "success");
      loadFolders(); // 刷新分类统计数
    } catch (err) {
      showToast(err instanceof Error ? err.message : "批量移动失败", "error");
      loadImages(1, currentFolderId);
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

  // 未登录 → 显示登录
  if (!loggedIn) {
    return (
      <ToastContext.Provider value={{ showToast }}>
        <div className="app-layout" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LoginForm
              onLogin={handleLogin}
              isDefaultPassword={systemInfo?.isDefaultPassword}
            />
          </div>
          <Footer />
        </div>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </ToastContext.Provider>
    );
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div className="app-layout">
        <Header
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          onLogout={handleLogout}
        />

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
              🖼️ 图库 {systemTotalImages > 0 ? `(${systemTotalImages})` : ""}
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
              onDeleteMultiple={handleDeleteMultipleImages}
              onCopyLink={handleCopyLink}
              folders={folders}
              currentFolderId={currentFolderId}
              onFolderChange={setCurrentFolderId}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveImage={handleMoveImage}
              onMoveMultiple={handleMoveMultipleImages}
            />
          )}

          {/* 存储配置页 */}
          {activeTab === "storage" && <StorageConfig />}
        </main>

        <Footer />

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
