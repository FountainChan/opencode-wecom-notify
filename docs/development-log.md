# 开发记录

## 2026-08-22：修复无法切换到 wecom-notify Agent

### 现象

- 企业微信群机器人真实发送测试成功。
- `/wecom-notify` 和关键词入口可以启用通知。
- OpenCode 的 Agent 切换器中没有 `wecom-notify`，因此无法使用入口①。

### 排查证据

1. 插件源码仅用 `input.agent === "wecom-notify"` 判断入口①，没有注册同名 Agent。
2. README 要求用户额外手工配置 Agent，安装插件本身不会完成这一步。
3. `opencode debug config` 能验证 Agent 是否进入合并配置。
4. `opencode run --agent wecom-notify "测试"` 能验证真实 OpenCode 是否接受该 Agent。
5. 在 `chat.message` 边界添加临时日志后，确认 OpenCode 1.18.21 真实传入 `input.agent: "wecom-notify"`，因此门控判断本身正确；验证后已删除日志。

### 根因

插件把“识别 Agent”和“创建 Agent”拆成了两个安装步骤。源码依赖 `wecom-notify` 存在，但没有通过 `config` hook 注册它。用户只安装插件时，入口①天然不可用。

排查过程中还发现两个配置问题：

- 用户通常把全局密钥写入 `~/.config/opencode/.env`，原源码只读取工作目录和插件目录的 `.env`。
- 将插件放入 `~/.config/opencode/plugins/` 后又写入 `plugin` 数组，会让 OpenCode 自动发现和显式配置同时加载同一插件，产生重复通知和独立会话状态的风险。

### 修复

- 在插件的 `config` hook 中自动注入可见的 `wecom-notify` primary agent；`mode` 和 `hidden` 是固定不变量。
- 合并 Agent 默认值时保留用户已有的模型、描述和提示词覆盖。
- 将 `~/.config/opencode/.env` 加入密钥查找路径。
- 更新 README，说明 Agent 自动注册、配置修改后必须重启，以及插件自动发现和显式加载不能同时使用。
- 修复测试临时目录初始化，消除同步命令时的 `ENOENT` 噪声。

### 验证

```bash
npm test
```

结果：Agent 注册与通知链路测试、完整密钥优先级测试全部通过，其中包括 Agent 自动注册、用户内容覆盖、可见 primary 不变量和四级 `.env` 查找顺序。

真实 OpenCode 验证：

```bash
opencode run --agent wecom-notify "只回复：Agent 切换测试成功"
```

OpenCode 接受该 Agent 并完成会话；企业微信真实发送接口返回 `errcode: 0`。
