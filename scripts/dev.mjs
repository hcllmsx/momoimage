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
//   2. 在子项目目录并行启动后端与前端 Vite
//        - Cloudflare: wrangler dev (8787) + vite (5173)
//        - Vercel:     vercel dev  (3000) + vite (5173)
//   3. 浏览器访问 http://localhost:5173
//   4. Ctrl+C 一次性关闭所有进程
//
// 无外部依赖，仅使用 Node.js 内置模块。
// ============================================

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const isWin = platform() === "win32";

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
  console.error(`${C.dim}  cf      → Cloudflare 本地开发 (wrangler 8787 + vite 5173)${C.reset}`);
  console.error(`${C.dim}  vercel  → Vercel 本地开发   (vercel 3000 + vite 5173)${C.reset}`);
  process.exit(1);
}

const subDir = join(rootDir, target);
const backendPort = target === "cloudflare" ? "8787" : "3000";

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
// 2. 定义并行进程
// --------------------------------------------
const procDefs =
  target === "cloudflare"
    ? [
        { name: "worker", cmd: "npx", args: ["wrangler", "dev"], color: C.cyan },
        { name: "vite", cmd: "npm", args: ["run", "dev"], color: C.magenta },
      ]
    : [
        { name: "vercel", cmd: "vercel", args: ["dev"], color: C.cyan },
        { name: "vite", cmd: "npm", args: ["run", "dev"], color: C.magenta },
      ];

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
console.log(`${C.bold}🌐 浏览器访问:${C.reset} ${C.green}http://localhost:5173${C.reset}`);
console.log(`${C.dim}   后端 API:  http://localhost:${backendPort}${C.reset}`);
console.log(`${C.dim}   按 Ctrl+C 一次性退出所有服务${C.reset}\n`);

// Ctrl+C / 终止信号：统一关闭所有子进程
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
