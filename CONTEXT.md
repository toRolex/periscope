# periscope context glossary

periscope = Claude Code 插件。把图片转成文字，喂给纯文本 coding agent。

下游 = 视觉模型端点（openai / anthropic / responses 三种 API 协议）。
接入层 = 宿主 agent 框架的接入机制：Claude Code hook + skill + 独立脚本。
_Avoid_: CLI、命令分发器

Agent Plugins 1.0.0 = vercel + openai 联合发布的"打包格式"标准。它**不**定义新工具协议——只打包两类已有组件：
  - Agent Skill（`skills/<name>/SKILL.md`，遵守 agentskills.io 规范）
  - MCP server（`mcp.json`）

harness = Agent Plugins 兼容客户端的运行时（VS Code / ChatGPT-Codex / Kiro / GitHub Copilot / Cursor）。

Claude Code 与 Agent Plugins 的关系：Claude Code **不在**兼容客户端列表；它读自己的 `.claude-plugin/plugin.json` 与 `hooks/hooks.json`，不读 Agent Plugins 的根 `plugin.json`。

扩展目录 = 反向域名命名的顶层目录（如 `com.example.client/`），存放客户端专属数据。Agent Plugins 对扩展目录的内容**不**赋予可移植语义——其他 harness 按定义忽略。

wizard = 交互式配置脚本：方向键选择协议（openai/anthropic/responses）→ 逐项填写 baseUrl / model / apiKey → 最后 y/n 确认覆盖写入。无默认值。
_Avoid_: 向导、setup 脚本

init = wizard，在独立终端运行，写 `~/.config/periscope/config.json`（已有配置时确认后覆盖）。
_Avoid_: `periscope init`（CLI 命令形态已删除）

set-up = 安装后引导 skill，仅用户主动触发，引导用户在独立终端运行 init 完成配置，收尾自检。
_Avoid_: setup、configure

doctor = 本地自检脚本，不发起任何外部请求，逐项打 ✅/⚠️/❌。
_Avoid_: `periscope doctor`（CLI 命令形态已删除）

lazy create = config 模块的兜底行为：首次启动无 config 文件 → 写默认（openai / DashScope qwen-vl-max）。