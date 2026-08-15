# spike #32 — browser half 全链路最小往返验证（即弃）

> 这是 **spike（issue #32）** 的即弃验证产物，不是正式功能。结论以 `gh issue comment 32` 为准；本目录
> 保留最小双 half 包与结论记录备查。`spike/browser-half/` 是一个可 `file:` 安装到 dsh web profile 的
> 最小包，用过即弃。

## 最小包

`spike/browser-half/` 同时声明两个 half：

- **server host-half**（`dsh.bundle` → `cordis.patch.yml`）：普通 cordis 插件 `lib/index.js`，
  `apply()` 里 `ctx.settings.register('spike-visual', …)` 注册一个临时 settings 命名空间。
- **browser half**（`dsh.client` → `exports["./client"]` → `lib/client.js`）：手写的 CJS factory
  bundle（与 tsdown `clientBundle()` 产物同构），`require('react')` + `React.createElement` 渲染
  `settings.plugin.item` 占位卡片（单输入框 + 保存钮），并内置机制探针。

安装（到 web profile，会改写 `~/.dsh/profiles/web/package.json` 并追加 `dsh.profile.bundles`）：

```bash
dsh plugin --profile web add "file:$PWD/spike/browser-half"
# 新增 dsh.client 声明需重启 dsh web 生效（client-modules 负缓存永不过期）
```

## pin 核对结论

- 本机 dsh 是本地源码 checkout `~/Documents/Codes/githubProject/deepseek-harness`，
  HEAD = `47f943859bef60e4160492346772ded9b24f765a`，与 ADR 0003 pin **完全一致**，工作树 clean。
- 运行中的 dsh（`~/Library/pnpm/bin/dsh` → `apps/cli/lib/bin.js`）即该源码的构建产物；
  装载面 API（`dsh.client` 解析、`exports["./client"]`、`ClientPackageCompositionError`、
  `settings.plugin.item` slot、client-modules 扫描/serve）在 `lib/` 中均在（lib 新于 src）。
- **结论：装载面无漂移。**

## 验收项实测

| 验收项 | 结果 | 证据 |
|---|---|---|
| pin / 装载面漂移核对 | ✅ 完成 | 见上，无漂移 |
| `file:` 包被 client-modules 扫到，`/plugins/<id>/client.js` serve | ✅ 通过 | `GET /plugins/dsh-spike-browser-half/client.js` → `200 text/javascript`；`__DSH_BOOT__` 含该 entry（`…/client.js?rev=…`） |
| 占位卡片渲染在 Plugins 设置区 | ✅ 通过 | 卡片（输入框 + 保存钮）渲染在 设置→插件→插件配置 tab，与 shipped 的 终端/Agent循环/网页搜索 卡片并列 |
| `host.call→harness.handle→settings` 落盘读回 | ❌ 不通过 | 双重阻断，见下 |
| 删 client bundle 复现 loud throw | ✅ 通过 | `ClientPackageCompositionError`（AggregateError 包 `MissingClientBundleError`/ENOENT），dsh web 启动失败、不绑定端口 |

## 核心发现：往返被双重阻断

1. **`host.call` / `harness.handle` 在这条装载面上不存在。** 卡片探针渲染
   `typeof host=undefined harness=undefined styles=undefined require=function`。
   `file:` 声明 `dsh.client` 的包走 **client-modules 机制（机制 B）**：bundle 是 CJS factory
   （`require('react')` 取 React），经 `window.__ModuleLoader__.load` 自注册，`apply(ctx)` 拿真实
   client ctx。`host.call`/`harness.handle` 是 **机制 A**（cordis 动态包：tool-cordis +
   cordis-host-runner 的 `node:vm` 沙盒 + cordis-client-runner 的闭包沙盒，模型运行时 `cordis/define`
   产出）专属 RPC，与 `dsh.client` 装载面是两条不同路径。

2. **settings 网关过滤第三方命名空间。** 机制 B 的 settings 传输是 `ctx.settingsScope.bind()` →
   api gateway 的 `settings.describe/mutate`。但 gateway 的 describe 与 write 都过
   `exposedNamespaces()` 硬编码白名单（`modelProviderNamespaces()` + `WEB_SETTINGS_NAMESPACES`
   [agent-loop/shell/locale/permission/ui-conversation/ui-theme/web-search-deepseek] +
   `PRODUCT_SETTINGS_NAMESPACES`[ui-onboarding/agent-presets]）。本包的 `spike-visual` **已在 host
   成功注册**（host 日志 `register ok` 证实），仍被过滤：
   - describe → 卡片 `status=unavailable`（读不到）；
   - 原始 `mutate` 实测返回
     `{"code":"settings-not-exposed","message":"settings namespace \"spike-visual\" is not exposed to configuration clients"}`；
   - `~/.dsh/settings.yaml` 不落盘。
   源码注释明确：让插件经 `settings.register()` 自暴露命名空间「**is deferred work**」。
   `registerConfigurableProviders` 只把 LLM provider 列入目录，不是任意 settings 命名空间的暴露路径。

## 结论

**按 issue 指定的机制，spike 不通过。** browser half 的 UI 装载与渲染可行（机制 B 成立：卡片真实渲染
在 Plugins 设置区），但第三方 `file:` 插件**无法完成 browser→settings 的持久化往返**——既没有
`host.call`/`harness.handle`，settings 网关又拒写未暴露的第三方命名空间。

→ 按 issue 的 go/no-go，**#31 回落到 ADR 0003 现状**（cordis.yml / env / snippet / 引导占位符）。

**更精确的重开条件**（满足其一再重启 #31）：

- dsh 让插件能把自己的 settings 命名空间暴露给配置客户端（当前为 deferred work）；或
- browser half 改用**包内私有 Remote RPC** 到本包 host handler、由 host 侧直写 `ctx.settings`
  （绕过 gateway 暴露过滤）——此路径机制不同、本 spike 未验证、且引入额外 host RPC 面，若要走需单独 spike。
