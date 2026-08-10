---
name: set-up
description: 安装后初始化配置引导。刚安装 periscope 插件、需要生成或修改 ~/.config/periscope/config.json 时使用：引导用户在独立终端运行 init 脚本完成配置，解释协议与 apiKey 选项，最后用 doctor 验证配置可被正确读取。仅用户主动调用（/set-up），模型不得擅自触发。
disable-model-invocation: true
allowed-tools:
  - Bash(echo ${CLAUDE_PLUGIN_ROOT})
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli/doctor.js *)
---

# set-up：安装后初始化配置引导

这个 skill **只在你（用户）主动敲 `/set-up` 时触发**。模型不会擅自弹出配置流程——用户只是描述图片或做其他事时，不要运行 init、不要提本引导。

## 流程

1. **定位插件根**：先运行 `echo ${CLAUDE_PLUGIN_ROOT}`（不加引号），拿到插件根目录的绝对路径（形如 `~/.claude/plugins/.../periscope`），后面用它替换命令里的 `<插件根>`。

2. **把 init 命令交给用户在独立终端运行**：init 需要 TTY（交互式终端）才能做方向键选择，本会话内的 Bash 是管道环境、跑 init 会报「非 TTY」错误。把下面命令给用户，请 ta 在**独立的终端窗口**里运行（不要在 Claude Code 会话里跑）：

   ```bash
   node <插件根>/dist/cli/init.js
   ```

   用户在独立终端里会看到交互式向导：↑/↓ 方向键选择协议 → 逐项填写 baseUrl / model / apiKey → 确认 y/n 覆盖写入。等用户跑完并确认后，再进入下一步。

3. **解释协议与 apiKey 选项**（用户跑 init 前后都可以讲）：
   - **协议（protocol）**：三选一，决定请求形态——
     - `openai`（默认）：兼容 OpenAI chat/completions 格式，默认指向阿里云百炼 DashScope 的 `qwen-vl-max`。
     - `anthropic`：走 Anthropic Messages API（`x-api-key` 鉴权）。
     - `responses`：走 OpenAI Responses API。
   - **baseUrl / model**：每个协议独立的端点与模型，按实际使用的服务填写。
   - **apiKey**：视觉端点的密钥，**必填**。init 会把它写进 `~/.config/periscope/config.json`；也可以用环境变量 `PERISCOPE_API_KEY` 覆盖（优先级高于配置文件）。

4. **收尾：跑 doctor 验证配置**：用户确认 init 已完成并贴回输出（或回复完成）后，运行：

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/dist/cli/doctor.js
   ```

   逐项核对输出：`config 文件` / `协议段` / `Node 版本` / `dist/ 编译产物` / `根 plugin.json schema`。
   - 全部 `✅` 且结论为「全部通过」→ 向用户报告配置就绪。
   - `config 文件` 或 `协议段` 出现 `❌` → 说明配置未正确写入，引导用户重新跑 init 后再次验证。

## 边界

- **仅用户主动触发**：不要在用户没要求时弹出配置流程或运行 init / doctor。
- init 必须在**独立终端**运行（需要 TTY）；本会话内不要尝试直接跑 init。
- doctor 是纯本地自检，不发任何外部请求，可放心运行。
