# ADR 0002: 插件形态改为独立脚本 + init 确认覆盖 + set-up 引导

- 状态：accepted
- 日期：2026-08-10
- 关联：ADR 0001 第 6 条"CLI 子命令"表述由本 ADR 取代

## 背景

用户 `claude plugin install` 后无法初始化配置：`periscope` 命令不注册 PATH（private 包不产生 bin）、插件根路径带版本哈希不可知、Claude Code 会话内无交互式 stdin。产品形态定为"脚本 + skill + hook"，统一命令分发器是多余的中间层。

## 决策

1. **删除 CLI 命令分发器**。不再有 `periscope <describe|init|doctor>` 形态；describe / init / doctor 各自成为独立可执行脚本（`dist/cli/describe.js` / `dist/cli/init.js` / `dist/cli/doctor.js`），skill 直接调 `describe.js`。
2. **init 改为"每次确认覆盖"**。交互流程：方向键选择协议（openai/anthropic/responses）→ 填 baseUrl → 填 model → 填 apiKey（可选，回车留空，本地无鉴权端点如 Ollama / LM Studio）→ y/n 确认覆盖写入。**无默认值**；删除"目标文件已存在即拒绝"逻辑。
3. **新增 `set-up` skill**（`disable-model-invocation: true`，仅用户触发）。定位插件路径 → 把 `node <路径>/dist/cli/init.js` 命令交给用户在独立终端运行 → 解释协议 / 密钥选项 → 收尾跑 doctor 验证。
4. 不做非交互参数化（flags / env）；apiKey 写配置，`PERISCOPE_API_KEY` 环境变量仍优先覆盖。
5. 零依赖 / 零构建保持：方向键选择器用 node:readline 自实现，不引入 clack/prompts。

## 备选方案

- **A. 文档指引用户找路径手跑 init**：路径带版本哈希会漂移，不可行。
- **B. 非交互参数化（flags/env）**：曾计划，用户明确要交互式脚本；留待未来增量。
- **C. hook 缺配时注入提示**：体验增强，非入口本身，依赖本决策闭环。

## 影响

- `dist/cli/index.js` 从产物消失；skill / README / doctor 的 dist 检查 / 测试入口全部改指向独立脚本。
- init 语义从"拒绝覆盖"改为"确认覆盖"（配置安全从"绝对不碰"改为"确认后覆盖"）。
- README「安装」补"安装后配置"（敲 `/set-up`）。
- 方向键选择器依赖 TTY：非 TTY（管道）时 init 报错退出。

## 修订记录

- **2026-08-13（issue #20）**：决策 2 中 apiKey 由「必填」改为「可选（可留空）」——支持本地无鉴权端点（Ollama / LM Studio）；baseUrl / model 仍必填，写配置时空 apiKey 为空串。决策 3 的 set-up 引导同步说明 apiKey 可留空。
- **2026-08-13（issue #19）**：决策 2 的「无默认值」落为空白模板——DEFAULT_CONFIG 三协议 baseUrl / model 均为空串，describe 遇空端点报错引导 init（BYOM，不绑定任何服务商）。
