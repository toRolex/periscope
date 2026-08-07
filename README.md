# periscope

给纯文本 coding agent 的视觉桥插件（MVP）。把本地图片 / 远程图片 URL / 用户在 Claude Code 里的贴图，转成文字描述，喂给只吃文本的 agent。零构建、零额外运行时依赖，`dist/` 已随仓库提交。

```
image ──▶ periscope describe ──▶ 外部视觉 LLM（openai / anthropic / responses）──▶ 文字描述
```

## 特性

- **CLI**：`periscope describe <图片路径或URL> [...]`，单图输出纯文本，多图逐行 `${source}: ${描述}`。
- **三协议**：openai（chat/completions，DashScope 兼容）、anthropic（v1/messages）、responses（v1/responses），配置文件切换。
- **贴图 hook**：Claude Code `UserPromptSubmit` 事件自动读取 `image_paths`，把 `[Image N] basename: 描述` 注入 `additionalContext`，始终放行（`decision: approve`）。
- **本地缓存**：未变图片的描结果缓存到 `~/.cache/periscope/`，命中不重复请求视觉端点；远程 URL 图不落缓存。
- **零构建**：编译产物 `dist/` 随仓库提交，用户拿到即用，无需安装 typescript 或运行 build。

## 安装

前置要求：**Node.js >= 20**。

```bash
# 方式一：git clone 后直接使用（dist/ 已提交，无需 build）
git clone <仓库地址>
cd periscope
pnpm install        # 仅安装 typescript（开发用）；纯使用可跳过
node dist/cli/index.js describe ./demo.png
```

> 纯使用场景不需要 `pnpm install`，直接跑 `dist/` 下的编译产物即可。`pnpm install` / `pnpm build` 只在需要修改源码或跑测试时需要。

可选：把 CLI 链接到 PATH，之后直接用 `periscope` 命令：

```bash
pnpm link           # 或 npm link；package.json bin 指向 dist/cli/index.js
periscope describe ./demo.png
```

## 配置

配置文件路径：**`~/.config/periscope/config.json`**。首次运行任意命令时会**懒创建**默认配置（见下）；用环境变量 `PERISCOPE_CONFIG` 可覆盖配置路径。

默认配置：

```json
{
  "protocol": "openai",
  "apiKey": "",
  "openai": {
    "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "model": "qwen-vl-max"
  },
  "anthropic": {
    "baseUrl": "https://api.anthropic.com",
    "model": "claude-3-5-sonnet-latest"
  },
  "responses": {
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini"
  }
}
```

### 三协议

`protocol` 字段决定当前使用的协议适配器，每个协议都有独立的 `baseUrl` 与 `model` 字段：

| protocol    | 请求端点                        | 鉴权方式                     | 默认 model          |
| ----------- | ------------------------------- | ---------------------------- | ------------------- |
| `openai`    | `{baseUrl}/chat/completions`    | `Authorization: Bearer`      | `qwen-vl-max`       |
| `anthropic` | `{baseUrl}/v1/messages`         | `x-api-key` + `anthropic-version: 2023-06-01` | `claude-3-5-sonnet-latest` |
| `responses` | `{baseUrl}/responses`           | `Authorization: Bearer`      | `gpt-4o-mini`       |

- **openai（默认）**：兼容 OpenAI chat/completions 格式的端点都可用，默认指向阿里云百炼 DashScope 的兼容模式（`qwen-vl-max`）。
- **anthropic**：走 Anthropic Messages API，图片以 base64 的 `image` content block 发送。
- **responses**：走 OpenAI Responses API，图片以 `input_image` 块发送。

切换协议示例：把 `config.json` 的 `protocol` 改成 `"anthropic"`，并填上对应的 `apiKey` 与（如有需要）`baseUrl` / `model`。未知协议会报错并列出可用值（`openai, anthropic, responses`）。

### 环境变量

| 环境变量             | 作用                                                             | 优先级                     |
| -------------------- | ---------------------------------------------------------------- | -------------------------- |
| `PERISCOPE_API_KEY`  | 视觉端点 API key                                                 | 优先于配置文件 `apiKey`    |
| `PERISCOPE_CONFIG`   | 配置文件路径（默认 `~/.config/periscope/config.json`）           | 覆盖默认路径               |
| `PERISCOPE_CACHE_DIR`| 缓存目录（默认 `~/.cache/periscope/`）                           | 覆盖默认目录               |

## CLI 用法

### `describe` — 描述图片

```
periscope describe <图片路径或URL> [...] [--intent "描述内容"]
```

