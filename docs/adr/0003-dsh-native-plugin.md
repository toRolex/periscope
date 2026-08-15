# ADR 0003: periscope 以 dsh 原生插件形态扩展到 deepseek-harness

- 状态：提议
- 日期：2026-08-15
- 关联：ADR 0001（Agent Plugins 合规化）之后第三条接入通道的形态决策
- 关联调研：deepseek-harness commit pin `47f943859bef60e4160492346772ded9b24f765a`（2026-08-13，developer preview，破坏性迭代中）

## 背景

deepseek-harness（dsh）为 DeepSeek 官方 Cordis 插件式 agent harness（"一切皆插件"）。它已有完整图片链路——Web 粘贴 → durable attachment（content-addressed）→ 消息带 `ImageBlock`——但 DeepSeek 文本路由声明无 image 能力，带图 prompt 在 admission 阶段即被拒绝（早于 `agent/pre-step`）；Pi-AI 是唯一视觉输入路由。periscope"把图译成文字喂纯文本 agent"正是 dsh 缺失的能力。经 grilling 设计树收敛与两轮强模型顾问评审，确定插件形态。

## 决策

1. **形态：文本桥接 LlmAdapter**。periscope 注册一个声明 image 输入能力的 provider route，`stream()` 内用 BYOM 视觉端点把 `ImageBlock` 译成文字后委托给主文本模型（默认 deepseek）。结构性优于 `agent/pre-step` 改写：host 的 image-capability preflight 发生在 admission（早于 pre-step），DeepSeek 声明无图时带图 prompt 根本到不了 pre-step；wrapper 接管 adapter 注册，admission 查到的是它声明的 image 能力（与 Pi-AI 同模式，机制已验证）。
2. **路由激活：独立 route、命名自解释**（如 `periscope-deepseek`），用户在 Web UI 模型选择器显式选择。自包含、不依赖 base bundle 内部行 id（dsh 破坏性迭代期最抗摔）。无缝替换（patch 官方 deepseek adapter 行）记为回退路径，不作主方案。
3. **配置：dsh Config**（cordis.yml + schemastery + env fallback），apiKey 走 env；现有 init wizard 降级为生成 cordis.yml 片段的便利脚本。
4. **入口：只自动处理 ImageBlock**（Web 粘贴/拖拽），不加 `describe_image` 工具——维持 ADR 0001"不进工具列表"原则。
5. **log 不变量：新增 log-only session event `image/described`**（attachmentId → 描述），翻译时 append；BYOM 失败降级为 `[Image N] 描述不可用` 占位符（同样落 log），绝不抛错中断会话。满足 model-visible ⟺ logged（`SessionEventMap` merge-extensible，第三方插件可经 declaration merging 扩展，已源码验证）。
6. **引擎共享：双宿主拷贝 + 签名一致**。Claude Code 版与 dsh 版各自保留 describe 引擎副本，但刻意保持函数签名一致，接口稳定后抽独立 npm 包（届时是纯移动非重构）。dsh 桥接接口一天一变，此刻抽包是流沙上打地基。
7. **双宿主并存**：Claude Code hook/skill/独立脚本不动，dsh 插件是平行渠道。

## 备选方案

- **BYOM 视觉路由（对标 Pi-AI）**：与内建 Pi-AI 定位重叠，且偏离"喂纯文本 agent"核心定义。拒绝。
- **复用 dsh hooks-claude-code 桥**：`UserPromptSubmit` 映射到 `agent/pre-step`（admission 之后），且为 partial（仅 blocking + JSON additionalContext），不能改写 `ImageBlock`；带图 prompt 在 admission 已被 catalog 拦截，pre-step 收不到图。不构成更便宜的路径。
- **`agent/pre-step` 改写 claimed messages**：被 admission preflight 前置性否决（见决策 1）；且改写是 live 非 durable，log 不变量更难满足。
- **无缝替换 deepseek route**：体验无感，但依赖 base bundle 行 id（会随 dsh 迭代失效）、与官方适配器同 route 冲突（duplicates throw，须 disable 官方行）。保留为回退路径。

## 对 dsh 未冻结行为的假设清单（developer preview，随时失效）

| 假设 | 失效征兆 | 回退 |
|---|---|---|
| 声明 image 能力即可过 admission | dsh 改为看 provider 白名单/模型 id 前缀 | 无缝替换 patch 方案（决策 2 的回退） |
| `stream()` 入参中 `ImageBlock` 结构稳定 | ImageBlock 字段变更 | 桥接层内加窄 `ImageBlock` 归一化函数，爆炸半径限一个文件 |
| `registerAdapter` / `ctx.attachments` / `SessionEventMap` 签名稳定 | 破坏性 API 变更 | 重评本 ADR；以 commit pin 追踪 dsh 演进 |

## 影响

- 新增 dsh 插件包（npm + `dsh.bundle` patch 挂 profile），describe 引擎以副本形式并入。
- CONTEXT.md 增补 dsh / 双宿主 / 桥 术语。
- 后续切片：dsh 插件骨架（route 注册 + Config）、describe 引擎拷贝、`image/described` 事件、BYOM 翻译接入。按 Q3 约定，本轮不写插件代码。

## 配置面边界与 backlog（2026-08-15 补充）

periscope-dsh 的视觉端点配置停留在 dsh Config（cordis.yml patch + env fallback），**不提供 dsh Web UI 可视化配置界面**。判定依据：

- **dsh Models 页对第三方插件 closed**：`ProviderEditor.layoutOf` 按 settings 命名空间硬编码，仅 `llm-deepseek` / `llm-pi-ai` 有手写表单，其余落 `unknown` 只渲染 hint；`registerConfigurableProviders` 只能把 provider 列入目录，拿不到表单。
- **要获得 Web UI 表单的唯一路径是 browser half**：React 组件 + package.json `dsh.client` 声明 + tsdown 预构建 client bundle，经 client-modules 装载 + slots 注册 `settings.plugin.item` 卡片。成本是引入 react + tsdown + `@deepseek-ai/dsh-client-*` 依赖链，与主仓"零构建零依赖"哲学相悖；且 dsh 破坏性迭代期该装载面最易变（与决策 6"流沙上打地基"同理）。
- **配置痛点已被覆盖**：snippet 生成器（#30）+ 未配置时的可操作引导占位符（指出 cordis.yml / env 位置），零 dsh-UI 耦合。

**Backlog（重开条件）**：dsh 冻结 client-module / slot API，且确认仓外 `file:`/git 包可被 client-modules 装载。已核实的可行性信号：`ctx.loader.entries()` 覆盖 bundles 里的 cordis 插件、`require.resolve('<spec>/package.json')` 可解析 `file:` 安装包——机制上可行。届时路径：`settings.plugin.item` 卡片 + `dsh.client` + tsdown bundle。风险：声明 `dsh.client` 但 bundle 缺失会致 dsh web 启动 loud throw（`ClientPackageCompositionError`）；client-modules 负缓存永不过期，加声明需重启生效。
