# ADR 0001: Agent Plugins 1.0.0 合规化采用 Skill 路径、不上 MCP

- 状态：提议
- 日期：2026-08-07
- 关联 issue：toRolex/periscope#1（v1.1 切片）

## 背景

Agent Plugins 1.0.0（vercel + openai 联合发布）作为可移植打包格式标准发布，目标是把两类已有组件——Agent Skill（agentskills.io）与 MCP server（modelcontextprotocol.io）——装进一份可分发目录，让兼容 harness（VS Code / ChatGPT-Codex / Kiro / GitHub Copilot / Cursor）都能加载同一份插件。Claude Code 不在兼容列表。

periscope 当前是 Claude Code 插件，提供"图片 → 文字描述"能力，希望被更多 harness 复用。

## 决策

1. **暴露方式：Agent Skill 路径，不上 MCP server**。把 periscope 的 describe 能力以 SKILL.md 形式承载，被任何兼容 harness 的 agent 读到后按指令调 CLI。**不**写 `mcp.json`、**不**把 describe 暴露为 MCP tool。
2. **可移植核心最小集**：根加 `plugin.json`（标准 manifest，必填 `$schema` + `name`）作为 Agent Plugins 入口；复用现有 `skills/describe-image/SKILL.md`（frontmatter 字段全在 Agent Skills 规范内，已合规）。
3. **不放反向域名扩展目录**（如 `com.anthropic.claude/hooks/`）。Claude Code 当前不实现扩展命名空间，且 §8 没强制要求；为不确定的未来写死结构是负担。
4. **Claude Code 原生结构全部保留**：`.claude-plugin/plugin.json` + `hooks/hooks.json` + 现有 `skills/` 路径不动。两套结构路径不同、无冲突。
5. **schema 校验走 doctor**：`periscope doctor` 加一项"根 plugin.json 合规"检查——缓存 `agent-plugins.org/schemas/1.0.0/plugin.schema.json` 到 `~/.cache/periscope/agent-plugins.schema.json`（7 天过期），手写校验（不引入 ajv，保持零运行时依赖），**不**进 `node --test`。
6. **新增 `periscope init`（交互式 wizard）+ `periscope doctor`（本地自检）**——前者引导用户写配置（目标文件已存在 → 拒绝覆盖，避免误删 API key），后者本地逐项自检、不发起外部请求。

## 备选方案

- **A. MCP server 路径**：把 describe 包成 MCP tool（stdio 子进程），所有兼容客户端 + Claude Code 都能直接调。**拒绝理由**：MCP 把 describe 推入工具列表（+1 个 tool 噪音）；用户明确希望"不进工具列表"；MCP 是传输/暴露层，与下游视觉模型协议适配器正交但非必需。
- **B. Skill + MCP 双提供**：Skill 为主，MCP 为协议级增强。**拒绝理由**：MCP 路径当前没看到需要；增量成本（写一层 MCP server 薄壳 + 维护 1 个 tool schema）换来的能力暂无可观察收益。**保留为未来增量**。
- **C. 完全迁移到标准、撤掉 Claude Code 原生结构**：撤掉 `.claude-plugin/` 与 `hooks/hooks.json`，Claude Code 体验切到 MCP 调用。**拒绝理由**：UserPromptSubmit 的自动注入是 Claude Code 独有体验，MCP 路径无法承载；撤掉会破坏现有用户。
- **D. 放反向域名扩展目录**（`com.anthropic.claude/hooks/hooks.json`）：为未来 Claude Code 支持扩展命名空间做准备。**拒绝理由**：标准 §8 没说 Anthropic 公布命名空间何时/形式；为不确定兼容性写死结构是负担。**保留为未来增量**。

## 影响

- periscope 目录顶层多一个 manifest（5 字段）。
- 现有核心 `describe` / 三协议适配器 / hook / SKILL.md / dist/ 全部零改动。
- 新增 `src/cli/init.ts` 与 `src/cli/doctor.ts`；CLI dispatch 多两个子命令。
- README 增加一节"Agent Plugins 1.0.0 合规说明"。
- 兼容 harness 的覆盖预期提升至 5 个（VS Code / ChatGPT-Codex / Kiro / GitHub Copilot / Cursor）。Claude Code 体验不变。

## 风险

- **标准新（2-3 周）**：兼容客户端实现可能有差异；v1 明确排除 marketplace / 凭据 / 签名 / 权限，periscope 自身不引入这些维度，问题可控。
- **Claude Code 不读标准结构**：双轨是常态而非过渡期；将来 Claude Code 支持扩展命名空间时再评估 ADR 0002。
- **schema URL 失效或被劫持**：本地缓存 + 7 天过期提供一定缓冲；doctor 校验失败不阻断其他功能。