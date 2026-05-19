# MomoImage Code Wiki

面向代码阅读与二次开发的结构化文档，覆盖整体架构、模块职责、关键类/函数、依赖关系以及运行/部署方式。

## 1. 项目概览

MomoImage（默默图床）是一个为 Cloudflare 平台设计的全栈图片托管系统：前端 React SPA 与后端 Hono API 同仓构建，最终以 Cloudflare Workers（含 Assets）方式部署，使用 Cloudflare KV 存储元数据/配置，使用 R2（或外部对象存储）存放图片二进制数据。

- 仓库根：只有说明文档与工程子目录 [README.md](file:///d:/0_Projects/9.Code/codeProjects/momoimage/README.md)
- 核心工程目录： [cloudflare/](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare)

### 1.1 技术栈

- 语言：TypeScript（前端 TSX，后端 TS）
- 前端：React 19 + Vite 6（入口 [index.html](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/index.html)、[main.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/main.tsx)）
- 后端：Hono v4（Cloudflare Workers runtime；入口 [api/index.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/index.ts)）
- 存储：Cloudflare KV + R2（并支持 S3 兼容、Vercel Blob、Oracle OCI）

依赖与版本见 [package.json](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/package.json)。

## 2. 目录结构

```
momoimage/
  README.md
  cloudflare/
    index.html
    package.json
    tsconfig.json
    vite.config.ts
    wrangler.jsonc
    public/
    src/
      api/                 # Workers 后端（Hono）
        index.ts           # 后端入口、路由装配、SPA fallback
        middleware/        # 认证等中间件
        routes/            # /api 路由实现
        storage/           # 多存储适配层
      client/              # 前端 SPA（React）
        main.tsx
        App.tsx
        components/
        lib/
      shared/              # 前后端共享类型
        types.ts
```

## 3. 整体架构

### 3.1 请求流

- 访问站点（HTML/JS/CSS）：由 Cloudflare Workers Assets 直接返回静态资源
- 管理与上传：前端请求 `/api/*`，由 Hono 路由处理
- 图片直链：统一访问 `/i/<key>`，Worker 代理从真实存储读取并返回强缓存响应

对应的路由装配在 [api/index.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/index.ts#L25-L198)。

### 3.2 核心数据分层

- 物理文件：存储在 R2 或外部对象存储（S3 / Vercel Blob / OCI）
- 元数据与索引：存储在 KV（图片 meta、列表索引、文件夹索引、token、系统密钥等）

共享数据结构定义在 [types.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/shared/types.ts#L1-L149)。

## 4. 关键模块说明

### 4.1 后端（cloudflare/src/api）

#### 4.1.1 入口与路由装配（Hono App）

文件： [index.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/index.ts)

职责：

- 初始化 Hono app、启用 `cors()` 与 `logger()`（全局中间件）
- 对 `/api/*` 每次请求初始化 `StorageManager` 并注入到 `c.set("storageManager", manager)`
- 提供公开路由：
  - `GET /api/info`：系统信息
  - `GET /i/*`：图片代理与强缓存
  - `POST /api/auth/login`：登录（其他 token 管理接口为受保护路由）
- 注册受保护路由并挂载 `authMiddleware`
- SPA fallback：非 `/api/*`、非 `/i/*` 且静态资源 404 时回退到 `index.html`

关键函数：

- `getSiteUrl(c)`：优先 `env.SITE_URL`，否则用当前请求 URL 推导站点根地址（用于拼图片链接等）[index.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/index.ts#L31-L36)

#### 4.1.2 认证中间件（JWT + API Token）

文件： [auth.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/middleware/auth.ts)

职责：

- 支持两种认证头：
  - `Authorization: Bearer <jwt>`：用于管理后台
  - `Authorization: Token <api-token>`：用于开放 API（例如 PicGo/ShareX）
- 统一在路由层通过 `authMiddleware` 保护敏感接口

关键点：

- JWT 密钥获取：优先 `env.JWT_SECRET`，否则从 KV 读取 `momoimage:system:jwt_secret`，不存在则生成并写回
- Token 校验：检查 KV 是否存在 `momoimage:token:<token>`

#### 4.1.3 存储抽象层（多后端适配）

接口定义： [storage/types.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/storage/types.ts)

`StorageAdapter` 统一抽象对象存储操作：

- `put(key, body, contentType, metadata?)`
- `get(key)`
- `delete(key)`
- `list({ prefix?, limit? })`
- `exists(key)`
- `getPublicUrl(key)`

管理器： [StorageManager](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/storage/manager.ts)

职责：

- 初始化加载存储配置：从 KV 读取外部存储配置，并根据 env 绑定自动注入本地 `local-r2`
- 提供默认存储选择逻辑：`getDefault()`
- 动态增删改存储配置：并做敏感字段脱敏与“***hidden*** 回填”
- 运行期按 `storageId` 找到具体 adapter：`getAdapter(id)`

已实现的适配器：

- Cloudflare R2 Binding：[r2-binding.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/storage/r2-binding.ts)
- S3 兼容（动态导入 AWS SDK）：[s3.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/storage/s3.ts)
- Vercel Blob（REST API）：[vercel-blob.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/storage/vercel-blob.ts)

#### 4.1.4 图片直链代理（/i/*）

实现位置： [index.ts:/i/*](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/index.ts#L73-L164)

流程（简化）：

1. 从 path 提取 `key`，做 `decodeURIComponent`
2. 初始化 `StorageManager`
3. 尝试 KV 映射：`momoimage:key:<decodedKey>` -> `imageId`
4. 若命中 imageId，则读取 meta `momoimage:image:<id>`，用 `meta.storageId` 选择 adapter
5. 若默认/指定 adapter 未命中图片，遍历其他启用存储做降级查找
6. 若降级命中：后台异步自愈修复 `key -> id` 映射
7. 返回图片流，并带强缓存头：
   - `Cache-Control: public, max-age=31536000, immutable`

#### 4.1.5 业务路由（/api/*）

路由模块位于： [src/api/routes/](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes)

认证（公开与受保护混合）：

- `POST /api/auth/login`（公开）：校验 `ADMIN_PASSWORD`（默认 `momoimage`），签发 JWT
- `POST /api/auth/token`、`GET /api/auth/tokens`、`DELETE /api/auth/token/:id`（受保护）

上传：

- `POST /api/upload`（受保护）：multipart 上传；可传 `storage` 与 `folderId`
- 关键实现： [upload.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes/upload.ts)

图片管理：

- `GET /api/images`：分页列表（支持 `folderId=all|root|<id>`）
- `GET /api/images/:id`：详情
- `DELETE /api/images/:id`：删除（含缩略图）
- `PUT /api/images/:id/move`：移动
- `POST /api/images/batch/move`：批量移动
- `POST /api/images/batch/delete`：批量删除
- 实现： [images.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes/images.ts)

文件夹（虚拟分类）：

- `GET /api/folders`：列表
- `POST /api/folders`：创建
- `DELETE /api/folders/:id`：删除（将该文件夹下图片迁回 root）
- 实现： [folders.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes/folders.ts)

存储配置：

- `GET /api/storage`：列表（带统计 usedSize/fileCount）
- `POST /api/storage`：新增
- `PUT /api/storage/:id`：更新
- `DELETE /api/storage/:id`：删除
- `POST /api/storage/:id/test`：连通性测试
- 实现： [storage.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes/storage.ts)

### 4.2 前端（cloudflare/src/client）

#### 4.2.1 入口与页面组织

- 入口： [main.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/main.tsx)
- 主容器： [App.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/App.tsx)

特点：

- 无路由库；通过 `activeTab` 在“上传 / 图库 / 存储”之间切换
- 登录态由本地 token 决定（`localStorage.momoimage_token`）
- 统一处理 401：请求层回调触发登出并清理状态

#### 4.2.2 API 客户端封装

文件： [api.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/lib/api.ts)

职责：

- `request()`：统一拼接 `/api`、注入 `Authorization`、处理 401
- `uploadImage()`：使用 XHR 支持上传进度回调（FormData）
- 提供前端用的全部 API 方法：登录、上传、图片 CRUD、文件夹 CRUD、存储配置 CRUD、token 管理、系统信息

#### 4.2.3 主要组件职责

组件目录： [components/](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components)

- 登录： [LoginForm.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/LoginForm.tsx)
- 顶栏： [Header.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/Header.tsx)
- 上传： [UploadZone.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/UploadZone.tsx)
  - 支持拖拽、粘贴、批量队列、20MB 限制、前端生成缩略图、进度条
- 图库： [ImageGrid.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/ImageGrid.tsx)
  - 文件夹视图、分页加载、单图/批量移动与删除、复制直链、预览
- 存储配置与 API Token： [StorageConfig.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/StorageConfig.tsx)
- 链接弹窗： [LinkDialog.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/LinkDialog.tsx)
- Toast： [Toast.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/Toast.tsx)

### 4.3 共享类型（cloudflare/src/shared）

文件： [types.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/shared/types.ts)

用途：

- 前后端共享接口契约（ImageMeta、StorageConfig、UploadResult、SystemInfo 等）
- 降低接口变更的同步成本

## 5. 关键数据结构与 KV 设计

### 5.1 共享类型要点

- `ImageMeta`：图片元数据（id/key/size/mimeType/width/height/uploadedAt/storageId/url/thumbnailUrl/folderId）
- `StorageConfig`：存储配置（支持 `r2-binding | s3 | vercel-blob | oracle`，并带 `isDefault/enabled`）
- `ApiToken`：开放 API Token（创建时返回完整 token，列表时返回脱敏 token）

详见 [types.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/shared/types.ts#L5-L149)。

### 5.2 KV Key 约定（主要）

以下 key 名来自路由实现的实际读写逻辑（上传、列表、直链、认证等），用于理解数据布局：

- 图片元数据：`momoimage:image:<id>` -> `ImageMeta`
- 图片列表索引：`momoimage:image:list` -> `string[]`（保存图片 id 列表）
- key 反查 id：`momoimage:key:<key>` -> `<id>`
- 文件夹列表：`momoimage:folders` -> `Folder[]`
- 文件夹内图片索引：
  - `momoimage:folder:<folderId>:images` -> `string[]`
  - `momoimage:folder:root:images` -> `string[]`
- API Token：
  - `momoimage:token:<token>` -> `ApiToken`
  - `momoimage:token:list` -> `string[]`（保存 token 字符串列表）
- 系统 JWT 密钥（当未配置 `JWT_SECRET`）：`momoimage:system:jwt_secret` -> `<secret>`
- 外部存储配置列表：`momoimage:storage:configs` -> `StorageConfig[]`（不含 local-r2）

## 6. 关键调用链（按用户操作）

### 6.1 登录

1. 前端 [LoginForm.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/LoginForm.tsx) 调用 `api.login(password)`
2. 后端 [routes/auth.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes/auth.ts) 校验 `ADMIN_PASSWORD` 并签发 JWT
3. 前端 `api.setToken()` 写入 `localStorage.momoimage_token`，进入已登录态

### 6.2 上传

1. 前端 [UploadZone.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/UploadZone.tsx) 生成队列，必要时用 Canvas 生成 thumbnail
2. 前端 `api.uploadImage()`（XHR + FormData）上传到 `POST /api/upload?storage=<id>&folderId=<id>`
3. 后端 [routes/upload.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes/upload.ts)：
   - 选择 adapter（默认/指定 storage）
   - `adapter.put()` 上传原图（可选上传缩略图）
   - 写入 KV：meta、索引、key 映射
4. 返回 `UploadResult`（含多种格式链接），前端弹窗复制

### 6.3 图片访问（外链）

1. 浏览器请求 `/i/<key>`
2. Worker 从 KV 查 `key -> id -> meta.storageId`，选择对应 adapter
3. 从存储拉取图片流，并返回强缓存响应头

### 6.4 图库管理（分页/批量）

- 前端 [ImageGrid.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/components/ImageGrid.tsx) 触发动作
- 后端 [routes/images.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes/images.ts) 负责分页查询与批量操作，并维护 KV 索引一致性

## 7. 依赖关系（高层）

### 7.1 模块依赖图（逻辑）

```mermaid
graph TD
  Client[React SPA] --> ApiClient[client/lib/api.ts]
  ApiClient --> Hono[Hono App /api]
  Hono --> Auth[authMiddleware]
  Hono --> Routes[routes/*]
  Routes --> StorageMgr[StorageManager]
  StorageMgr --> KV[KV_META]
  StorageMgr --> R2[R2_BUCKET]
  StorageMgr --> S3[@aws-sdk/client-s3]
  StorageMgr --> Vercel[Vercel Blob REST]
  Hono --> Assets[Workers Assets]
  Assets --> Client
```

### 7.2 关键外部依赖

后端：

- `hono`：Web 框架、路由与中间件
- `@aws-sdk/client-s3`：S3 兼容存储（动态导入）
- `@xmldom/xmldom`：在 Worker runtime 中提供 DOMParser/Node（用于处理某些图片/元数据相关逻辑；全局注入见 [api/index.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/index.ts#L5-L8)）

前端：

- `react` / `react-dom`
- `vite` / `@vitejs/plugin-react`
- `@cloudflare/vite-plugin`：Cloudflare 相关的 Vite 集成

## 8. 运行、开发与部署

### 8.1 前置条件

- Node.js + npm（仓库未锁定具体版本；需能安装并运行 Vite/Wrangler）
- Cloudflare 账号（部署到 Workers）
- Cloudflare 资源：
  - 1 个 KV namespace（绑定名 `KV_META`）
  - 1 个 R2 bucket（绑定名 `R2_BUCKET`）

资源绑定在 [wrangler.jsonc](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/wrangler.jsonc) 中配置。

### 8.2 本地开发（推荐双进程）

在 `cloudflare/` 目录：

1. 安装依赖

```bash
npm install
```

2. 启动 Worker API（需要单独执行，默认端口通常为 8787）

```bash
wrangler dev
```

3. 启动前端开发服务器

```bash
npm run dev
```

说明：

- Vite 会把 `/api` 与 `/i` 代理到 `http://localhost:8787`（见 [vite.config.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/vite.config.ts#L16-L21)）

### 8.3 构建

```bash
npm run build
```

- 产物输出到 `cloudflare/dist`，并在部署时由 Worker 作为静态资产挂载（见 [wrangler.jsonc](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/wrangler.jsonc#L9-L11)）。

### 8.4 部署到 Cloudflare Workers

```bash
npm run deploy
```

### 8.5 环境变量与安全

- `ADMIN_PASSWORD`：管理员密码（不配则默认 `momoimage`；建议在 Cloudflare 控制台以 Secret 配置）
- `JWT_SECRET`：JWT 会话密钥（可选；不配则系统自动生成并写入 KV）
- `SITE_URL`：站点根 URL（可选；不配则后端按请求自动推导）

详细说明见 [README.md](file:///d:/0_Projects/9.Code/codeProjects/momoimage/README.md#L74-L134)。

## 9. 代码导航索引（从这里开始读）

- Worker 入口与总体路由： [api/index.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/index.ts)
- 认证与 Token： [authMiddleware](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/middleware/auth.ts)
- 存储核心： [StorageManager](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/storage/manager.ts)
- 上传实现： [routes/upload.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes/upload.ts)
- 图片管理实现： [routes/images.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/api/routes/images.ts)
- 前端 App： [App.tsx](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/App.tsx)
- 前端 API SDK： [client/lib/api.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/client/lib/api.ts)
- 前后端共享类型： [shared/types.ts](file:///d:/0_Projects/9.Code/codeProjects/momoimage/cloudflare/src/shared/types.ts)

