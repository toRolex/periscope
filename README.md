<div align="center">
  <img src="./assets/readme/hero.svg?v=2" width="100%" alt="periscope —— 给纯文本 coding agent 的视觉桥，把图片译成文字描述">
</div>

<p align="center">
  <img src="https://img.shields.io/github/stars/toRolex/periscope?style=flat-square&logo=github&color=141414&logoColor=B79A5B" alt="GitHub stars" />
  <img src="https://img.shields.io/github/license/toRolex/periscope?style=flat-square&color=B79A5B" alt="License: GPL-3.0" />
  <img src="https://img.shields.io/badge/Node-%E2%89%A522-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node ≥ 22" />
  <img src="https://img.shields.io/badge/Agent%20Plugins-1.0.0-141414?style=flat-square" alt="Agent Plugins 1.0.0" />
</p>

<div align="center">⭐ 如果这个项目对你有帮助，欢迎点个 Star。</div>

<div align="center">🥇 DeepSeek Harness 最好的"眼睛" 🥇</div>

<div align="center">

[特性](#特性) • [工作机制](#工作机制) • [快速上手](#快速上手) • [用法](#用法) • [配置](#配置) • [FAQ](#faq) • [开发](#开发)

</div>

periscope 是给纯文本 coding agent 的视觉桥：把图片译成文字描述，让只读文字的 agent 也能看懂截图、报错、表格和架构图。它以 **Agent Plugins 1.0.0** 标准打包，兼容 harness 可直接加载；Claude Code 与 dsh 不读该格式，因此各带一层专属适配。

> [!NOTE]
> **为什么有两个专属适配？**
> Agent Plugins 只定义兼容 harness 的加载方式。Claude Code 读自己的 `.claude-plugin/` 格式，dsh 读 cordis patch——两者都不读标准的 `plugin.json`，所以 periscope 为它们各提供一层适配。除此之外的 agent 无需任何额外适配。

## 特性

- **接入任意 agent** — Agent Plugins 标准插件，兼容 harness 直接加载，Claude Code / dsh 单独适配
- **BYOM 三协议** — openai / anthropic / responses 按需切换，视觉模型自带，不绑定任何服务商
- **零构建零依赖** — `dist/` 随仓库提交，Node ≥ 22 直接跑，不装 TypeScript、不跑 build
- **绝不中断会话** — 端点故障降级 `[Image N] 描述不可用` 占位符，hook 始终放行、桥绝不抛错
- **本地缓存** — 同图命中缓存，不重复请求视觉端点

## 工作机制

<div align="center">
  <img src="./assets/readme/architecture.svg?v=2" width="100%" alt="periscope 工作链路：图片经三协议桥到视觉端点，输出 [Image N] 文字描述，供 Agent Plugins 兼容 harness、Claude Code、dsh 三种接入层消费">
</div>

图片 / 路径 / URL 经 periscope 的**三协议桥**送到你的视觉端点（BYOM），得到文字描述后以 `[Image N] 名称: 描述` 的形式交给接入层。三种接入层共享同一条 describe 能力：

| 接入层 | 加载方式 | 能力 |
| --- | --- | --- |
| Agent Plugins 兼容 harness | 直接加载（根 `plugin.json` + `skills/describe-image`） | agent 按 skill 指令调 `describe.js` |
| Claude Code | `.claude-plugin/` + `hooks/hooks.json` + `skills/` | 贴图自动注入描述，或 `/describe-image` 手动触发 |
| dsh（deepseek-harness） | npm 包 `periscope-dsh` + `dsh.bundle` patch | 注册 `periscope-deepseek` route，Web UI 选中即看图 |

## 快速上手

### 前置要求

- **Node.js ≥ 22** — 仅独立脚本方式需要；作为插件使用无需安装任何依赖

### Claude Code

```bash
# ① 安装插件
claude plugin marketplace add toRolex/periscope
claude plugin install periscope

# ② 配置视觉端点（独立终端运行交互式 wizard）
node dist/cli/init.js
```

装好后直接在会话里贴一张截图，agent 自动读出描述；或手动运行：

```bash
node dist/cli/describe.js ./截图.png --intent ocr
# error TS2322: Type 'string' is not assignable to type 'number'
#   at src/example.ts:42:5
```

> [!TIP]
> 在会话里敲 `/set-up` 可以引导完成配置并自动跑 doctor 自检。

不装插件也能用独立脚本：

```bash
git clone https://github.com/toRolex/periscope.git
cd periscope
node dist/cli/describe.js ./demo.png   # dist/ 已提交，无需 build
```

### dsh（deepseek-harness）

```bash
# ① 安装（本包提交 dist/，支持 git/file 免构建安装）
dsh plugin --profile web add file:<本包绝对路径>
dsh --profile web --dump-config   # 复查 cordis 树里出现 periscope-deepseek 行

# ② 用环境变量配置视觉端点（apiKey 只从 env 读，协议缺省 openai）
export PERISCOPE_API_KEY=sk-xxx
export PERISCOPE_VISION_BASE_URL=http://localhost:11434/v1
export PERISCOPE_VISION_MODEL=qwen2.5-vl

# ③ 启动 Web UI，模型选择器选「periscope（看图桥 → deepseek）」即看图
dsh web
```

env 是最短配置路径；想写进 `cordis.yml` 的完整写法见[配置](#配置)。

### 其他 harness

Agent Plugins 兼容 harness（VS Code / ChatGPT-Codex / Kiro / GitHub Copilot / Cursor）直接加载标准插件即可，agent 会在需要读图时按 `skills/describe-image` 的指令调用 `describe.js`，无需任何额外适配。

## 用法

### describe —— 描述图片

```bash
node dist/cli/describe.js <图片路径或URL> [...] [--intent ocr|table|chart|"描述内容"]
```

- 多图以空格分隔、并行请求（总耗时约等于最慢单图）；远程 URL 直接透传，无需下载。
- `--intent` 命中内置任务模板，其他文本原样透传给模型。
- 成功退出码 `0`；失败信息走 stderr、退出码非零。

内置任务模板：

| 模板 | 作用 |
| --- | --- |
| `ocr` | 提取图片中的全部文字 |
| `table` | 把图片中的表格转换为 Markdown 表格 |
| `chart` | 把图片中的图表转换为结构化文字描述 |

### init —— 交互式配置

```bash
node dist/cli/init.js
```

在独立终端（TTY）运行的交互式 wizard：选择协议 → 填写 `baseUrl` / `model`（apiKey 可留空，本地端点无需鉴权）→ 确认写入配置文件。

### doctor —— 本地自检

```bash
node dist/cli/doctor.js [--offline]
```

六项纯本地自检（config 存在性、三协议段、Node 版本、`dist/` 产物、插件 manifest），不发起外部请求；`--offline` 禁用一切网络拉取。

### Claude Code 贴图 hook

装成插件后，贴图（或让 agent 引用本地图片 / URL）时自动触发：并行描述各图，把 `[Image N] basename: 描述` 逐行注入上下文。**始终放行**——端点故障注入「描述不可用」，绝不阻塞会话；同一图片命中本地缓存不重复请求。

### dsh 桥

`periscope-deepseek` route 把 ImageBlock 经视觉端点译成文字，再委托给主文本模型（默认 deepseek）；端点故障降级为可操作引导占位符并落 log，不中断会话。

## 配置

配置文件默认 `~/.config/periscope/config.json`（`PERISCOPE_CONFIG` 可覆盖）。首次运行懒创建空模板，用 `init` wizard 或手改填入端点。

`protocol` 决定当前使用的协议适配器，每个协议有独立的 `baseUrl` / `model`：

| protocol | 请求端点 | 鉴权 | 示例 model |
| --- | --- | --- | --- |
| `openai`（默认） | `{baseUrl}/chat/completions` | Bearer | `qwen-vl-max` |
| `anthropic` | `{baseUrl}/v1/messages` | `x-api-key` | `claude-3-5-sonnet-latest` |
| `responses` | `{baseUrl}/responses` | Bearer | `gpt-4o-mini` |

> `openai` 只指请求形状：兼容 chat/completions 格式的端点都可用，不默认指向任何服务商。

环境变量：

| 变量 | 作用 |
| --- | --- |
| `PERISCOPE_API_KEY` | 视觉端点 API key（优先于配置文件） |
| `PERISCOPE_CONFIG` | 配置文件路径 |
| `PERISCOPE_CACHE_DIR` | 缓存目录（默认 `~/.cache/periscope/`） |
| `PERISCOPE_VISION_*` | dsh 侧 env fallback（protocol / baseUrl / model） |

### dsh 侧：cordis.yml

dsh 侧配置走 dsh Config（cordis.yml + env fallback），apiKey 仅从环境变量读取，不写进配置：

```yaml
- insert:
    - id: periscope-deepseek
      name: 'periscope-dsh'
      config:                         # 全部可选；缺省走 env fallback
        protocol: openai              # openai | anthropic | responses
        baseUrl: https://your-vision-endpoint.example.com/v1
        model: your-vision-model
```

> [!IMPORTANT]
> dsh 侧的 `apiKey` 只从环境变量读取（`PERISCOPE_API_KEY` 或 `config.apiKeyEnv` 指定的变量），不会写进任何配置文件。

## FAQ

- **缓存在哪 / 怎么清？** `~/.cache/periscope/`，每图一个 `<sha256>.txt`；`rm -rf` 即可，或用 `PERISCOPE_CACHE_DIR` 指到别处。
- **远程 URL 为什么不走缓存？** 缓存 key 依赖本地文件的路径 + 修改时间 + 大小，URL 无本地 stat。
- **没配置端点会怎样？** describe 报错并引导运行 init；dsh 侧降级为可操作引导占位符。本地端点（Ollama 等）可不填 apiKey，请求不带鉴权头。
- **端点挂了会阻塞会话吗？** 不会，始终降级为「描述不可用」，hook 恒 `approve`。
- **需要装 TypeScript / 跑 build 吗？** 纯使用不需要，`dist/` 已提交；`pnpm install` 只在改源码或跑测试时需要。
- **Node 版本要求？** Node.js ≥ 22。

## 开发

- devDependencies 仅 `typescript`；`pnpm build` 构建、`pnpm test` 测试（`tsc && node --test 'dist/**/*.test.js'`）。
- 离线 mock 视觉端点 `src/testing/mock-server.ts` 供自动化冒烟；`dsh-plugin/` 与主仓同构。
- describe 引擎叶子（协议适配器 / 任务模板 / HTTP 传输）已收敛到 `engine/` 共享包（见 ADR 0004）；describe / config 双宿主各保留副本，由 `contract/` 契约测试锁定签名一致。
- 更多项目背景与术语见 [CONTEXT.md](./CONTEXT.md)，架构决策见 [docs/adr](./docs/adr)。

报 bug / 提需求 / 交流走 [GitHub Issues](https://github.com/toRolex/periscope/issues)。