- `<图片路径或URL>`：本地图片路径或 `http(s)` 图片 URL，可传多个，空格分隔。
- `--intent "..."`（可选）：描述意图，如 `"读取图片中的文字"`、`"解析图表"`。
- 直接运行编译产物：`node dist/cli/index.js describe <图片路径或URL> [...]`（插件环境里是 `node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js ...`）。

### `init` — 交互式初始化配置

```
periscope init
```

通过 stdin 一问一答引导用户完成配置：选择协议（`openai` / `anthropic` / `responses`）→ 填 `baseUrl` → 填 `model` → 填 `apiKey`（可空），最后写出到默认配置路径（`PERISCOPE_CONFIG` 优先，否则 `~/.config/periscope/config.json`）。

行为要点：

- **目标文件已存在则拒绝覆盖**（避免误删 API key），stderr 报错 + 非零退出码。需重新生成请先手动删除该文件再运行 `periscope init`。**没有 `--force` 选项**——强制覆盖必须用户自己操作文件。
- 任一回答 EOF 或校验失败立即终止，非零退出码。
- 写出的 JSON 包含 `protocol` / `apiKey` / `openai` / `anthropic` / `responses` 顶层字段；用户选中的协议段 `baseUrl` / `model` 取用户输入，其余协议段保留 DEFAULT_CONFIG 的端点。

```bash
# 典型使用：装好插件后首次跑
periscope init
# 提示: 选择协议 (openai/anthropic/responses): openai
# 提示: openai baseUrl: https://dashscope.aliyuncs.com/compatible-mode/v1
# 提示: openai model: qwen-vl-max
# 提示: apiKey (可空): sk-xxx
# stdout: 已写入配置: /Users/you/.config/periscope/config.json
```

### `doctor` — 本地自检

```
periscope doctor [--offline]
```

五项自检，全部纯本地（`--offline` 时连 schema 网络拉取也禁用）：

1. **config 文件**：检查默认路径（`PERISCOPE_CONFIG` / `~/.config/periscope/config.json`）文件存在性。
2. **协议段**：检查 `config.json` 的 `openai` / `anthropic` / `responses` 段都有 `baseUrl` + `model`。
3. **Node 版本**：与仓库 `package.json` 的 `engines.node` 比较（默认 `>=20`）。
4. **dist/ 编译产物**：检查 `dist/cli/index.js` + `dist/core/describe.js` 存在（零构建即用假设）。
5. **根 `plugin.json` schema 合规**：按 [Agent Plugins 1.0.0](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json) 校验仓库根 `plugin.json`。

逐项输出 `✅ / ⚠️ / ❌` + 一行结论；`❌` 项数 = 退出码是否为零。

**`--offline` 标志语义**：禁止 schema 项发起任何外部网络请求（满足 issue #12「全程不发请求」的承诺）。

- 缓存有效（7 天 TTL 内）→ 用本地缓存校验，输出 `✅ 根 plugin.json schema 合规（schema 来源: 本地缓存）`。
- 缓存缺失或过期 → 降级 `⚠️ 离线模式：schema 未缓存，跳过校验（可先联网跑一次 doctor 预热缓存）`，**不发任何 fetch**。
- 其余 4 项本地自检不受 `--offline` 影响，仍照常输出。

**默认行为（不传 `--offline`）**：冷缓存时 schema 项会拉一次远程 schema（成功后续命中本地缓存 7 天）；拉取失败降级 `⚠️`，不硬失败。

### 输出与退出码

- **单图**：stdout 输出纯文本描述，无前缀。
- **多图**：逐行输出 `${source}: ${描述}`，顺序与传入顺序一致，并行请求（总耗时约等于最慢单图）。
- **成功**：退出码 `0`，stdout 为描述。
- **失败**（缺参数 / 文件不存在 / 端点非 2xx 等）：错误信息走 stderr，退出码非零。

```bash
# 单图 + 意图
periscope describe ./screenshot.png --intent "读取图片里的报错信息"

# 多图（本地 + URL 混用）
periscope describe ./a.png https://example.com/cat.png

# 远程 URL 图直接透传给视觉端点，无需先下载
periscope describe https://example.com/diagram.png
```

## 贴图 hook（Claude Code 插件）

装成 Claude Code 插件后，你贴图（或让 agent 引用本地图片 / URL）时，periscope 会自动调用视觉模型并把描述注入上下文。**插件根 = 仓库根**，目录结构即插件结构：

