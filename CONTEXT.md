# periscope context glossary

periscope = Claude Code 插件。把图片转成文字，喂给纯文本 coding agent。

下游 = 用户自带的视觉模型端点（openai / anthropic / responses 三种 API 协议；baseUrl / model 由用户自行配置，不绑定任何服务商）。
接入层 = 宿主 agent 框架的接入机制：Claude Code 侧为 hook + skill + 独立脚本；dsh 侧为 LlmAdapter 桥（见「桥」）。
_Avoid_: CLI、命令分发器

Agent Plugins 1.0.0 = vercel + openai 联合发布的"打包格式"标准。它**不**定义新工具协议——只打包两类已有组件：
  - Agent Skill（`skills/<name>/SKILL.md`，遵守 agentskills.io 规范）
  - MCP server（`mcp.json`）

harness = Agent Plugins 兼容客户端的运行时（VS Code / ChatGPT-Codex / Kiro / GitHub Copilot / Cursor）。

Claude Code 与 Agent Plugins 的关系：Claude Code **不在**兼容客户端列表；它读自己的 `.claude-plugin/plugin.json` 与 `hooks/hooks.json`，不读 Agent Plugins 的根 `plugin.json`。

扩展目录 = 反向域名命名的顶层目录（如 `com.example.client/`），存放客户端专属数据。Agent Plugins 对扩展目录的内容**不**赋予可移植语义——其他 harness 按定义忽略。

wizard = 交互式配置脚本：方向键选择协议（openai/anthropic/responses）→ 逐项填写 baseUrl / model（apiKey 可留空，本地端点无需鉴权）→ 最后 y/n 确认覆盖写入。无默认值。
_Avoid_: 向导、setup 脚本

init = wizard，在独立终端运行，写 `~/.config/periscope/config.json`（已有配置时确认后覆盖）。
_Avoid_: `periscope init`（CLI 命令形态已删除）

set-up = 安装后引导 skill，仅用户主动触发，引导用户在独立终端运行 init 完成配置，收尾自检。
_Avoid_: setup、configure

doctor = 本地自检脚本，不发起任何外部请求，逐项打 ✅/⚠️/❌。
_Avoid_: `periscope doctor`（CLI 命令形态已删除）

lazy create = config 模块的兜底行为：首次启动无 config 文件 → 写空模板（三协议 baseUrl / model 为空串）；describe 读到空端点时给出可操作报错并引导运行 init。

任务模板 = 内置命名 prompt 文案（如 ocr / table / chart），通过 describe 的 intent 传入模板名时替换默认描述文案。periscope 不声明、不探测模型能力（运行时协商：prompt + 输出容错解析），模型不行由用户自行更换。

双宿主 = periscope 同时以 Claude Code（hook + skill + 独立脚本）与 dsh（LlmAdapter 桥）两种接入层提供同一 describe 能力；两宿主并存演进，describe 引擎保持函数签名一致，接口稳定后抽独立包。
_Avoid_: 双平台、跨端

dsh（deepseek-harness）= DeepSeek 官方的 Cordis 插件式 agent harness，periscope 的第二宿主。图片以 durable attachment + ImageBlock 进入会话，DeepSeek 文本路由本身不接收图片，需经「桥」翻译。
_Avoid_: harness（该词已指代 Agent Plugins 兼容客户端，见上）

桥（bridge adapter）= periscope 在 dsh 的接入层形态：一个声明 image 输入能力的 LlmAdapter，把 ImageBlock 经「下游」视觉端点译成文字后委托给主文本模型（默认 deepseek）。对应 Claude Code 侧的 hook 形态。
_Avoid_: wrapper、包装器

browser half = dsh 插件的浏览器侧扩展面：package.json 声明 `dsh.client` + tsdown 预构建 client bundle，经 client-modules 装载，向设置页 slot 注册 React 组件。UI 装载与渲染已实测可行（spike #32，机制 B）；读写配置走 connection RPC channel（见该词条），不再经 settings 网关。periscope-dsh 是否提供 Web UI 配置界面见 ADR 0003「配置面边界」。
_Avoid_: Web UI 插件、前端配置面

connection RPC channel = dsh 官方的 client→host 单向 RPC 通道（`@deepseek-ai/dsh-client-connection`）：host 侧 `ctx.connection.rpc.handle(channel, handler, {authority})` 注册私有 channel，browser 侧 `ctx.connection.rpc.call(channel, endpoint, payload)` 调用。第三方插件用它把自己的 settings 命名空间读写暴露给 browser half——handler 直接调 `ctx.settings.update/replace/describe`，绕开 api-proxy 的 `exposedNamespaces()` 白名单（第三方命名空间不被网关暴露的唯一阻碍）。`authority: 'loopback'` 走 DNS-rebinding 防护。这是 #31（dsh Web UI 可视化配置）走通的关键机制，也是 #32 spike 结论里「包内私有 Remote RPC」重开条件的官方载体。
_Avoid_: host.call、harness.handle（cordis 动态包专属 RPC，不存在于 dsh.client 装载面）