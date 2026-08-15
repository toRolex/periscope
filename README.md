# 🔭 periscope

**`双宿主 Claude Code · dsh`**  **`BYOM 不绑定服务商`**  **`零运行时依赖`**  **`零构建`**  **`三协议`**  **`任务模板 ocr / table / chart`**  **`Agent Plugins 1.0.0`**  **`Node ≥ 20`**

> **给纯文本 coding agent 的视觉桥** —— 把图片译成文字描述，喂给只吃文本的 agent。
> 截图、报错堆栈、表格、架构图，它从此「看」得懂。

```
你贴图 / 给路径 / 给 URL
        │
        ▼
┌──────────────────┐        ┌───────────────────┐
│ periscope 视觉桥  │ ─────▶ │  视觉端点（BYOM）    │
│                  │ ◀───── │  · 本地 Ollama      │
│  openai          │ 文字描述 │  · LM Studio        │
│  anthropic       │        │  · 自建网关          │
│  responses       │        │  · OpenAI 兼容云     │
└──────────────────┘        └───────────────────┘
        │
        ▼
[Image 1] 截图.png: 一张终端报错堆栈的截图……
        │
        ▼
纯文本 coding agent —— 只读文字，也「看」懂了图
```

periscope 以 **BYOM（bring your own model）** 定位：**不绑定任何服务商**——视觉模型完全由你自带，本地 Ollama / LM Studio、自建网关、任意 OpenAI 兼容云端端点皆可接入。**零构建**（`dist/` 随仓库提交，拿到即用）、**零运行时依赖**、**双宿主**并存：既是 Claude Code 插件，也是 dsh（deepseek-harness）原生插件。

---

## ✨ 特性亮点

- 🖼️ **贴图即看懂**：Claude Code 里贴图自动注入 `[Image N] 名称: 描述`，agent 无感读图。
- 🔌 **双宿主并存**：Claude Code（hook + skill + 独立脚本）与 dsh（LlmAdapter 桥）提供同一 describe 能力，两宿主并存演进。
- 🧭 **BYOM 三协议**：openai / anthropic / responses，端点由你自带，不绑定任何服务商。
- 🛡️ **绝不中断会话**：视觉端点故障降级 `[Image N] 描述不可用` 占位符，hook 始终放行、dsh 桥绝不抛错。
- ⚡ **零构建零依赖**：`dist/` 随仓库提交，Node ≥ 20 直接跑，不装 typescript、不跑 build。
- 🗂️ **任务模板**：内置 `ocr` / `table` / `chart`，`--intent` 一键切换描述侧重，也可透传自由文本。
- 💾 **本地缓存**：未变图片命中缓存不重复请求视觉端点，省钱省时。
- 📜 **Agent Plugins 1.0.0 合规**：被 VS Code / ChatGPT-Codex / GitHub Copilot / Cursor / Kiro 等 harness 识别加载。

---

## 🚀 快速上手

三步看图（以 Claude Code 为例）：

**① 装好**

```bash
claude plugin marketplace add toRolex/periscope
claude plugin install periscope
```

**② 配好** —— 在独立终端跑交互式配置脚本（wizard），接入你的视觉端点：

```bash
node dist/cli/init.js
```

> 也可在会话里敲 **`/set-up`**（仅用户主动触发），skill 引导你完成配置并自动跑 doctor 自检。

**③ 看图** —— 直接在会话里贴一张截图，agent 即可读懂；或手动跑独立脚本：

```bash
node dist/cli/describe.js ./截图.png --intent ocr
```

---

## 📦 安装（双宿主）

periscope 以两种接入层提供**同一 describe 能力**，按需选用或并存：

```
            同一 describe 能力（图片 → 文字描述）
                          │
      ┌───────────────────┴───────────────────┐
      ▼                                       ▼
┌──────────────────┐                  ┌──────────────────┐
│  Claude Code      │                  │  dsh              │
│  插件             │                  │  (deepseek-       │
│                  │                  │   harness)        │
│ hook + skill     │                  │  原生插件          │
│ + 独立脚本        │                  │  LlmAdapter 桥     │
└──────────────────┘                  └──────────────────┘
 贴图自动注入描述                        注册 periscope-deepseek
 describe / init / doctor               route，纯文本 deepseek 也能看图
```