```
.
├── .claude-plugin/plugin.json      # 插件元数据（name: periscope）
├── hooks/hooks.json                # UserPromptSubmit hook（exec form）
├── skills/describe-image/SKILL.md  # describe-image skill（allowed-tools 规则）
├── dist/                           # 编译产物（随仓库提交，零构建）
└── src/                            # TypeScript 源码
```

- 把仓库放进 Claude Code 的插件目录（或通过 marketplace 安装，见「Marketplace 发布说明」）。
- `hooks/hooks.json` 声明 `UserPromptSubmit` 事件，exec form 执行 `node ${CLAUDE_PLUGIN_ROOT}/dist/hook/index.js`。
- hook 读取事件 JSON 的 `image_paths`，并行描述各图，把 `[Image N] basename: 描述` 逐行注入 `additionalContext`：

```json
{
  "decision": "approve",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "[Image 1] a.png: 一只猫在窗台\n[Image 2] b.png: 描述不可用"
  }
}
```

行为要点：

- **始终放行**：`decision` 恒为 `approve`，绝不用图片描述失败阻塞消息发送。
- **单图失败注入占位符**：该图显示 `描述不可用`，不影响其余图片。
- **字符预算**：`additionalContext` 软预算约 9000 字符，接近上限时截断并注明 `（另有 N 张图片未描述）`。
- **缓存复用**：同一图片（路径 + 修改时间 + 大小未变）多次贴图只请求一次视觉端点。
- 无图片事件注入空串 `additionalContext`（满足 2.1.x hook schema 必填约束）。
- 在 Claude Code 里也可手动触发 skill：`describe-image`，运行 `node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js describe <图片路径或URL> [--intent "..."]`。

## 人工实测指南（真实视觉 LLM）

> 当前仓库环境没有真实视觉 LLM 的 API key / endpoint，**AC3「真实视觉 LLM 端到端人工实测」需用户按本指南自行执行**。仓库提供了离线 mock 视觉端点（`src/testing/mock-server.ts`）供自动化冒烟替代验证（见「开发」）。

按以下步骤用真实端点做端到端实测：

1. **配置**：编辑 `~/.config/periscope/config.json`，或设置环境变量。示例（用 `PERISCOPE_API_KEY` 与配置文件并存的推荐方式）：
   ```bash
   export PERISCOPE_API_KEY=<你的真实 key>
   # openai 协议默认指向 DashScope qwen-vl-max；如用其他端点改 config.json 的 baseUrl/model
   ```
2. **CLI 实测**：准备一张本地图片与一个真实 URL，分别跑：
   ```bash
   periscope describe ./本地图.png --intent "描述这张图片"
   periscope describe https://example.com/远程图.png
   ```
   **预期结果**：stdout 输出与图片内容一致的中文描述；退出码 `0`；再次跑同一张本地图应命中缓存（秒出，不再请求端点）。
3. **多图实测**：`periscope describe ./a.png ./b.png`，预期逐行输出 `a.png: ...` / `b.png: ...`。
4. **贴图注入实测**：在装好插件 + 配好 key 的 Claude Code 会话里贴一张图，确认：
   - agent 能读到 `[Image N] basename: 描述` 形式的图片描述并据此作答；
   - 消息正常发送（hook 始终 `approve`，即使某图失败也只显示 `描述不可用`）。
5. **协议切换实测**：把 `protocol` 改为 `anthropic` 或 `responses`，配好对应 key 重跑步骤 2，确认响应质量。

**预期响应质量**：描述应与图片内容吻合（物体、场景、文字、图表要点），`--intent` 能引导输出侧重点（如「读取文字」应准确转写图片内文字）。

## Marketplace 发布说明

**发布流程本身不在 MVP 范围**，本仓库先准备好可发布的插件结构，后续发布步骤建议：

1. 确认 `.claude-plugin/plugin.json` 的 `name` / `version` / `author` 元数据正确（当前 `name: periscope`，`version: 0.1.0`）。
2. 确认 `hooks/hooks.json` 与 `skills/describe-image/SKILL.md` 随插件根一起发布，且 `dist/` 编译产物包含在发布包中（用户零构建即用）。
3. 发布到 Claude Code 插件 marketplace / 目录时，按对应平台要求打包插件根目录；仓库内验证方式：
   ```bash
   gh release create <tag>   # 如先做 git tag + release，再指向 marketplace
   ```
4. 发布前建议在干净环境（新 clone + 仅 `node`）实测「零构建即用」链路，避免漏提交 `dist/` 产物。

## Agent Plugins 1.0.0 合规

