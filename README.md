# opencode-wecom-notify

OpenCode 插件：当对话出现新状态时，通过**企业微信群机器人**实时推送到手机微信。

## 功能

| 触发事件 | 推送内容 |
|---|---|
| `session.idle`（回复完成） | 会话标题 + 最后一条回复摘要 |
| `session.error`（会话出错） | 会话标题 + 错误信息 |
| `permission.updated` / `permission.asked`（需要权限确认） | 会话标题 + 权限请求描述 |

- 内置去重：同一轮回复只通知一次，避免 ralph-loop / ebuilder 等自动循环刷屏
- 零依赖：仅使用 Node/Bun 原生 `fetch`

## 安装

### 方式一：全局生效

把 `src/index.js` 复制为 `~/.config/opencode/plugins/wecom-notify.js`。

### 方式二：项目级

把 `src/index.js` 放入项目 `.opencode/plugins/wecom-notify.js`。

### 方式三：npm 包

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-wecom-notify"]
}
```

## 配置

### 1. 企业微信群机器人

手机端企业微信中创建一个群（哪怕只有自己）→ 群设置 → 群机器人 → 添加机器人，复制 Webhook 地址中的 `key`。

### 2. 填入 key

插件默认内置 key（见 `src/index.js` 中 `DEFAULT_KEY`）。更安全的做法是通过环境变量覆盖：

```bash
export WECOM_BOT_KEY="你的群机器人key"
```

## 通知内容示例

```
[opencode] ✅ 回复完成
会话：重构购物车模块
- 完成 CheckoutService 拆分
- 新增 12 个单元测试，全部通过
...
```

## License

MIT
