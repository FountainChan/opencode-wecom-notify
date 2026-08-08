import fs from "fs";
import os from "os";
import path from "path";

// ─── 常量与配置 ──────────────────────────────────────────────

const DEFAULT_KEY = "";
const MAX_CONTENT = 500; // 消息摘要最大长度
const WEBHOOK_URL = (key) =>
  `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`;

// ─── 企业微信群机器人 ────────────────────────────────────────

async function sendWecom(content) {
  const key = process.env.WECOM_BOT_KEY || DEFAULT_KEY;
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
