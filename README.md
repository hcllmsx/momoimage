# 默默图床 (MomoImage)

默默图床是一个现代化、全栈图片托管系统。项目提供 **Cloudflare** 与 **Vercel** 两套完全独立的部署方案，全量支持虚拟分类、強缓存直链、多存储后端管理以及 API 开放上传。

---

## 0. 本地开发与版本管理

项目根目录的 `VERSION` 文件是版本号唯一来源（semver，如 `1.5.21`）。两个子项目的 `package.json`、`package-lock.json` 以及页脚显示的版本号都由它驱动。

### 一键启动本地开发

在**项目根目录**任选其一：

```bash
npm run dev:cf        # Cloudflare 版：wrangler(50000) + vite(50001)
npm run dev:vercel    # Vercel 版：  vercel dev(50002) + vite(50003)
```

两个版本都是**双进程**架构，浏览器访问对应的 **Vite 前端端口**（Cloudflare 版 `50001`、Vercel 版 `50003`）。

### 本地开发端口分配

为避免与常用端口冲突，本地开发端口从 `50000` 开始分配，可在 `scripts/dev.mjs` 的 `PORTS` 常量中修改：

| 端口 | 用途 |
| :--- | :--- |
| `50000` | Cloudflare wrangler（后端 API） |
| `50001` | Cloudflare vite（前端热更新，**浏览器访问**） |
| `50002` | Vercel vercel dev（后端 API） |
| `50003` | Vercel vite（前端热更新，**浏览器访问**） |

脚本会自动完成：
1. **同步版本号** — 读 `VERSION`，同步到所有 `package.json` / `package-lock.json`
2. **启动后端 + 前端**：
   - Cloudflare 版：wrangler dev（API，50000）+ vite dev（前端，50001）
   - Vercel 版：vercel dev（API，50002）+ vite dev（前端，50003）
3. Vite 会自动把 `/api` 和 `/i` 请求代理到后端端口
4. **Ctrl+C 一次性退出**所有进程

> Vercel 版首次运行前需在 `vercel/` 目录执行一次 `vercel link` 关联项目（项目名填 `momoimage`，可用 `vercel project ls` 确认）。本地开发脚本会自动注入会话级 `JWT_SECRET`，默认密码 `momoimage`，无需 `.env.local` 即可运行。如需连接线上 KV / Blob 的真实数据，参见下方 [Vercel 版本部署步骤](#2-vercel-版本部署步骤)。

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
- **后端** Wrangler dev（`http://localhost:50000`，本地模拟 KV/R2）
- **前端** Vite dev（`http://localhost:50001`，热更新，**浏览器访问此端口**）

Vite 会自动将 `/api` 请求代理至 50000 后端。按 `Ctrl+C` 一次性退出所有服务。

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

脚本会自动完成：
1. **同步版本号** — 读 `VERSION`，同步到所有 `package.json` / `package-lock.json`
2. **自动注入 `JWT_SECRET`** — 为本次开发会话生成一个稳定的 JWT 签名密钥，避免 Vercel edge runtime 冷启动导致登录后被踢出
3. **加载 `vercel/.env.local`**（如果存在）— 把本地环境变量注入 `vercel dev` 子进程（详见下方说明）
4. **启动双进程**：
   - **vercel dev**（`http://localhost:50002`，提供 serverless API）
   - **vite dev**（`http://localhost:50003`，前端热更新，自动把 `/api`、`/i` 代理到 50002，**浏览器访问此端口**）

浏览器访问 `http://localhost:50003` 即可。按 `Ctrl+C` 一次性退出所有服务。

**登录密码**：未配置 `ADMIN_PASSWORD` 时默认为 `momoimage`。

> 首次运行前需在 `vercel/` 目录执行一次 `npm install` 与 `vercel link`（关联项目，项目名填 `momoimage`）。

#### 关于 `vercel link` 关联项目

`vercel link` 会把本地 `vercel/` 目录关联到一个线上 Vercel 项目。关联信息保存在 `vercel/.vercel/project.json`（已被 `.gitignore` 忽略）。

如果关联错了项目（例如项目名填成了 `vercel` 而不是 `momoimage`），`vercel dev` 会从错误项目拉取环境变量，导致本地无法正常工作。重新关联的方法：

```bash
# 删除旧关联
Remove-Item -Recurse -Force vercel/.vercel
Remove-Item -Force vercel/.env.local

# 重新关联到正确项目（项目名必须是线上实际存在的项目名）
cd vercel
vercel link --project momoimage --yes
```

可以用 `vercel project ls` 查看账号下的所有项目及其线上 URL，确认要关联的正确项目名。

#### 关于本地环境变量与 `.env.local`

**默认情况下不需要 `.env.local`** —— 本地用默认密码 `momoimage` + 无 KV/Blob 存储，前端调试和基础功能完全正常。

**为什么不能自动拉取线上凭证？** Vercel 对 Sensitive 环境变量（`ADMIN_PASSWORD`、`KV_URL`、`BLOB_READ_WRITE_TOKEN` 等）有安全保护：即使执行 `vercel env pull`，拉到本地的值也是 `[SENSITIVE]` 占位符而非真实值。因此无法通过 CLI 自动获取线上凭证到本地。

**如需在本地连真实 KV/Blob**，需手动创建 `vercel/.env.local`（已被 `.gitignore` 忽略）并填入真实凭证：

```bash
# vercel/.env.local
ADMIN_PASSWORD=你的线上密码
# Upstash Redis（从 https://console.upstash.com 的 KV 实例详情页复制）
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
# Vercel Blob（从 Vercel 控制台 → Storage → Blob 详情页复制）
BLOB_READ_WRITE_TOKEN=xxx
```

`dev.mjs` 启动时会读取此文件并注入 `vercel dev` 子进程，API 即可使用真实凭证。

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
