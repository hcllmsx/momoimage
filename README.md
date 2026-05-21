# 默默图床 (MomoImage) 📸

默默图床是一个现代化、全栈图片托管系统。项目提供 **Cloudflare** 与 **Vercel** 两套完全独立的部署方案，全量支持虚拟分类、強缓存直链、多存储后端管理以及 API 开放上传。

---

## 🛠️ 1. Cloudflare 版本部署步骤

Cloudflare 版代码管理在 `cloudflare/` 目录下。

### 本地部署与开发预览
本地联调开发有两种方式：

* **方式 A：纯预览/日常使用（单端口）**
  1. 进入 `cloudflare` 目录安装依赖：
     ```bash
     npm install
     ```
  2. 启动本地 Wrangler 模拟环境：
     ```bash
     npx wrangler dev
     ```
  3. 直接在浏览器打开控制台输出的端口地址（通常为 `http://localhost:8787`）即可。系统会自动托管打包好的静态前端页面与本地模拟 KV/R2。

* **方式 B：前端开发热更新（双端口，推荐在需要修改前端代码时使用）**
  1. 终端 1 启动后端 Worker 服务（监听 8787 端口）：
     ```bash
     npx wrangler dev
     ```
  2. 终端 2 启动前端 Vite 调试服务器（监听 5173 端口）：
     ```bash
     npm run dev
     ```
  3. 浏览器访问 `http://localhost:5173`。Vite 会自动将 `/api` 的接口请求代理至 `8787` 后端。

---

### 线上发布部署
1. **创建云端资源**：
   * 登录 Cloudflare 控制台，进入 **R2 对象存储**，创建一个名为 `momoimage` 的存储桶。
   * 进入 **KV** 页面，创建一个 KV 命名空间（例如命名为 `momoimage-kv`）。
2. **修改本地配置**：
   * 打开 `cloudflare/wrangler.jsonc`，将 `R2_BUCKET` 绑定的 `bucket_name` 填入您的存储桶名称，将 `KV_META` 的 `id` 替换为你在 Cloudflare 上创建的 KV 命名空间 ID。
3. **配置业务密码**：
   * 在 Cloudflare Worker 项目的 **设置 -> 变量和机密** 中，添加变：`ADMIN_PASSWORD`（默认密码为 `momoimage`）
4. **编译与发布**：
   * 在 `cloudflare` 目录下执行命令一键部署：
     ```bash
     npm run deploy
     ```
   * 或者直接在 Cloudflare 控制台连接您的 GitHub 仓库进行持续集成。

---

## 🔺 2. Vercel 版本部署步骤

Vercel 版代码管理在 `vercel/` 目录下。

### 本地部署与开发预览
1. 全局安装 Vercel CLI 工具：
   ```bash
   npm install -g vercel
   ```
2. 进入 `vercel` 目录安装依赖：
   ```bash
   npm install
   ```
3. 关联项目并启动本地 Serverless 仿真环境：
   ```bash
   vercel dev
   ```
   *注意：`vercel dev` 本地调试时，会从您绑定的云端拉取环境变量与存储连接信息。本地上传和读写数据会实时作用于您绑定的真实 Vercel KV 和 Vercel Blob。*

---

### 线上发布部署（最佳实践）

1. **导入项目**：
   * 登录 Vercel 控制台，点击 **"Add New" -> "Project"**，导入您的 GitHub 代码仓库。
   * **Root Directory** 必须选中并填写 **`vercel`** 目录，其他构建命令保持默认，点击 **Deploy** 完成初次部署（初次部署会因缺少变量而暂时无法运行，属正常现象）。
2. **创建并绑定 Vercel KV（存储数据库）**：
   * 进入刚刚创建的项目面板（Project Dashboard），点击顶部导航栏的 **"Storage"** 标签页。
   * 在列表中选择 **"KV"** (或 **"KV (Redis)"**)，点击 **"Create"**，阅读条款后点击 **"Create New"** 并选择 **Connect**（连接）到该项目。
3. **创建并绑定 Vercel Blob（对象存储）**：
   * 同样在 **"Storage"** 页面，选择 **"Blob"**，点击 **"Create"**，确认后将其 **Connect**（连接）到该项目。（Vercel 将自动激活本地 `local-blob` 零配置对象存储）。
4. **手动添加业务环境变量**：
   * 进入项目 **"Settings" -> "Environment Variables"**，手动添加环境变量：`ADMIN_PASSWORD`（管理员登录密码）。
5. **触发 Redeploy**：
   * 回到项目 **"Deployments"** 页面，点击最近一次部署右侧的三个小点，选择 **"Redeploy"**。重新打包完成后，项目即完美上线。

---

## 🔒 3. 核心环境变量对照表

无论部署在哪个平台，请根据需求在控制面板的环境变量设置中提供以下核心变量：

| 变量键名 | 是否必填 | 默认回退值 | 作用说明 |
| :--- | :--- | :--- | :--- |
| `ADMIN_PASSWORD` | **推荐** | `momoimage` | 后台管理登录密码，如果不配置，网页端会展示引导设置 Banner。 |
| `JWT_SECRET` | 可选 | KV 自动生成并安全持久化 | 生成 JWT 用户会话的签名密钥。更改或删除此密钥会使所有已登录设备强制立即下线。 |
| `SITE_URL` | 可选 | 当前请求的 Host 推导 | 图床的公共访问主域，强烈推荐配置以保障图片代理直链地址 100% 对齐。 |
| `MOMO_STORAGE_ROOT` | 可选 | Vercel版: `momoimageVercel`<br/>Cloudflare版: `momoimageCloudflare` | 存储空间中最外层根文件夹名称。**仅限大小写字母与数字**。变更该值不会破坏已上传图片的访问直链。 |

---

## ⚖️ 许可

MIT License.
