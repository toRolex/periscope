# ADR 0004: 共享 describe 引擎包（engine/）——双宿主叶子收敛

- 状态：accepted
- 日期：2026-08-16
- 关联：ADR 0003 决策 6 的执行方式

## 背景

ADR 0003 决策 6 预告「接口稳定后抽独立 npm 包（届时是纯移动非重构）」，但未定执行方式。落地前核实：

- `src/protocols/*`（openai/anthropic/responses/parse/types/index）、`src/core/templates.ts`、`src/transport.ts` 与 dsh 侧对应文件**逐字一致**（仅 `.js` import 后缀差异），且是**纯叶子模块**（protocols 只 import 同目录 types/parse，templates/transport 零 import）。
- `core/describe.ts` 已实质 drift：主仓 `DescribeInput.imagePath`（本地文件/URL + fs 磁盘缓存），dsh 版 `bytes:Uint8Array`（无 fs 缓存）；`DescribeOutcome.source` 语义也已悄悄漂移。
- 协议修复 / 模板修改是高频热点（git log 的 apiKey 凭据库、attachment 解包等修复横跨两个副本）——一次修复两处改，没有 locality。

## 决策

1. **仓内第三个 private 包 `engine/`（name `periscope-engine`）**：双 tsc 出 `dist/cjs` + `dist/esm`，package.json `exports` 条件映射（`require` → cjs / `import` → esm），两宿主 `file:` 依赖。源码 import 统一带 `.js` 后缀——TS 在 CJS（node10）与 nodenext 下都能把 `.js` 解析回 `.ts`，一次消解模块格式分裂。
2. **导出面冻结**：只 re-export `protocols/* + templates + transport` 的公共类型与函数；**不导出 describe/config**（两者差异大，保留宿主副本，由契约测试兜底）。
3. **无状态契约**：引擎不得引入单例或模块级缓存/可变状态——dual-package 分发下 CJS 与 ESM 各加载一份，任何模块级状态都会在双宿主间分裂。
4. **契约测试 `contract/describe-parity.test.mjs`**：纯 JS（零编译零依赖），对双宿主 dist 产物做运行时形状断言（DescribeOptions 注入面 / DescribeOutcome 形状 / 成功与失败路径 / 容错聚合语义）；刻意差异（DescribeInput.imagePath vs bytes、cacheDir 仅主仓）列入白名单注释。未来任何白名单外的 drift 都会使测试红。
5. **构建顺序固定**：`engine → 主仓 → dsh`（根 `pnpm build:all`）。file: 依赖 + 提交 dist 下，改引擎后必须按此顺序重 build，否则消费方跑到陈旧 dist。

## 备选方案

- **A. 一次性全抽 describe + config**：describe 输入形态差异大（imagePath vs bytes），config 是两套配置面（文件 vs settings/cordis/env），硬统一会牵动 dsh 桥接层。**拒绝**：修改面放大、回归面不可控；差异留副本 + 契约测试，后续单独统一。
- **B. 只加契约测试、不抽包**：协议修复仍在两处改，未消解「一处 bug 两处改」。**拒绝**。
- **C. 发布 registry npm 包**：两宿主都 private、零运行时依赖现状。**拒绝**：`file:` 依赖满足内部分享。

## 影响

- 新增 `engine/` 包；主仓与 `dsh-plugin/` 删除 `protocols/`、`templates.ts`、`transport.ts` 本地副本（源码 + dist 产物）。
- 主仓 162 测试（+contract 5）、dsh 180 测试、engine 35 测试全绿；`readme.test.ts` 的 7 项 README 内容断言为 pre-existing 失败（README 重写后测试未同步，独立修复，与本次重构无关）。
- 后续：describe/config 的统一（结构化图片 seam）见架构审查 Card 2，作为独立 candidate。
