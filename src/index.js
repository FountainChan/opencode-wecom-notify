import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// ─── 常量与配置 ──────────────────────────────────────────────

const MAX_CONTENT = 500; // 消息摘要最大长度
const WEBHOOK_URL = (key) =>
  `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`;

// ─── 密钥读取：环境变量 WECOM_BOT_KEY → 工作目录 .env → 插件目录 .env ──

function parseDotEnv(text = "") {
  const key = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    key[m[1]] = value;
  }
  return key;
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

  const candidates = [];
  try {
    candidates.push(path.join(process.cwd(), ".env"));
  } catch {}
  try {
    candidates.push(path.join(path.dirname(fileURLToPath(import.meta.url)), ".env"));
  } catch {}

  for (const file of candidates) {
    const env = loadEnvFile(file);
    if (env.WECOM_BOT_KEY) return env.WECOM_BOT_KEY;
  }
  return "";
}

// ─── 企业微信群机器人 ────────────────────────────────────────

async function sendWecom(content) {
  const key = loadWecomKey();
  if (!key) return;
  try {
    const res = await fetch(WEBHOOK_URL(key), {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ msgtype: "text", text: { content } }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.errcode !== 0) {
      console.error(`[wecom-notify] 企业微信发送失败: errcode=${data.errcode} errmsg=${data.errmsg}`);
    }
  } catch (err) {
    console.error("[wecom-notify] 企业微信发送异常:", err.message);
  }
}

// ─── 工具函数 ────────────────────────────────────────────────

function truncate(text, max = MAX_CONTENT) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function extractText(parts = []) {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

function errText(error) {
  if (!error) return "未知错误";
  if (error.data?.message) return error.data.message;
  if (error.message) return error.message;
  return error.name || JSON.stringify(error);
}

async function getSessionTitle(client, sessionID) {
  try {
    const res = await client.session.get({ path: { id: sessionID } });
    return res?.data?.title || res?.title || "";
  } catch {
    return "";
  }
}

async function getLastAssistantMessage(client, sessionID) {
  try {
    const res = await client.session.messages({ path: { id: sessionID } });
    const messages = res.data || res || [];
    return [...messages].reverse().find((m) => m.info?.role === "assistant");
  } catch {
    return null;
  }
}

// ─── 插件 ────────────────────────────────────────────────────

export default async function wecomNotifyPlugin({ client }) {
  // 去重：sessionID -> 已通知的最后一条 assistant 消息 id
  const notified = new Map();

  return {
    name: "opencode-wecom-notify",

    // —— 回复完成 ——
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const sessionID = event.properties.sessionID;
        if (!sessionID) return;

        const last = await getLastAssistantMessage(client, sessionID);
        if (!last || !last.info) return;

        if (notified.get(sessionID) === last.info.id) return; // 去重
        notified.set(sessionID, last.info.id);

        const title = await getSessionTitle(client, sessionID);
        const text = extractText(last.parts);
        const header = `[opencode] ✅ 回复完成\n${title ? "会话：" + truncate(title, 80) + "\n" : ""}`;
        await sendWecom(header + (truncate(text) || "(无文本输出)"));
        return;
      }

      // —— 出错 ——
      if (event.type === "session.error") {
        const sessionID = event.properties.sessionID;
        const title = sessionID ? await getSessionTitle(client, sessionID) : "";
        const content = `[opencode] ⚠️ 会话出错\n${title ? "会话：" + truncate(title, 80) + "\n" : ""}${truncate(errText(event.properties.error))}`;
        await sendWecom(content);
        return;
      }

      // —— 需要权限确认 ——
      if (event.type === "permission.updated" || event.type === "permission.asked") {
        const p = event.properties || {};
        const sessionID = p.sessionID;
        const title = sessionID ? await getSessionTitle(client, sessionID) : "";
        const content = `[opencode] 🔔 需要权限确认\n${title ? "会话：" + truncate(title, 80) + "\n" : ""}${truncate(p.title || p.pattern || "(无描述)")}`;
        await sendWecom(content);
      }
    },
  };
}
