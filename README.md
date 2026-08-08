# 🔔 opencode-wecom-notify

OpenCode 插件：当对话出现新状态时，通过**企业微信群机器人**实时推送到手机微信。

## ✨ 功能

| 触发事件 | 推送内容 |
|---|---|
| `session.idle`（回复完成） | 会话标题 + 最后一条回复摘要 |
| `session.error`（会话出错） | 会话标题 + 错误信息 |
| `permission.updated` / `permission.asked`（需要权限确认） | 会话标题 + 权限请求描述 |

- 🚫 内置去重：同一轮回复只通知一次，避免 ralph-loop / ebuilder 等自动循环刷屏
- 📦 零依赖：仅使用 Node/Bun 原生 `fetch`
- 🔐 密钥不硬编码：通过环境变量或 `.env` 文件注入，可安全公开仓库

## 🚀 安装

OpenCode 的插件机制**原生支持本地路径**，无需 `npm install`。以下方式任选其一。

### 方式一：全局生效

将仓库内的 `src/index.js` 复制为 `~/.config/opencode/plugins/wecom-notify.js`。

### 方式二：项目级

将 `src/index.js` 放入项目 `.opencode/plugins/wecom-notify.js`。

### 方式三：通过本地路径引用（推荐，无需复制）

在 `opencode.json` 的 `plugin` 数组中直接写本地路径，支持相对路径、绝对路径和 `file://` URL：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./opencode-wecom-notify/src/index.js"]
}
```

或使用绝对路径（Windows）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["D:/WorkDev/MyShare/opencode-wecom-notify/src/index.js"]
}
```

> 💡 `file:` / `.` 开头 / 绝对路径（含 `C:\` 盘符）均被识别为本地路径插件，加载时直接读取源码，**不会**走 npm 安装。

### 方式四：npm 包（发布后）

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-wecom-notify"]
}
```

## ⚙️ 配置

### 1. 创建企业微信群机器人

手机端企业微信 → 创建一个群（哪怕只有自己）→ 群设置 → 群机器人 → 添加机器人，复制 Webhook 地址中的 `key`。

### 2. 注入密钥（三选一）

**a) 环境变量（推荐用于 shell 会话）**

```bash
export WECOM_BOT_KEY="你的群机器人key"
```

**b) `.env` 文件**

在**工作目录**（运行 opencode 的目录）或**插件所在目录**创建 `.env`：

```bash
WECOM_BOT_KEY=你的群机器人key
```

优先级：环境变量 > 工作目录 `.env` > 插件目录 `.env`。

**c) 系统级配置**（Windows）

在「系统属性 → 高级 → 环境变量」中添加用户变量 `WECOM_BOT_KEY`。

> 🔒 密钥查找顺序固定为上述优先级，任一命中即生效；全未命中则静默跳过推送。

## 🧪 本地验证

```bash
node scripts/send-test.js "测试消息"
```

> Windows 终端直接 `curl` 发送中文可能乱码（GBK 编码问题），本脚本使用 Node `fetch`（UTF-8）规避，请用它验证。

## 📱 通知内容示例

```
[opencode] ✅ 回复完成
会话：重构购物车模块
- 完成 CheckoutService 拆分
- 新增 12 个单元测试，全部通过
...
```

```
[opencode] 🔔 需要权限确认
会话：数据分析任务
Bash(git push --force)
```

## 📄 License

MIT