### 宿主一 · Claude Code 插件

```bash
claude plugin marketplace add toRolex/periscope
claude plugin install periscope
```

或在 Claude Code 内用 `/plugin` 添加 marketplace `toRolex/periscope` 后安装 `periscope`。装好后贴图自动注入描述，也可用 `/describe-image` skill 手动触发。**插件根 = 仓库根**，目录结构即插件结构：

```
.
├── .claude-plugin/plugin.json      # 插件元数据（name: periscope）
├── hooks/hooks.json                # UserPromptSubmit hook（exec form）
├── skills/describe-image/SKILL.md  # describe-image skill
├── skills/set-up/SKILL.md          # set-up 安装后引导 skill
├── dist/                           # 编译产物（随仓库提交，零构建）
└── src/                            # TypeScript 源码
```

**作为独立脚本使用**（不装插件也能用，前置要求 Node.js ≥ 20）：

```bash
git clone https://github.com/toRolex/periscope.git
cd periscope
node dist/cli/describe.js ./demo.png   # dist/ 已提交，无需 build
```

> 纯使用场景无需 `pnpm install`；它只在改源码或跑测试时需要。

### 宿主二 · dsh 原生插件（periscope-dsh）

dsh（deepseek-harness）是 DeepSeek 官方 Cordis 插件式 agent harness。periscope-dsh 以 npm 包 + `dsh.bundle` patch（bundle/profile 机制）安装：

```bash
# 本包提交 dist/，支持 git/file 免构建安装
dsh plugin --profile web add file:<本包绝对路径>

# 复查组合后的 cordis 树里出现了 periscope-deepseek 行
dsh --profile web --dump-config

# 启动 Web UI，模型选择器选中「periscope（看图桥 → deepseek）」下的模型
dsh web
```

dsh 检测到本包 `package.json` 声明的 `dsh.bundle.patch`，把包名追加进 `dsh.profile.bundles`；下次启动 profile 时，`cordis.patch.yml` 作为一层 insert 把 `periscope-deepseek` 插件行插进 cordis 树，注册 route。

---

## ⚙️ 配置

### Claude Code 侧 · `config.json`

配置文件路径 **`~/.config/periscope/config.json`**（可用 `PERISCOPE_CONFIG` 覆盖）。首次运行任意命令时**懒创建空白模板**（三协议 `baseUrl` / `model` 为空串，**不绑定任何服务商**），需用 `node dist/cli/init.js` 或手改填入你自己的视觉端点。

填入端点后示例（openai 协议、DashScope 兼容模式）：

```json
{
  "protocol": "openai",
  "apiKey": "sk-xxx",
  "openai": {
    "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "model": "qwen-vl-max"
  },
  "anthropic": { "baseUrl": "", "model": "" },
  "responses": { "baseUrl": "", "model": "" }
}
```

### dsh 侧 · `cordis.yml` + env

dsh 侧配置走 dsh Config（cordis.yml + schemastery 校验 + env fallback），**apiKey 仅从环境变量读取**，不写进配置：

```yaml
- insert:
    - id: periscope-deepseek
      name: 'periscope-dsh'
      config:                         # 全部可选；缺省走 env fallback
        protocol: openai              # openai | anthropic | responses
        baseUrl: https://your-vision-endpoint.example.com/v1
        model: your-vision-model
        apiKeyEnv: PERISCOPE_API_KEY  # 承载视觉 key 的环境变量名（默认即此）
```

也可纯用 env fallback（见下「环境变量」），或用 snippet 脚本生成可粘贴片段（见「dsh 插件详解」）。

### 三协议

`protocol` 决定当前使用的协议适配器，每个协议有独立的 `baseUrl` / `model`：

| protocol    | 请求端点                     | 鉴权方式                                              | 示例 model                 |
| ----------- | ---------------------------- | ----------------------------------------------------- | -------------------------- |
| `openai`    | `{baseUrl}/chat/completions` | `Authorization: Bearer`                               | `qwen-vl-max`              |
| `anthropic` | `{baseUrl}/v1/messages`      | `x-api-key` + `anthropic-version: 2023-06-01`         | `claude-3-5-sonnet-latest` |
| `responses` | `{baseUrl}/responses`        | `Authorization: Bearer`                               | `gpt-4o-mini`              |

