# 🔭 periscope

**`Agent Plugins 1.0.0 · 任意 harness 可加载`**  **`BYOM 不绑定服务商`**  **`零构建`**  **`零运行时依赖`**

<p align="center">
  <img src="https://img.shields.io/github/stars/toRolex/periscope?style=flat-square&logo=github&color=2e6cc4" alt="GitHub stars" />
  <img src="https://img.shields.io/github/license/toRolex/periscope?style=flat-square&color=red" alt="License: GPL-3.0" />
  <img src="https://img.shields.io/badge/Node-%E2%89%A522-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node ≥ 22" />
  <img src="https://img.shields.io/badge/Agent%20Plugins-1.0.0-blueviolet?style=flat-square" alt="Agent Plugins 1.0.0" />
</p>

> **给纯文本 coding agent 的视觉桥**：把图片译成文字描述。
> 截图、报错堆栈、表格、架构图，只读文字的 agent 也能「看」懂。

```text
你贴图 / 给路径 / 给 URL
        │
        ▼
periscope 视觉桥（openai · anthropic · responses 三协议按需切换）
        │
        │ ──▶ 你的视觉端点（BYOM）
        │      · Ollama / LM Studio
        │      · 自建网关 / 任意 OpenAI 兼容云
        │ ◀── 文字描述
        ▼
[Image 1] 截图.png: 一张终端报错堆栈的截图……
        │
        ▼
纯文本 coding agent —— 只读文字，也「看」懂了图
```

periscope 以 **Agent Plugins 1.0.0** 标准打包，主形态是一个标准插件：VS Code、ChatGPT/Codex、Kiro、GitHub Copilot、Cursor 等兼容 harness 都能直接加载。Claude Code 与 dsh 不读 Agent Plugins 格式，因此各带一层专属适配；除此之外的 agent 无需任何额外适配。

- 🧭 **接入任意 agent**：Agent Plugins 标准插件，兼容 harness 直接加载；Claude Code / dsh 仅因格式不兼容而单独适配
- 🧭 **BYOM 三协议**：openai / anthropic / responses 按需切换，视觉模型自带，不绑定任何服务商
- 🛡️ **绝不中断会话**：端点故障降级 `[Image N] 描述不可用` 占位符，hook 始终放行、桥绝不抛错
- ⚡ **零构建零依赖**：`dist/` 随仓库提交，Node ≥ 22 直接跑，不装 TypeScript、不跑 build

---

## 🚀 快速上手

两条路径二选一，同一个 describe 能力。

### 路径一 · Claude Code

```bash
# ① 装成 Claude Code 插件
claude plugin marketplace add toRolex/periscope
claude plugin install periscope

# ② 接入你的视觉端点（独立终端运行交互式 wizard；也可在会话里敲 /set-up 引导）
node dist/cli/init.js
```

装好后直接在会话里贴一张截图，agent 自动读出描述；或手动描述：

```bash
node dist/cli/describe.js ./截图.png --intent ocr
# error TS2322: Type 'string' is not assignable to type 'number'
#   at src/example.ts:42:5
```

### 路径二 · dsh（deepseek-harness）

```bash
# ① 装成 dsh 插件（本包提交 dist/，支持 git/file 免构建安装）
dsh plugin --profile web add file:<本包绝对路径>
dsh --profile web --dump-config   # 复查：cordis 树里应出现 periscope-deepseek 行

# ② 用环境变量配好视觉端点（apiKey 只从 env 读；协议缺省 openai）
export PERISCOPE_API_KEY=sk-xxx
export PERISCOPE_VISION_BASE_URL=http://localhost:11434/v1
export PERISCOPE_VISION_MODEL=qwen2.5-vl

# ③ 启动 Web UI，模型选择器选「periscope（看图桥 → deepseek）」即看图
dsh web
```

env 是最短配置路径；想写进 cordis.yml 的完整写法见「接入方式 · dsh」。

---

## 🔌 接入方式

| harness | 加载方式 | 能力 |
| --- | --- | --- |
| VS Code / ChatGPT-Codex / Kiro / GitHub Copilot / Cursor | 直接加载标准插件（根 `plugin.json` + `skills/describe-image`） | agent 按 skill 指令调 `describe.js` |
| Claude Code | `.claude-plugin/` + `hooks/hooks.json` + `skills/` | 贴图自动注入描述，或 `/describe-image` 手动触发 |
| dsh（deepseek-harness） | npm 包 `periscope-dsh` + `dsh.bundle` patch | 注册 `periscope-deepseek` route，Web UI 选中即看图 |

两套结构互不冲突：根 `plugin.json` 是 Agent Plugins 标准 manifest，`.claude-plugin/` 是 Claude Code 专属，各自读各自的。

### Claude Code

贴图时 hook 自动把 `[Image N] basename: 描述` 注入会话。端点故障降级为「描述不可用」，hook 恒为 `approve`，绝不阻塞会话；同一图片命中本地缓存不重复请求。

