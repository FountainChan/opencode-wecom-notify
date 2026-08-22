// 企业微信 UTF-8 发送验证脚本（避免 Windows 终端 curl 的编码问题）
// 用法: node scripts/send-test.js "可选自定义内容"
// 密钥来源与插件一致：环境变量、OpenCode 全局配置、工作目录、脚本目录
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const DEFAULT_CONTENT =
  "[opencode-wecom-notify] UTF-8 编码验证：对话状态推送正常，中文无乱码。";

function parseDotEnv(text = "") {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function loadEnvFile(file) {
  try {
    return parseDotEnv(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function loadWecomKey() {
  if (process.env.WECOM_BOT_KEY) return process.env.WECOM_BOT_KEY;
  for (const file of [
    path.join(os.homedir(), ".config", "opencode", ".env"),
    path.join(process.cwd(), ".env"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".env"),
  ]) {
    const value = loadEnvFile(file).WECOM_BOT_KEY;
    if (value) return value;
  }
  return "";
}

const key = loadWecomKey();
const content = process.argv[2] || DEFAULT_CONTENT;

if (!key) {
  console.error("缺少企业微信机器人 key：请设置 WECOM_BOT_KEY 或在 ~/.config/opencode/.env 中配置");
  process.exit(1);
}

const url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ msgtype: "text", text: { content } }),
});
const data = await res.json();
console.log("发送结果:", JSON.stringify(data));
if (data.errcode !== 0) process.exit(1);