periscope 同时遵守 [Agent Plugins 1.0.0](https://agent-plugins.org) 标准（vercel + openai 联合发布的打包格式），被下列兼容 harness 作为标准插件目录加载：

- **VS Code**
- **ChatGPT / Codex**
- **Kiro**
- **GitHub Copilot**
- **Cursor**

> Claude Code **不在** Agent Plugins 兼容客户端列表里——它读自己的 `.claude-plugin/plugin.json` 与 `hooks/hooks.json`，不读根 `plugin.json`。两套结构互不冲突，Claude Code 体验不变。

### 合规要点

- **根 `plugin.json`**：仓库根的标准 manifest，包含 `$schema` / `name` / `version` / `description` / `author` 五字段，`name` 沿用 `periscope`。
- **Skill 路径**：describe 能力以 `skills/describe-image/SKILL.md` 形式承载（frontmatter `name` / `description` / `allowed-tools` 已在 Agent Skills 规范字段表内，无需改动）。兼容 harness 的 agent 读到 Skill 后按指令调 `node dist/cli/index.js describe <图片路径或URL> [--intent "..."]`。
- **不上 MCP server**：periscope **不**写 `mcp.json`、**不**把 describe 暴露为 MCP tool——避免在兼容 harness 工具列表里多一个 describe 噪音；视觉能力以 Skill 文本指令形式呈现。
- **Claude Code 原生结构保留**：`.claude-plugin/plugin.json` + `hooks/hooks.json` + 现有 `skills/` 路径不动。

## 常见问题（FAQ）

**Q：图片描述缓存存在哪里？怎么清除？**
默认 `~/.cache/periscope/`，每张图一个 `<sha256>.txt` 文件。清掉整个目录即可全部失效：`rm -rf ~/.cache/periscope`。也可用 `PERISCOPE_CACHE_DIR` 指到别处。

**Q：为什么远程 URL 图片不走缓存？**
缓存 key 依赖本地文件的路径 + 修改时间 + 大小（`sha256(绝对路径+mtime+size)`），远程 URL 内容可变且无本地 stat，因此不落缓存、请求体直接透传 URL 给视觉端点。

**Q：配置文件在哪？没配置会怎样？**
默认 `~/.config/periscope/config.json`。首次运行自动懒创建默认配置（`protocol: openai` + DashScope `qwen-vl-max`，`apiKey` 为空）。没配 `apiKey` 时请求不带鉴权头，真实端点通常会返回 401；本地 mock 端点不受影响。

**Q：hook 失败会阻塞消息发送吗？**
不会。`decision` 恒为 `approve`；单图失败注入 `描述不可用`，解析/读取 stdin 失败也放行。附加的 `additionalContext` 只是上下文增强，不是发送门禁。

**Q：CLI 报错长什么样？**
错误信息走 stderr，退出码非零。常见：缺图片路径（`缺少图片路径`）、文件不存在（`无法读取图片文件`）、端点非 2xx（`视觉端点返回 HTTP 500: ...`）、未知参数（`未知参数: --xxx`）、未知协议（`未知协议: ...`）。

**Q：需要安装 TypeScript / 运行 build 吗？**
纯使用不需要。`dist/` 已随仓库提交，直接跑 `node dist/cli/index.js` 即可。`pnpm install` / `pnpm build` 只在改源码或跑测试时需要。

**Q：Node 版本要求？**
Node.js >= 20（代码与测试使用内建 `fetch` 与 `node:test`）。

## 开发

- 依赖极简：devDependencies 仅 `typescript`（`@types/node` 不引入，手写 ambient 声明在 `src/global.d.ts`）。
- 构建：`pnpm build`（=`tsc`）。
- 测试：`pnpm test`（=`tsc && node --test`），含 CLI、core、三协议、config、缓存、hook、插件契约，以及 `src/delivery.smoke.test.ts` 的 mock 端点端到端冒烟。
- 本地 mock 视觉端点：`src/testing/mock-server.ts`（离线 HTTP server，记录请求、返回可定制的视觉响应），`src/testing/fixtures.ts`（1x1 PNG 与临时配置/目录工具）。
- 目录速览：
  - `src/cli/index.ts` — CLI 入口（解析参数 → describe → 输出/退出码）
  - `src/core/describe.ts` — 协议无关核心 `describe()` / `describeMany()`（缓存 → 转 data URL → 适配器 → 传输）
  - `src/protocols/{openai,anthropic,responses,index}.ts` — 三协议适配器（请求构造 + 容错响应提取）
  - `src/config/config.ts` — 懒创建配置 + 环境变量覆盖
  - `src/cache.ts` — 图片描述本地缓存
  - `src/hook/index.ts` — UserPromptSubmit hook 桥接