不装插件也能用独立脚本（前置仅 Node ≥ 22）：

```bash
git clone https://github.com/toRolex/periscope.git
cd periscope
node dist/cli/describe.js ./demo.png   # dist/ 已提交，无需 build
```

### dsh（periscope-dsh）

安装与三步使用见「快速上手 · 路径二」。dsh 侧配置走 dsh Config（cordis.yml + env fallback），apiKey 仅从环境变量读取；env 之外想显式写进配置：

```yaml
- insert:
    - id: periscope-deepseek
      name: 'periscope-dsh'
      config:                         # 全部可选；缺省走 env fallback
        protocol: openai              # openai | anthropic | responses
        baseUrl: https://your-vision-endpoint.example.com/v1
        model: your-vision-model
```

桥的工作链路（ImageBlock → 视觉端点译文字 → 委托主文本模型）见「用法 · dsh 桥」。

---

## ⚙️ 配置

配置文件默认 `~/.config/periscope/config.json`（`PERISCOPE_CONFIG` 可覆盖）。首次运行懒创建空模板，用 `node dist/cli/init.js`（交互式 wizard，独立终端运行）或手改填入端点；`node dist/cli/doctor.js` 做六项本地自检（不发起外部请求）。

**三协议**（`protocol` 决定适配器，各自独立 `baseUrl` / `model`）：

| protocol | 请求端点 | 鉴权 | 示例 model |
| --- | --- | --- | --- |
| `openai`（默认） | `{baseUrl}/chat/completions` | Bearer | `qwen-vl-max` |
| `anthropic` | `{baseUrl}/v1/messages` | `x-api-key` | `claude-3-5-sonnet-latest` |
| `responses` | `{baseUrl}/responses` | Bearer | `gpt-4o-mini` |

> `openai` 只指请求形状：兼容 chat/completions 格式的端点都可用，不默认指向任何服务商。

**环境变量：**

| 变量 | 作用 |
| --- | --- |
| `PERISCOPE_API_KEY` | 视觉端点 API key（优先于配置文件） |
| `PERISCOPE_CONFIG` | 配置文件路径 |
| `PERISCOPE_CACHE_DIR` | 缓存目录（默认 `~/.cache/periscope/`） |
| `PERISCOPE_VISION_*` | dsh 侧 env fallback（protocol / baseUrl / model） |

---

## 🛠️ 用法

### describe —— 描述图片

```bash
node dist/cli/describe.js <图片路径或URL> [...] [--intent ocr|table|chart|"描述内容"]
```

- 多图空格分隔、并行请求（总耗时约等于最慢单图）；远程 URL 直接透传，无需下载。
- `--intent` 命中内置任务模板（`ocr` 提取文字 / `table` 转 Markdown 表格 / `chart` 转结构化描述），其他文本原样透传。
- 成功退出码 `0`；失败走 stderr、退出码非零。

### 贴图 hook（Claude Code）

贴图自动触发，把 `[Image N] basename: 描述` 逐行注入上下文；端点故障注入「描述不可用」，hook 恒 `approve` 不阻塞会话；同图命中缓存不重复请求。

### dsh 桥

`periscope-deepseek` route 把 ImageBlock 经视觉端点译成文字，再委托给主文本模型（默认 deepseek）；端点故障降级为可操作引导占位符并落 log，不中断会话。

---

## 🧑💻 开发

- devDependencies 仅 `typescript`；`pnpm build` 构建、`pnpm test` 测试（`tsc && node --test 'dist/**/*.test.js'`）。
- 离线 mock 视觉端点 `src/testing/mock-server.ts` 供自动化冒烟。
- `dsh-plugin/` 与主仓同构；两侧 describe 引擎各保留一份副本、函数签名刻意一致，接口稳定后抽独立 npm 包（届时是纯移动非重构）。

---

## ❓ FAQ

- **缓存在哪 / 怎么清？** `~/.cache/periscope/`，每图一个 `<sha256>.txt`，`rm -rf` 即可，或用 `PERISCOPE_CACHE_DIR` 指到别处。
- **远程 URL 为什么不走缓存？** 缓存 key 依赖本地文件的路径 + 修改时间 + 大小，URL 无本地 stat。
- **没配置端点会怎样？** describe 报错并引导运行 init；dsh 侧降级为可操作引导占位符。本地端点（Ollama 等）可不填 apiKey，请求不带鉴权头。
- **端点挂了会阻塞吗？** 不会，始终降级为「描述不可用」，hook 恒 `approve`。
- **需要装 TypeScript / 跑 build 吗？** 纯使用不需要，`dist/` 已提交。`pnpm install` 只在改源码或跑测试时需要。
- **Node 版本？** ≥ 22。

---

## 📄 License

**GPL-3.0**：可自由使用、修改、再分发，但任何衍生作品必须以同样协议开源。全文见 [LICENSE](./LICENSE)。报 bug / 提需求 / 交流走 [GitHub Issues](https://github.com/toRolex/periscope/issues)。
