#!/usr/bin/env node
// ============================================
// 默默图床 — 一键本地开发启动器
// --------------------------------------------
// 用法:
//   node scripts/dev.mjs cf       # Cloudflare 本地开发
//   node scripts/dev.mjs vercel   # Vercel 本地开发
//
// 流程:
//   1. 同步 VERSION 到所有 package.json / package-lock.json
//   2. 启动本地开发服务：
//        - Cloudflare: wrangler dev (50000, API) + vite dev (50001, 前端热更新)
//        - Vercel:     vercel dev (50002, API) + vite dev (50003, 前端热更新)
//   3. 浏览器访问对应的 vite 端口
//   4. Ctrl+C 一次性关闭所有进程
//
// 端口分配（从 50000 开始，避免与常用端口冲突）：
//   50000 = Cloudflare wrangler（后端 API）
//   50001 = Cloudflare vite（前端）
//   50002 = Vercel vercel dev（后端 API）
//   50003 = Vercel vite（前端）
//   如需修改，调整下方 PORTS 常量即可，vite.config.ts 会自动读取环境变量。
//
// 为什么 Vercel 也要双进程？
//   vercel dev 内部虽会启动 vite，但 vercel.json 的 catch-all rewrite 会导致
//   vite 无法正确加载 JS 模块（index.html 被当作 JS 解析）。因此我们独立启动
//   一个 vite 来处理前端，vercel dev 仅用于提供 serverless API。
//   vite 的 proxy 会把 /api 请求转发到 vercel dev，vercel dev 再路由到
//   serverless function —— 不会死循环，因为 vercel dev 把 /api 路由到 function 而非它的内部 vite。
//
// 无外部依赖，仅使用 Node.js 内置模块。
// ============================================

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { platform } from "node:os";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const isWin = platform() === "win32";

// --------------------------------------------
// 端口分配（从 50000 开始，避免与常用端口冲突）
// 修改这里即可，vite.config.ts 会通过 MOMO_VITE_PORT / MOMO_API_PORT 环境变量自动适配
// --------------------------------------------
const PORTS = {
  cloudflare: { api: 50000, vite: 50001 },
  vercel:     { api: 50002, vite: 50003 },
};

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

// --------------------------------------------
// 解析参数
// --------------------------------------------
const arg = process.argv[2];
const target = arg === "cf" ? "cloudflare" : arg === "vercel" ? "vercel" : null;

if (!target) {
  console.error(`${C.bold}用法: node scripts/dev.mjs cf | vercel${C.reset}`);
  console.error(`${C.dim}  cf      → Cloudflare 本地开发 (wrangler ${PORTS.cloudflare.api} + vite ${PORTS.cloudflare.vite})${C.reset}`);
  console.error(`${C.dim}  vercel  → Vercel 本地开发   (vercel dev ${PORTS.vercel.api} + vite ${PORTS.vercel.vite})${C.reset}`);
  process.exit(1);
}

const subDir = join(rootDir, target);

// --------------------------------------------
// 注入 vite 端口和后端代理目标到环境变量
// vite.config.ts 通过 process.env.MOMO_VITE_PORT / MOMO_API_PORT 读取
// 这样端口只需在 PORTS 常量里改一处，vite 配置自动适配
// --------------------------------------------
process.env.MOMO_VITE_PORT = String(PORTS[target].vite);
process.env.MOMO_API_PORT = String(PORTS[target].api);

// 各 target 的进程定义与访问地址
// 两个版本都是双进程：后端 + 前端 vite，浏览器统一访问各自的 vite 端口
const targetConfig =
  target === "cloudflare"
    ? {
        procs: [
          { name: "worker", cmd: "npx", args: ["wrangler", "dev", "--port", String(PORTS.cloudflare.api)], color: C.cyan },
          { name: "vite", cmd: "npm", args: ["run", "dev"], color: C.magenta },
        ],
        accessUrl: `http://localhost:${PORTS.cloudflare.vite}`,
        apiNote: `http://localhost:${PORTS.cloudflare.api}`,
      }
    : {
        // vercel dev 仅用于提供 serverless API（/api, /i）
        // 前端由独立的 vite 提供，proxy 把 /api /i 转发到 vercel dev
        procs: [
          { name: "vercel", cmd: "vercel", args: ["dev", "--yes", "--listen", String(PORTS.vercel.api)], color: C.cyan },
          { name: "vite", cmd: "npm", args: ["run", "dev"], color: C.magenta },
        ],
        accessUrl: `http://localhost:${PORTS.vercel.vite}`,
        apiNote: `http://localhost:${PORTS.vercel.api}`,
      };

// --------------------------------------------
// 1. 同步版本号
// --------------------------------------------
console.log(`${C.bold}【1/2】同步版本号${C.reset}`);
const syncResult = spawnSync("node", [join(__dirname, "sync-version.mjs")], {
  cwd: rootDir,
  stdio: "inherit",
});
if (syncResult.status !== 0) {
  console.error(`${C.red}版本同步失败，终止启动。${C.reset}`);
  process.exit(syncResult.status ?? 1);
}