- **openai（默认，仅指请求形状）**：兼容 OpenAI chat/completions 格式的端点都可用，不默认指向任何服务商。
- **anthropic**：走 Anthropic Messages API，图片以 base64 的 `image` content block 发送。
- **responses**：走 OpenAI Responses API，图片以 `input_image` 块发送。

### 环境变量

**Claude Code 侧：**

| 环境变量              | 作用                                                   | 优先级                  |
| --------------------- | ------------------------------------------------------ | ----------------------- |
| `PERISCOPE_API_KEY`   | 视觉端点 API key                                        | 优先于配置文件 `apiKey` |
| `PERISCOPE_CONFIG`    | 配置文件路径（默认 `~/.config/periscope/config.json`） | 覆盖默认路径            |
| `PERISCOPE_CACHE_DIR` | 缓存目录（默认 `~/.cache/periscope/`）                 | 覆盖默认目录            |

**dsh 侧（env fallback，apiKey 仅从 env）：**

| 环境变量                    | 作用                                       |
| --------------------------- | ------------------------------------------ |
| `PERISCOPE_VISION_PROTOCOL` | 视觉端点协议 fallback（默认回落 `openai`） |
| `PERISCOPE_VISION_BASE_URL` | 视觉端点 baseUrl fallback                  |
| `PERISCOPE_VISION_MODEL`    | 视觉端点模型 fallback                      |
| `PERISCOPE_API_KEY`         | 视觉 apiKey（或 `apiKeyEnv` 指定的变量）   |

---

## 🛠️ 用法

### `describe` —— 描述图片

```bash
node dist/cli/describe.js <图片路径或URL> [...] [--intent ocr|table|chart|"描述内容"]
```

- `<图片路径或URL>`：本地图片路径或 `http(s)` 图片 URL，可传多个，空格分隔；远程 URL 直接透传给视觉端点，无需先下载。
- `--intent ...`（可选）：命中内置任务模板名（`ocr` / `table` / `chart`）时用内置 prompt；其他文本原样透传给模型；缺省保持默认描述文案。
- 插件环境里用 `node ${CLAUDE_PLUGIN_ROOT}/dist/cli/describe.js <图片路径或URL> [...]`。

**输出与退出码**：单图 stdout 输出纯文本描述；多图逐行 `${source}: ${描述}`，并行请求（总耗时约等于最慢单图）。成功退出码 `0`；失败（缺参数 / 文件不存在 / 端点非 2xx 等）错误走 stderr、退出码非零。

### 任务模板（ocr / table / chart）

| 模板名  | 作用                              | 内置 prompt                          |
| ------- | --------------------------------- | ------------------------------------ |
| `ocr`   | 提取图片中的全部文字              | `提取图片中的全部文字内容`           |
| `table` | 把图片中的表格转换为 Markdown 表格 | `把图片中的表格转换为 Markdown 表格` |
| `chart` | 把图片中的图表转换为结构化文字描述 | `把图片中的图表转换为结构化文字描述` |

```bash
node dist/cli/describe.js ./截图.png --intent ocr
node dist/cli/describe.js ./表格.png --intent table
node dist/cli/describe.js ./柱状图.png --intent chart
node dist/cli/describe.js ./报错.png --intent "读取图片中的报错信息"   # 自由文本透传
```

### `init` —— 交互式配置脚本（wizard）

```bash
node dist/cli/init.js
```

在**独立终端（TTY）**运行的交互式配置脚本：↑/↓ 选择协议（回车确认）→ 逐项填写 `baseUrl` / `model`（必填）与 `apiKey`（可留空）→ 展示配置摘要 → `y` 确认覆盖写入。

