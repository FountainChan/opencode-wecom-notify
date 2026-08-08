// 链路测试：模拟 chat.message → session.idle / session.error / permission.asked
// 拦截 fetch 不真实发送；重定向 homedir 不污染真实 opencode.json。
// 用法：node scripts/test-flow.js
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 1) 重定向 homedir，避免 syncCommandsToFile 污染真实配置 ──
const fakeHome = path.join(os.tmpdir(), "wecom-notify-test-" + Date.now());
fs.mkdirSync(fakeHome, { recursive: true });
os.homedir = () => fakeHome;

// ── 2) 注入测试密钥（否则 sendWecom 直接 return，fetch 不会触发） ──
process.env.WECOM_BOT_KEY = "test-key";

// ── 3) 拦截 fetch，记录发送内容 ──
const sent = [];
globalThis.fetch = async (url, opts) => {
  sent.push({ url, body: JSON.parse(opts.body) });
  return { json: async () => ({ errcode: 0 }) };
};

// ── 4) 加载插件（os.homedir 替换须在 import 前生效；Windows 需 file:// URL） ──
const pluginUrl = pathToFileURL(path.join(__dirname, "../src/index.js")).href;
const mod = await import(pluginUrl);
const createPlugin = mod.default;

// ── 5) mock client ──
const mockMessages = [
  { info: { id: "msg-1", role: "assistant" }, parts: [{ type: "text", text: "已完成任务 A" }] },
];
const mockClient = {
  session: {
    get: async () => ({ data: { title: "测试会话" } }),
    messages: async () => ({ data: mockMessages }),
  },
};

let pass = 0;
let fail = 0;
function assert(cond, label) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.error(`  ❌ ${label}`);
  }
}

const hooks = await createPlugin({ client: mockClient, directory: process.cwd() });
const idle = (sid) => hooks.event({ event: { type: "session.idle", properties: { sessionID: sid } } });

// ── 用例 ──
console.log("用例1：默认静默——未启用任何入口，不发通知");
await idle("s-1");
assert(sent.length === 0, "未启用时不发送");

console.log("用例2：入口① wecom-notify agent → 启用");
await hooks["chat.message"]({ sessionID: "s-2", agent: "wecom-notify" }, {});
await idle("s-2");
assert(sent.length === 1, "agent 入口命中后发送");
assert(sent[0].body.msgtype === "text", "消息类型为 text");
assert(sent[0].body.text.content.includes("回复完成"), "内容含“回复完成”");
assert(sent[0].body.text.content.includes("已完成任务 A"), "内容含回复摘要");

console.log("用例3：去重——同一条 assistant 消息只通知一次");
await idle("s-2");
assert(sent.length === 1, "重复 idle 不再发送");

console.log("用例4：入口② /wecom-notify 命令 → 启用");
await hooks["chat.message"]({ sessionID: "s-3" }, { parts: [{ type: "text", text: "/wecom-notify 帮我分析数据" }] });
await idle("s-3");
assert(sent.length === 2, "命令入口命中后发送");

console.log("用例5：入口③ 对话含「微信」关键词 → 启用");
await hooks["chat.message"]({ sessionID: "s-4" }, { parts: [{ type: "text", text: "完成后发微信通知我" }] });
await idle("s-4");
assert(sent.length === 3, "关键词入口命中后发送");

console.log("用例6：入口③ 对话含「wecom」关键词 → 启用");
await hooks["chat.message"]({ sessionID: "s-5" }, { parts: [{ type: "text", text: "wecom 推送一下结果" }] });
await idle("s-5");
assert(sent.length === 4, "wecom 关键词入口命中后发送");

console.log("用例7：普通消息不启用——后续 idle 静默");
await hooks["chat.message"]({ sessionID: "s-6" }, { parts: [{ type: "text", text: "帮我写个函数" }] });
await idle("s-6");
assert(sent.length === 4, "普通会话不发送");

console.log("用例8：session.error 在启用会话发送");
await hooks.event({ event: { type: "session.error", properties: { sessionID: "s-2", error: { message: "超时" } } } });
assert(sent.length === 5, "启用会话出错时发送");
assert(sent[4].body.text.content.includes("会话出错"), "错误通知内容含“会话出错”");

console.log("用例9：session.error 在未启用会话静默");
await hooks.event({ event: { type: "session.error", properties: { sessionID: "s-9", error: { message: "超时" } } } });
assert(sent.length === 5, "未启用会话出错时不发送");

console.log("用例10：permission.asked 在启用会话发送");
await hooks.event({
  event: { type: "permission.asked", properties: { sessionID: "s-2", permission: "bash", patterns: ["git push"] } },
});
assert(sent.length === 6, "启用会话权限请求时发送");
assert(sent[5].body.text.content.includes("需要权限确认"), "权限通知含“需要权限确认”");
assert(sent[5].body.text.content.includes("bash"), "权限通知含权限名");

console.log("用例11：permission.updated 不存在——不处理但也不报错");
await hooks.event({ event: { type: "permission.updated", properties: { sessionID: "s-2" } } });
assert(sent.length === 6, "无效事件忽略");

console.log("用例12：无 sessionID 的 idle 不发送");
await hooks.event({ event: { type: "session.idle", properties: {} } });
assert(sent.length === 6, "无 sessionID 静默");

console.log("\n─────────────────────────────");
console.log(`结果：${pass} 通过，${fail} 失败，共发送 ${sent.length} 次`);
if (fail > 0) process.exit(1);

// 清理临时目录
try {
  fs.rmSync(fakeHome, { recursive: true, force: true });
} catch {}