// --------------------------------------------
// 1.5. 为本地开发注入稳定的 JWT_SECRET
// --------------------------------------------
// Vercel edge runtime 在 vercel dev 下可能每次请求都冷启动，
// 模块级缓存的 JWT 密钥无法跨请求保持一致 → 登录后立即被踢出（"JWT 无效或已过期"）。
// 这里在会话启动时生成一次，通过环境变量注入子进程，保证整个会话密钥稳定。
// 若用户已自行设置 JWT_SECRET 环境变量（如通过 .env.local），则尊重用户配置。
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  console.log(`${C.dim}[dev] 已自动生成会话级 JWT_SECRET（避免登录后被踢出）${C.reset}`);
}

// --------------------------------------------
// 1.6. 加载 vercel/.env.local（仅 vercel 目标）
// --------------------------------------------
// vercel dev 不会把 .env.local 注入到 serverless function（API），
// 只注入到 devCommand（前端 vite）。而线上 Development 环境的敏感变量
// 会被 Vercel 脱敏为 [SENSITIVE]，vercel dev 拉取后注入的也是 [SENSITIVE]。
// 因此这里手动读 vercel/.env.local，把业务变量注入 process.env，
// vercel dev 子进程继承后才能把真实凭证传给 serverless function。
if (target === "vercel") {
  const envLocalPath = join(subDir, ".env.local");
  try {
    const content = readFileSync(envLocalPath, "utf8");
    let loaded = 0;
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1);
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // 不覆盖已存在的环境变量（用户显式设置的优先）
      if (!process.env[key]) {
        process.env[key] = value;
        loaded++;
      }
    }
    if (loaded > 0) {
      console.log(`${C.dim}[dev] 已从 vercel/.env.local 加载 ${loaded} 个环境变量注入子进程${C.reset}`);
    }
  } catch {
    // .env.local 不存在时静默跳过（用默认值）
  }
}

// --------------------------------------------
// 2. 定义要启动的进程
// --------------------------------------------
const procDefs = targetConfig.procs;

console.log(`\n${C.bold}【2/2】启动本地开发服务${C.reset}`);
console.log(`${C.dim}目录: ${subDir}${C.reset}\n`);

// --------------------------------------------
// 行缓冲前缀输出：按行加前缀，避免跨行错位
// --------------------------------------------
function createPrefixedWriter(prefix) {
  let buf = "";
  return (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      process.stdout.write(prefix + line + "\n");
    }
  };
}

// --------------------------------------------
// 杀掉子进程（Windows 需 taskkill 整棵进程树）
// --------------------------------------------
function killTree(child) {
  if (!child || !child.pid) return;
  try {
    if (isWin) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* ignore */
  }
}

// --------------------------------------------
// 3. 启动所有子进程
// --------------------------------------------
const children = [];
let exiting = false;

function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  console.log(`\n${C.dim}正在关闭所有子进程...${C.reset}`);
  for (const c of children) killTree(c);
  process.exit(code);
}

for (const def of procDefs) {
  const prefix = `${def.color}[${def.name}]${C.reset} `;
  // Windows 上 npm/npx/vercel 是 .cmd 批处理脚本，Node 安全修复后禁止不带 shell 直接 spawn。
  // 这里显式通过 cmd /c 调用，既避免 EINVAL 错误，也避免 shell:true 触发的 DEP0190 弃用警告。
  const fullCmd = isWin ? "cmd" : def.cmd;
  const fullArgs = isWin ? ["/c", def.cmd, ...def.args] : def.args;
  const child = spawn(fullCmd, fullArgs, {
    cwd: subDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  const writeOut = createPrefixedWriter(prefix);
  child.stdout?.on("data", writeOut);
  child.stderr?.on("data", writeOut);
  child.on("error", (err) => {
    process.stderr.write(`${prefix}${C.red}启动失败: ${err.message}${C.reset}\n`);
    if (/ENOENT/.test(err.message)) {
      process.stderr.write(`${prefix}${C.dim}请确认已安装 "${def.cmd}" 并可在 PATH 中找到${C.reset}\n`);
    }
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (exiting) return;
    if (code !== 0 && code !== null) {
      process.stderr.write(`${prefix}${C.red}进程异常退出 (code=${code})${C.reset}\n`);
      shutdown(code);
    }
  });
  children.push(child);
}

// 访问提示
console.log(`${C.green}${C.bold}✓ 本地开发已启动${C.reset}`);
console.log(`${C.bold}🌐 浏览器访问:${C.reset} ${C.green}${targetConfig.accessUrl}${C.reset}`);
if (targetConfig.apiNote) {
  console.log(`${C.dim}   后端 API:  ${targetConfig.apiNote}${C.reset}`);
}
if (target === "vercel") {
  console.log(`${C.dim}   登录密码:  ${process.env.ADMIN_PASSWORD ? "已通过 ADMIN_PASSWORD 环境变量设置" : "momoimage（默认）"}${C.reset}`);
}
console.log(`${C.dim}   按 Ctrl+C 一次性退出所有服务${C.reset}\n`);

// Ctrl+C / 终止信号：统一关闭所有子进程
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