- **无默认值**：`baseUrl` / `model` 必填，空输入报错退出；`apiKey` 可留空（Ollama / LM Studio 等本地端点不鉴权，留空后 describe 不发送鉴权头）。
- **确认覆盖**：目标文件已存在时先展示摘要 + 覆盖警告，`y` 才写入，其他键放弃。
- **非 TTY（管道/重定向）拒绝运行**，报错提示需在交互式终端中运行。

### `doctor` —— 本地自检

```bash
node dist/cli/doctor.js [--offline]
```

六项纯本地自检，逐项输出 `✅ / ⚠️ / ❌`（`❌` 项数即退出码）：config 文件存在性、三协议段 `baseUrl`+`model`、激活协议段非空、Node 版本（≥ 20）、`dist/` 编译产物在位、根 `plugin.json` 按 Agent Plugins 1.0.0 schema 校验。`--offline` 时连 schema 网络拉取也禁用（缓存缺失降级 `⚠️`，绝不发请求）。

### 贴图 hook（Claude Code 插件）

装成插件后，你贴图（或让 agent 引用本地图片 / URL）时，`hooks/hooks.json` 声明的 `UserPromptSubmit` hook 读取事件的 `image_paths`，并行描述各图，把 `[Image N] basename: 描述` 逐行注入 `additionalContext`：

```json
{
  "decision": "approve",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "[Image 1] a.png: 一只猫在窗台\n[Image 2] b.png: 描述不可用"
  }
}
```

- **始终放行**：`decision` 恒为 `approve`，绝不用描述失败阻塞消息发送；单图失败注入 `描述不可用`，不影响其余图片。
- **字符预算**：`additionalContext` 软预算约 9000 字符，接近上限截断并注明 `（另有 N 张图片未描述）`。
- **缓存复用**：同一图片（路径 + 修改时间 + 大小未变）多次贴图只请求一次视觉端点。

---

## 🌊 dsh 插件详解

periscope-dsh 在 dsh 的接入层形态是一**座桥（bridge adapter）**：一个声明 image 输入能力的 LlmAdapter。之所以是桥而非改写：dsh 的 image 能力 preflight 发生在 admission（早于 `agent/pre-step`），DeepSeek 文本路由声明无图时带图 prompt 根本到不了后续环节；桥接管 adapter 注册，admission 查到的是它声明的 image 能力（与内建 Pi-AI 同模式）。

**工作链路：**

```
Web 粘贴/拖拽图片 ─▶ durable attachment + ImageBlock
        │
        ▼
admission 查 bridge 声明的 image 能力 ─▶ 放行（不过 admission 就到不了这里）
        │
        ▼
stream()：读图字节 ─▶ BYOM 视觉端点译成文字 ─▶ ImageBlock 替换为 [Image N] 描述
        │
        ▼
委托 deepseek 主文本模型（provider 重写为 deepseek-official，model 原样透传）
```

- **自解释 route**：注册独立 route `periscope-deepseek`，出现在 Web UI 模型选择器的「periscope（看图桥 → deepseek）」分组下，用户显式选择。默认广告 `deepseek-v4-flash` / `deepseek-v4-pro` 两档（均附 image 能力）。
- **能力声明放行 admission**：`resolveModel` 对任意 model 声明 text + image 输入能力；纯文本历史零改动，委托体验等同直连 deepseek。
- **`image/described` 落 log**：翻译时向 session log 追加 log-only 事件 `image/described`（attachmentId → 描述），同时写一份到 dsh 诊断日志（`[periscope] image/described ...`），满足 model-visible ⟺ logged。
- **降级绝不中断**：视觉端点故障/超时降级 `[Image N] 描述不可用` 占位符并落 log；端点未配置降级为可操作引导占位符（指出 cordis.yml / env 配置位置）；均不抛错、不中断会话。
- **content-addressed 缓存**：以 attachmentId 作缓存 key，同图再发 / 历史重放命中缓存不重复请求下游，描述仍落 log。

**生成配置片段（snippet，非交互、离线）：**

```bash
node dist/snippet/cli.js --protocol openai --baseUrl http://localhost:11434/v1 --model qwen2.5-vl
# 或 bin：periscope-dsh-snippet ...；或 npm run snippet -- ...
```

输出可粘贴进 cordis.yml 的视觉端点配置片段 + env apiKey 指引，是 Claude Code 侧 init wizard 的 dsh 侧对应形态。

