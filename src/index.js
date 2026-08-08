import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// ─── 常量与配置 ──────────────────────────────────────────────

const MAX_CONTENT = 500; // 消息摘要最大长度
const WEBHOOK_URL = (key) =>
  `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`;

// 三条入口的启用开关
const NOTIFY_AGENT = "wecom-notify"; // 入口1：指定 agent 才通知
const NOTIFY_KEYWORDS = ["微信", "wecom", "wecom-notify"]; // 入口3：对话中明确提到才通知

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

// ─── 命令定义与配置同步（入口2：/wecom-notify）────────────────

function getCommands() {
  return {
    "wecom-notify": {
      description: "(wecom-notify) 开启本会话的微信通知：回复完成/出错/权限确认时推送企业微信",
      template: `<command-instruction>
You are now in WECOM NOTIFY mode. This session will send WeChat Work notifications when the assistant finishes replying, encounters an error, or asks for permission.
Proceed with the task normally.
</command-instruction>

<user-task>
$ARGUMENTS
</user-task>`,
      argumentHint: '"task description"',
    },
  };
}

function syncCommandsToFile(configDir) {
  const commands = getCommands();
  const configFilePath = path.join(configDir, "opencode.json");
  try {
    let parsed = {};
    try {
      parsed = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
    } catch {}

    const existing = parsed.command || {};

    // 移除过期的 wecom-notify 命令
    for (const key of Object.keys(existing)) {
      if (existing[key]?.__cc_source === "wecom-notify") {
        delete existing[key];
      }
    }

    // 注入最新命令
    for (const [name, def] of Object.entries(commands)) {
      existing[name] = { ...def, __cc_source: "wecom-notify" };
    }

    parsed.command = existing;
    fs.writeFileSync(configFilePath, JSON.stringify(parsed, null, 2), "utf-8");
    console.log(`[wecom-notify] Synced ${Object.keys(commands).length} command(s) to opencode.json`);
  } catch (e) {
    console.error(`[wecom-notify] Failed to sync commands:`, e.message);
  }
}

// ─── 插件 ────────────────────────────────────────────────────

export default async function wecomNotifyPlugin({ client }) {
  // 已启用通知的会话 ID（仅入口命中后加入，会话内持续生效）
  const enabled = new Set();
  // 去重：sessionID -> 已通知的最后一条 assistant 消息 id
  const notified = new Map();

  // 同步命令到 opencode.json，供桌面端 UI 自动补全
  const configDir = path.join(os.homedir(), ".config", "opencode");
  try {
    syncCommandsToFile(configDir);
  } catch {}

  return {
    name: "opencode-wecom-notify",

    // 注入 /wecom-notify 命令（入口2）
    config: async (inputConfig) => {
      const existing = inputConfig.command || {};
      inputConfig.command = { ...existing, ...getCommands() };
    },

    // 三入口门控：命中任一入口即启用本会话通知
    "chat.message": async (input, output) => {
      const parts = input.parts || output?.parts || [];
      const text = extractText(parts);

      // 入口2：/wecom-notify 命令
      if (/\/wecom-notify/i.test(text)) {
        enabled.add(input.sessionID);
        console.log(`[wecom-notify] 已通过命令启用通知 (session=${input.sessionID})`);
        return;
      }

      // 入口1：选定 wecom-notify agent
      if (input.agent === NOTIFY_AGENT) {
        enabled.add(input.sessionID);
        return;
      }

      // 入口3：对话中明确提到"微信"/"wecom"
      const lower = text.toLowerCase();
      if (NOTIFY_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
        enabled.add(input.sessionID);
        console.log(`[wecom-notify] 检测到通知意图，已启用 (session=${input.sessionID})`);
      }
    },

    event: async ({ event }) => {
      const sessionID = event.properties?.sessionID;
      // 门控：未启用通知的会话一律静默
      if (!sessionID || !enabled.has(sessionID)) return;

      // —— 回复完成 ——
      if (event.type === "session.idle") {
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
        const title = sessionID ? await getSessionTitle(client, sessionID) : "";
        const content = `[opencode] ⚠️ 会话出错\n${title ? "会话：" + truncate(title, 80) + "\n" : ""}${truncate(errText(event.properties.error))}`;
        await sendWecom(content);
        return;
      }

      // —— 需要权限确认 ——（permission.asked 为有效事件；permission.updated 不存在）
      if (event.type === "permission.asked") {
        const p = event.properties || {};
        const title = sessionID ? await getSessionTitle(client, sessionID) : "";
        const detail = p.permission
          ? `${p.permission}${p.patterns?.length ? " " + p.patterns.join(", ") : ""}`
          : (p.patterns?.length ? p.patterns.join(", ") : "(无描述)");
        const content = `[opencode] 🔔 需要权限确认\n${title ? "会话：" + truncate(title, 80) + "\n" : ""}${truncate(detail)}`;
        await sendWecom(content);
      }
    },
  };
}
