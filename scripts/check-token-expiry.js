import { execSync } from "node:child_process";

const DAY = 86400000;

function parse() {
  try {
    const out = execSync("npm token list --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(out.trim());
  } catch {
    return null;
  }
}

function annotation(msg, level = "notice") {
  console.log(`::${level}::${msg}`);
}

const tokens = parse();
if (!tokens) {
  annotation("无法读取 NPM_TOKEN 过期时间（token 可能无效或已过期），发布继续", "warning");
  process.exit(0);
}

const write = tokens.find((t) => t.permissions?.some((p) => p.action === "write")) || tokens[0];
if (!write?.expiry) {
  annotation("NPM_TOKEN 未设置过期时间或无法解析，发布继续", "warning");
  process.exit(0);
}

const days = Math.floor((new Date(write.expiry) - Date.now()) / DAY);
const when = new Date(write.expiry).toISOString().slice(0, 10);
const msg = `NPM_TOKEN 将于 ${when} 过期，剩余约 ${Math.max(days, 0)} 天`;

if (days < 0) {
  annotation(`NPM_TOKEN 已过期（${when}），请到 npmjs.com 生成新 token 并更新 GitHub Secret NPM_TOKEN`, "error");
  process.exit(1);
}
if (days < 7) {
  annotation(`${msg}，已停止发布。请立即更新 GitHub Secret NPM_TOKEN`, "error");
  process.exit(1);
}
if (days < 14) {
  annotation(`${msg}，请计划更新 GitHub Secret NPM_TOKEN`, "warning");
}
console.log(msg);
process.exit(0);
