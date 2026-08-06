# 默默图床 (MomoImage)

默默图床是一个现代化、全栈图片托管系统。项目提供 **Cloudflare** 与 **Vercel** 两套完全独立的部署方案，全量支持虚拟分类、強缓存直链、多存储后端管理以及 API 开放上传。

---

## 0. 本地开发与版本管理

项目根目录的 `VERSION` 文件是版本号唯一来源（semver，如 `1.5.21`）。两个子项目的 `package.json`、`package-lock.json` 以及页脚显示的版本号都由它驱动。

### 一键启动本地开发

在**项目根目录**任选其一：

```bash
npm run dev:cf        # Cloudflare 版：wrangler(8787) + vite(5173)
npm run dev:vercel    # Vercel 版：  vercel(3000)  + vite(5173)
```

脚本会自动完成：
1. **同步版本号** — 读 `VERSION`，同步到所有 `package.json` / `package-lock.json`
2. **并行启动后端与前端** — 后端跑 API，前端跑 Vite 热更新
3. **浏览器访问** `http://localhost:5173` 即可（Vite 自动代理 `/api` 到后端）
4. **Ctrl+C 一次性退出**所有进程

> Vercel 版首次运行前需在 `vercel/` 目录执行一次 `vercel link` 关联项目，之后即可用根目录脚本启动。

### 发版 / 改版本号

1. 修改根目录 `VERSION` 文件为新版本号
2. 运行 `npm run sync`（或任意 `dev` / `build` 命令，会自动先同步）
3. 提交 `VERSION` 及被脚本更新过的 `package.json` / `package-lock.json`

### 其他命令

```bash
npm run sync          # 手动同步版本号
npm run sync:check    # 仅校验（CI 用，不一致时退出码非 0）
npm run build:cf      # 构建 Cloudflare 前端
npm run build:vercel  # 构建 Vercel 前端
npm run deploy:cf     # 部署 Cloudflare Worker
```

---

## 1. Cloudflare 版本部署步骤

Cloudflare 版代码管理在 `cloudflare/` 目录下。

### 本地部署与开发预览

在项目根目录执行：

```bash
npm run dev:cf
```

脚本会自动同步版本号，然后在 `cloudflare/` 目录并行启动：
- **后端** Wrangler dev（`http://localhost:8787`，本地模拟 KV/R2）
- **前端** Vite dev（`http://localhost:5173`，热更新）

浏览器访问 `http://localhost:5173` 即可，Vite 会自动将 `/api` 请求代理至 8787 后端。按 `Ctrl+C` 一次性退出所有服务。

> 首次运行前请在 `cloudflare/` 目录执行一次 `npm install` 安装依赖。

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

## 2. Vercel 版本部署步骤

Vercel 版代码管理在 `vercel/` 目录下。

### 本地部署与开发预览

在项目根目录执行：

```bash
npm run dev:vercel
```

脚本会自动同步版本号，然后在 `vercel/` 目录并行启动：
- **后端** Vercel dev（`http://localhost:3000`，从云端拉取环境变量与存储连接）
- **前端** Vite dev（`http://localhost:5173`，热更新）

浏览器访问 `http://localhost:5173` 即可，Vite 会自动将 `/api` 请求代理至 3000 后端。按 `Ctrl+C` 一次性退出所有服务。

> 首次运行前需在 `vercel/` 目录执行一次 `npm install` 与 `vercel link`（关联项目，用于拉取环境变量）。`vercel dev` 本地上传和读写会实时作用于您绑定的真实 Vercel KV 和 Vercel Blob。

---

### 线上发布部署（最佳实践）

1. **导入项目**：
   * 登录 Vercel 控制台，点击 **"Add New" -> "Project"**，导入您的 GitHub 代码仓库。
   * **Root Directory** 必须选中并填写 **`vercel`** 目录，其他构建命令保持默认，点击 **Deploy** 完成初次部署（初次部署会因缺少变量而暂时无法运行，属正常现象）。
2. **创建并绑定 Vercel KV（存储数据库）**：
   * 进入刚刚创建的项目面板（Project Dashboard），点击顶部导航栏的 **"Storage"** 标签页。
   * 在列表中选择 **Upstash** ，然后选择 **Upstash for Redis**，创建后选择 **Connect**（连接）到该项目。
3. **创建并绑定 Vercel Blob（对象存储）**：
   * 同样在 **"Storage"** 页面，选择 **"Blob"**，点击 **"Create"**，确认后将其 **Connect**（连接）到该项目。（Vercel 将自动激活本地 `local-blob` 零配置对象存储）。
4. **手动添加业务环境变量**：
   * 进入项目 **"Settings" -> "Environment Variables"**，手动添加环境变量：`ADMIN_PASSWORD`（管理员登录密码）。
5. **触发 Redeploy**：
   * 回到项目 **"Deployments"** 页面，点击最近一次部署右侧的三个小点，选择 **"Redeploy"**。重新打包完成后，项目即完美上线。

---

## 3. 核心环境变量对照表

无论部署在哪个平台，请根据需求在控制面板的环境变量设置中提供以下核心变量：

| 变量键名 | 是否必填 | 默认回退值 | 作用说明 |
| :--- | :--- | :--- | :--- |
| `ADMIN_PASSWORD` | **推荐** | `momoimage` | 后台管理登录密码，如果不配置，网页端会展示引导设置 Banner。 |
| `JWT_SECRET` | 可选 | KV 自动生成并安全持久化 | 生成 JWT 用户会话的签名密钥。更改或删除此密钥会使所有已登录设备强制立即下线。 |
| `SITE_URL` | 可选 | 当前请求的 Host 推导 | 图床的公共访问主域，强烈推荐配置以保障图片代理直链地址 100% 对齐。 |
| `MOMO_STORAGE_ROOT` | 可选 | Vercel版: `momoimageVercel`<br/>Cloudflare版: `momoimageCloudflare` | 存储空间中最外层根文件夹名称。**仅限大小写字母与数字**。变更该值不会破坏已上传图片的访问直链。 |

---

## 许可

MIT License.
