#!/usr/bin/env node
// ============================================
// 默默图床 — 版本号同步脚本
// --------------------------------------------
// 以根目录 VERSION 文件为唯一真相来源，将版本号同步到：
//   - 根目录 package.json
//   - cloudflare/package.json + cloudflare/package-lock.json
//   - vercel/package.json    + vercel/package-lock.json
//
// 用法:
//   node scripts/sync-version.mjs            # 同步
//   node scripts/sync-version.mjs --check    # 仅校验，不写文件（CI 可用）
//
// 该脚本无外部依赖，仅使用 Node.js 内置模块。
// ============================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const CHECK_ONLY = process.argv.includes("--check");

// ANSI 颜色（Windows 10+ / 现代终端均支持）
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

// --------------------------------------------
// 1. 读取并校验 VERSION 文件
// --------------------------------------------
const versionPath = join(rootDir, "VERSION");
if (!existsSync(versionPath)) {
  console.error(`${C.red}[sync-version] 未找到 VERSION 文件: ${versionPath}${C.reset}`);
  console.error(`${C.dim}请在项目根目录创建 VERSION 文件并写入 semver 版本号，例如: 1.5.21${C.reset}`);
  process.exit(1);
}

const version = readFileSync(versionPath, "utf8").trim();

if (!version) {
  console.error(`${C.red}[sync-version] VERSION 文件为空${C.reset}`);
  process.exit(1);
}

// semver 简单校验: x.y.z 或 x.y.z-prerelease
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`${C.red}[sync-version] VERSION 文件内容不是合法的 semver 版本号: "${version}"${C.reset}`);
  console.error(`${C.dim}合法示例: 1.5.21 / 2.0.0-beta.1${C.reset}`);
  process.exit(1);
}

console.log(`${C.cyan}[sync-version]${C.reset} 目标版本: ${C.green}${version}${C.reset}${CHECK_ONLY ? `${C.dim} (仅校验模式)${C.reset}` : ""}`);

// --------------------------------------------
// 2. 工具函数：检测原文件缩进风格，写回时保持一致
// --------------------------------------------
/**
 * 检测 JSON 文本的缩进风格。
 * - 返回 null  表示原文件是单行紧凑格式
 * - 返回字符串 表示使用的缩进（如 "  " / "    "）
 */
function detectIndent(raw) {
  if (!raw.includes("\n")) return null;
  const lines = raw.split("\n");
  for (const line of lines) {
    const m = line.match(/^(\s+)\S/);
    if (m) return m[1];
  }
  return "  ";
}

function stringify(data, indent) {
  return indent === null
    ? JSON.stringify(data)
    : JSON.stringify(data, null, indent);
}

// --------------------------------------------
// 3. 更新 package.json
// --------------------------------------------
function updatePackageJson(filePath, label) {
  if (!existsSync(filePath)) {
    console.warn(`${C.yellow}[sync-version] 跳过不存在的文件: ${label}${C.reset}`);
    return false;
  }
  const raw = readFileSync(filePath, "utf8");
  const indent = detectIndent(raw);
  const data = JSON.parse(raw);

  if (data.version === version) {
    console.log(`${C.dim}[sync-version] ${label} 已是 ${version}，无需更新${C.reset}`);
    return false;
  }

  const before = data.version ?? "(空)";
  data.version = version;

  if (CHECK_ONLY) {
    console.error(`${C.red}[sync-version] ${label} 版本不一致: ${before} → ${version}（仅校验模式，未写入）${C.reset}`);
    return true; // 标记为需要更新
  }

  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  writeFileSync(filePath, stringify(data, indent) + trailingNewline);
  console.log(`${C.green}[sync-version] ${label}: ${before} → ${version}${C.reset}`);
  return true;
}

// --------------------------------------------
// 4. 更新 package-lock.json（仅顶层与 root 包的 version）
// --------------------------------------------
function updatePackageLock(filePath, label) {
  if (!existsSync(filePath)) {
    // package-lock.json 可能尚未生成（未 npm install），静默跳过
    return false;
  }
  const raw = readFileSync(filePath, "utf8");
  const indent = detectIndent(raw) ?? "  ";
  const data = JSON.parse(raw);

  let changed = false;
  const before = data.version;

  if (data.version && data.version !== version) {
    data.version = version;
    changed = true;
  }
  // package-lock.json v3 中 root 包位于 packages[""]
  if (data.packages && data.packages[""]) {
    const rootPkg = data.packages[""];
    if (rootPkg.version && rootPkg.version !== version) {
      rootPkg.version = version;
      changed = true;
    }
  }

  if (!changed) {
    console.log(`${C.dim}[sync-version] ${label} 已是 ${version}，无需更新${C.reset}`);
    return false;
  }

  if (CHECK_ONLY) {
    console.error(`${C.red}[sync-version] ${label} 版本不一致: ${before} → ${version}（仅校验模式，未写入）${C.reset}`);
    return true;
  }

  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  writeFileSync(filePath, stringify(data, indent) + trailingNewline);
  console.log(`${C.green}[sync-version] ${label}: ${before} → ${version}${C.reset}`);
  return true;
}

// --------------------------------------------
// 5. 执行同步
// --------------------------------------------
const tasks = [
  { kind: "pkg",  path: join(rootDir, "package.json"),                       label: "package.json" },
  { kind: "pkg",  path: join(rootDir, "cloudflare", "package.json"),         label: "cloudflare/package.json" },
  { kind: "lock", path: join(rootDir, "cloudflare", "package-lock.json"),    label: "cloudflare/package-lock.json" },
  { kind: "pkg",  path: join(rootDir, "vercel", "package.json"),             label: "vercel/package.json" },
  { kind: "lock", path: join(rootDir, "vercel", "package-lock.json"),        label: "vercel/package-lock.json" },
];

let changedCount = 0;
for (const t of tasks) {
  const ok = t.kind === "pkg"
    ? updatePackageJson(t.path, t.label)
    : updatePackageLock(t.path, t.label);
  if (ok) changedCount++;
}

if (CHECK_ONLY && changedCount > 0) {
  console.error(`${C.red}[sync-version] 校验失败：${changedCount} 个文件版本与 VERSION 不一致${C.reset}`);
  process.exit(1);
}

if (changedCount === 0) {
  console.log(`${C.cyan}[sync-version]${C.reset} 所有版本号已是最新 ${C.green}✓${C.reset}`);
} else {
  console.log(`${C.cyan}[sync-version]${C.reset} 共更新 ${changedCount} 个文件 ${C.green}✓${C.reset}`);
}