> **开发者预览说明**：dsh 处于 developer preview、破坏性迭代中，本插件以 commit pin 追踪其演进。已知缺口：`image/described` 事件在「进程重启后重载」会被 dsh 持久化层整体拒载（dsh 侧缺口，需其提供 out-of-repo 事件注册面后方可恢复）；在此之前，描述记录的可查副本走诊断日志。进程内的分叉/压缩读 live log 不受影响。

---

## 📜 Agent Plugins 1.0.0 合规

periscope 遵守 [Agent Plugins 1.0.0](https://agent-plugins.org) 标准（vercel + openai 联合发布的打包格式），被下列兼容 harness 作为标准插件目录加载：**VS Code、ChatGPT / Codex、Kiro、GitHub Copilot、Cursor**。

> Claude Code **不在** Agent Plugins 兼容客户端列表——它读自己的 `.claude-plugin/plugin.json` 与 `hooks/hooks.json`，不读根 `plugin.json`。两套结构互不冲突，Claude Code 体验不变。

- **根 `plugin.json`**：标准 manifest，含 `$schema` / `name` / `version` / `description` / `author`。
- **Skill 承载能力**：describe 能力以 `skills/describe-image/SKILL.md` 形式承载，兼容 harness 的 agent 读到后按指令调 `node dist/cli/describe.js`。
- **不上 MCP server**：不写 `mcp.json`、不把 describe 暴露为 MCP tool——避免在兼容 harness 工具列表里多一个噪音；视觉能力以 Skill 文本指令形式呈现。
- **Claude Code 原生结构保留**：`.claude-plugin/` + `hooks/hooks.json` + 现有 `skills/` 路径不动。

---

## 🧑‍💻 开发

- 依赖极简：devDependencies 仅 `typescript`（`@types/node` 不引入，手写 ambient 声明在 `src/global.d.ts`）。
- 构建：`pnpm build`（= `tsc`）；测试：`pnpm test`（= `tsc && node --test`），含 CLI、core、三协议、config、缓存、hook、插件契约与 mock 端点端到端冒烟。
- 本地 mock 视觉端点：`src/testing/mock-server.ts`（离线 HTTP server）+ `src/testing/fixtures.ts`（1x1 PNG 与临时配置/目录工具），供自动化冒烟替代真实端点。
- dsh 侧（`dsh-plugin/`）与主仓同构：`npm run build` / `npm test`（`tsc && node --test`），零运行时依赖。
- 双宿主 describe 引擎**各自保留副本、函数签名刻意一致**，接口稳定后抽独立 npm 包（届时是纯移动非重构）。

---

## ❓ 常见问题（FAQ）

**Q：图片描述缓存存在哪里？怎么清除？**
默认 `~/.cache/periscope/`，每张图一个 `<sha256>.txt`。`rm -rf ~/.cache/periscope` 全部失效，也可用 `PERISCOPE_CACHE_DIR` 指到别处。

**Q：为什么远程 URL 图片不走缓存？**
缓存 key 依赖本地文件的路径 + 修改时间 + 大小，远程 URL 内容可变且无本地 stat，故不落缓存、请求体直接透传 URL 给视觉端点。

**Q：没配置端点会怎样？**
Claude Code 侧 describe 报「协议 X 未配置 baseUrl/model，请运行 init」；dsh 侧该图降级为可操作引导占位符并落 log。没配 `apiKey` 时请求不带鉴权头（本地无鉴权端点不受影响）。

**Q：视觉端点挂了会阻塞会话吗？**
不会。Claude Code hook 恒为 `approve`、单图失败注入 `描述不可用`；dsh 桥降级占位符，绝不抛错中断会话。

**Q：需要安装 TypeScript / 运行 build 吗？**
纯使用不需要，`dist/` 已随仓库提交。`pnpm install` / `pnpm build` 只在改源码或跑测试时需要。

**Q：Node 版本要求？**
Node.js ≥ 20（代码与测试使用内建 `fetch` 与 `node:test`）。

---

## 📄 License

待定（发布前补充 LICENSE 文件）。
