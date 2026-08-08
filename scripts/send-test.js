// 企业微信 UTF-8 发送验证脚本（避免 Windows 终端 curl 的编码问题）
// 用法: node scripts/send-test.js "可选自定义内容"
const DEFAULT_CONTENT =
  "[opencode-wecom-notify] UTF-8 编码验证：对话状态推送正常，中文无乱码。";

const key = process.env.WECOM_BOT_KEY || "";
const content = process.argv[2] || DEFAULT_CONTENT;

const url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ msgtype: "text", text: { content } }),
});
const data = await res.json();
console.log("发送结果:", JSON.stringify(data));
if (data.errcode !== 0) process.exit(1);
