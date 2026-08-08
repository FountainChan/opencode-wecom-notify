# 🔔 opencode-wecom-ping

OpenCode 插件：当对话出现新状态时，通过**企业微信群机器人**实时推送到手机微信。

**默认静默**，只有通过以下三种入口**显式启用**后，本会话才推送通知。

## ✨ 三种启用方式

| 入口 | 方式 | 说明 |
|---|---|---|
| ① 指定 Agent | 切换到 `wecom-notify` agent | 该 agent 下的会话自动启用通知 |
| ② 斜杠命令 | 输入 `/wecom-notify` | 在当前会话开启通知（含 `$ARGUMENTS` 任务描述） |
| ③ 对话关键词 | 对话中明确提到「微信」「wecom」 | 检测到通知意图后自动启用本会话通知 |

启用后推送的事件：

| 触发事件 | 推送内容 |
|---|---|
| `session.idle`（回复完成） | 会话标题 + 最后一条回复摘要 |
| `session.error`（会话出错） | 会话标题 + 错误信息 |
| `permission.asked`（需要权限确认） | 会话标题 + 权限请求描述 |

> ⚠️ `permission.updated` 不是 OpenCode 的有效事件（仅存在于生成类型残留中），实际有效事件为 `permission.asked` / `permission.replied`。本插件监听 `permission.asked`。

## ✨ 特性

- 🚫 默认静默：未命中三入口的会话一律不推送，避免刷屏
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
  "plugin": ["./opencode-wecom-ping/src/index.js"]
}
```

或使用绝对路径（Windows，请替换为你自己的路径）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["C:/your-path/opencode-wecom-ping/src/index.js"]
}
```

> 💡 `file:` / `.` 开头 / 绝对路径均被识别为本地路径插件，加载时直接读取源码，**不会**走 npm 安装。
> ⚠️ 绝对路径会暴露你的本地目录结构，若在意隐私，推荐用**方式一（复制到全局插件目录）**或下面的相对路径。

### 方式四：npm 包

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-wecom-ping"]
}
```

```bash
npm install -g opencode-wecom-ping
```

### 方式五：GitHub Release 资产（无需 npm 登录）

每次发布都会同时上传一个 tarball 到 GitHub Releases，可直接从 URL 安装，**不依赖 npm 账号/token**：

```bash
npm install https://github.com/FountainChan/opencode-wecom-ping/releases/download/v1.0.2/opencode-wecom-ping-1.0.2.tar.gz
```

将 URL 中的版本号 `v1.0.2` 替换为最新发布版本即可（见 [Releases 页面](https://github.com/FountainChan/opencode-wecom-ping/releases)）。

> 💡 npm registry 与 GitHub Release 双通道发布：安装方式可随时切换，GitHub 通道不受 npm token 有效期影响。

## ⚙️ 配置

### 0. 添加 wecom-notify Agent（入口①）

在 `opencode.json` 的 `agent` 中参考以下配置（也可在配置中心勾选使用）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "wecom-notify": {
      "mode": "primary",
      "description": "Agent that sends WeChat Work notifications when replies complete, errors occur, or permission is requested. Switch to this agent to enable notifications.",
      "prompt": "You are wecom-notify, an agent that notifies the user via WeChat Work (企业微信) when work finishes or needs attention.\n\nRULES:\n- Work on the task normally\n- When the reply completes, errors, or a permission request is pending, the WeChat notification plugin handles delivery automatically\n- Do NOT ask the user whether notifications were received\n- When the ENTIRE task is FULLY complete and verified, output: <promise>DONE</promise>\n- Output the promise ONLY ONCE when truly done",
      "color": "#07C160",
      "steps": 500,
      "options": {},
      "permission": {}
    }
  }
}
```

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

## 🔧 工作原理

```
用户消息 → chat.message hook（三入口门控）
             ├─ 入口① input.agent === "wecom-notify"  → 启用本会话
             ├─ 入口② 文本含 /wecom-notify             → 启用本会话
             └─ 入口③ 文本含 微信/wecom               → 启用本会话
                               │
                 enabled.add(sessionID)（会话内持续生效，无需每次开启）
                               │
server 事件 → event hook（仅启用过的会话）
             ├─ session.idle       → 推送 ✅ 回复完成
             ├─ session.error      → 推送 ⚠️ 会话出错
             └─ permission.asked   → 推送 🔔 需要权限确认
```

- 门控状态为**会话级**：命中入口后，该会话后续所有相关事件都会推送，直到会话结束，无需每次重复开启。
- 去重：`session.idle` 按「最后一条 assistant 消息 id」去重，同一回复只通知一次，避免 ralph-loop / ebuilder 自动循环刷屏。

## 🧪 本地验证

**1. 真实发送测试**（会真的发一条到群）：

```bash
node scripts/send-test.js "测试消息"
```

> Windows 终端直接 `curl` 发送中文可能乱码（GBK 编码问题），本脚本使用 Node `fetch`（UTF-8）规避，请用它验证。

**2. 链路自动化测试**（不真实发送，拦截 fetch）：

```bash
npm test
# 或
node scripts/test-flow.js
```

覆盖 12 组用例：三入口门控、默认静默、同轮去重、`session.error`、`permission.asked`、无效事件 `permission.updated` 忽略、缺失 sessionID 静默等，共 18 项断言。

## 💡 兼容性说明

- **CLI / TUI / 桌面版均可用**：`session.idle`、`session.error`、`permission.asked` 是 OpenCode **server 层**统一发布的事件（见 `packages/schema/src/session-status-event.ts`、`packages/schema/src/v1/permission.ts`），与前端界面无关。桌面版用 `session.idle` 弹系统通知，CLI 下它同样触发——本插件正是补上 CLI 无通知 UI 的短板。
- **`session.idle` 已标记 deprecated**（新事件为 `session.status`，含 `status.type: "idle"`），但官方**仍持续发布**它（桌面通知、ralph-loop 自动续写等均依赖它），因此当前可放心监听。
- **`permission.updated` 不是有效事件**（仅存在于生成类型 `types.gen.ts` 的残留），有效事件为 `permission.asked`（AI 请求权限）与 `permission.replied`（用户已回复）。本插件只监听 `permission.asked`。

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

## 🚀 发布新版本

发布流程由 GitHub Actions 自动完成，开发者只需两步：

```bash
# 1. 修改 package.json 中的 version（如 1.0.2 → 1.0.3）
# 2. 提交并打 tag（tag 名 = v + 版本号）
git commit -am "chore: bump 1.0.3"
git push origin main
git tag v1.0.3
git push origin v1.0.3
```

推送 tag 后，workflow 会自动依次执行：

1. **运行测试**（`npm test`，失败则中断）
2. **检查 NPM_TOKEN 过期时间**（剩余 <14 天警告；<7 天或已过期则阻断发布并提示更新）
3. **发布到 npm registry**（`npm publish`）
4. **打包并上传 GitHub Release 资产**（`opencode-wecom-ping-<版本>.tar.gz`）

发布产物双通道：

| 通道 | 地址 | 依赖 |
|---|---|---|
| npm registry | `npm install opencode-wecom-ping` | npm token（有效期最长 90 天，需定期更新） |
| GitHub Release | `npm install https://github.com/FountainChan/opencode-wecom-ping/releases/download/v1.0.2/opencode-wecom-ping-1.0.2.tar.gz` | 无（GitHub Actions 自动上传） |

> ⚠️ npm 自 2026-02-03 起强制 granular token 最长 90 天有效期，无法创建长期 token。发布前 workflow 的过期检查会提前提醒；即使 token 失效，GitHub Release 通道仍可正常安装。

## 📄 License

MIT
