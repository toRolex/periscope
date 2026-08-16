import type { Context, CredentialsService } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { SettingsProvider } from '@deepseek-ai/dsh-settings';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { SessionService } from '@deepseek-ai/dsh-session';
import { PeriscopeBridgeAdapter } from './adapter.js';
import { PERISCOPE_PROVIDER } from './route.js';
import { makeImageDescribedSink } from './stream-core.js';
import { ResolvedVisionConfig, VisionConfigInput, resolveVisionConfigWithSettings } from './vision-config.js';
import { PeriscopeSettingsPort, makePeriscopeRpcHandler } from './settings-rpc.js';
import { makeConnectionProbe } from './connection-probe.js';

/**
 * periscope 的 dsh 原生插件入口（cordis 插件形态，对齐官方 llm-deepseek 适配器的导出形状）。
 *
 * cordis 加载本模块时读取这四个命名导出：name / inject / Config（schemastery schema，
 * 校验 cordis.yml 里本插件的配置段）/ apply（入口，注册 periscope-deepseek route）。
 * 另附 default 导出同一插件对象，规避 ESM 宿主 import CommonJS 时命名导出探测的边界。
 *
 * 视觉端点配置三来源（#33，server 侧配置核心；浏览器侧配置卡片见 #34 browser half）：
 *   settings 命名空间 `periscope`（user 层，settings.yaml / 卡片写入）
 *   > cordis.yml entry（base 层，插件配置段）> env fallback（PERISCOPE_VISION_*）。
 *   优先级内建于 installSettingsSection 分层 + vision-config 纯函数的逐字段合并；
 *   apiKey 经 apiKeyEnv 命名的来源解析：dsh 凭据库（ctx.credentials）优先 > 进程环境变量兜底
 *   （与 llm-deepseek 适配器同策略；字面 key 永远不是配置值）。
 *   另注册 connection RPC channel `/periscope`（describe 读当前存储值 / describeEffective 读归并生效值 /
 *   update 合并写，authority:loopback），供 browser half 配置卡片经 ctx.connection.rpc.call 读写与回显——
 *   host handler 服务直调 ctx.settings，绕开 api-proxy 的 exposedNamespaces() 白名单
 *   （spike #32 实证网关拒第三方命名空间）。#35 的 describeEffective 返回 settings user > cordis.yml
 *   base > env fallback 的归并生效值（含每字段来源与就绪判定），供卡片回显与未配置引导。
 *
 * ──────────────────────────── 手工 E2E 验收（无法 CI 自动化，需真实 dsh 宿主） ────────────────────────────
 * 前置：本机已装 dsh CLI（@deepseek-ai/dsh）、pnpm；deepseek 主文本路由可用（DEEPSEEK_API_KEY 已 export，
 *       或 web Models 页已配置 llm-deepseek 段）；一个可达的 BYOM 视觉端点（本地 Ollama / LM Studio /
 *       自建网关 / 任意 OpenAI 兼容云端）。本包为 CommonJS，dsh 插件生态全为 ESM——若加载期因模块格式
 *       被拒，按 #27 风险小节把插件入口转 ESM。
 *
 * 1) 构建：在本包目录 `npm run build`（tsc 产出 dist/；本包提交 dist/ 以支持 git/file 免构建安装）。
 * 2) 安装到 web profile：`dsh plugin --profile web add file:<本包绝对路径>`（dsh 因本包 package.json
 *    声明 `dsh.bundle.patch` 而把包名追加进 `dsh.profile.bundles`；可用 `dsh --profile web --dump-config`
 *    复查组合后的树里出现了 periscope-deepseek 行）。本包另声明 `dsh.client`（browser half），
 *    因 client-modules 扫描负缓存永不过期，新增声明需**重启 dsh web** 才生效。
 * 3) 配置视觉端点（三来源，apiKey 仅从 env，不写进配置）：
 *    - 方式 A（settings 命名空间，#33）：手改 `~/.dsh/settings.yaml` 的 `periscope:` 段
 *      （protocol / baseUrl / model / apiKeyEnv，user 层优先级最高）。独立验证：改值 → 重启
 *      dsh web → 发图 → 描述走新端点（无需卡片，纯 server 侧）。
 *    - 方式 B（cordis.yml）：profile 的 cordis.patch.yml 给 periscope-deepseek 行加 config：
 *      protocol / baseUrl / model（apiKeyEnv 可选）。
 *    - 方式 C（env fallback）：export PERISCOPE_VISION_PROTOCOL / PERISCOPE_VISION_BASE_URL /
 *      PERISCOPE_VISION_MODEL；apiKey：export PERISCOPE_API_KEY=sk-...（或 apiKeyEnv 指定的变量）。
 * 4) 启动 Web UI：`dsh web`，打开浏览器会话，模型选择器选中「periscope（看图桥 → deepseek）」下的模型。
 *
 * 【验收点 1：端到端看图】粘贴单图发送，模型回答体现图片内容；再试多图（每图 `[Image N] 描述` 替换）、
 *    图文混合（文字原样、图被替换、顺序保持）；含嵌套 tool-result 的图也被翻译。
 * 【验收点 2：image/described 落 log】翻译时 session log 追加 `image/described`（attachmentId → 描述），
 *    同时写一份到 dsh 诊断日志（`[periscope] image/described <id>: <描述>`）。同会话内分叉/压缩后模型
 *    所见一致（live log 重放 + 内容寻址缓存使命中图不重请求下游、描述仍落 log）。
 * 【验收点 3：降级不中断】把视觉端点指向一个会 500/超时的地址后发图：会话继续，该图降级为
 *    `[Image N] 描述不可用` 占位符并落 log；其余图不受影响。
 * 【验收点 4：未配置引导】不配任何视觉端点发图：该图降级为可操作引导占位符（指出 cordis.yml / env
 *    配置位置），落 log、不抛错、不中断会话。
 * 【验收点 5：缓存命中】同一张图再发一次（或翻历史触发重放）：观察视觉端点访问日志，不重复请求下游，
 *    描述仍落 log（内容寻址 attachmentId 作缓存 key，进程内共享）。
 * 【验收点 6：settings 第三来源（#33）】手改 `~/.dsh/settings.yaml` 的 `periscope:` 段（如改 baseUrl），
 *    重启 dsh web 后发图：请求走新端点（优先级 settings > cordis.yml > env）。settings 服务缺省时
 *    （无 settings 命名空间注册）行为回落 cordis.yml + env，不抛错。
 * 【验收点 7：connection RPC channel（#33）+ 配置卡片（#34）】browser half 配置卡片经
 *    `ctx.connection.rpc.call('/periscope', 'describe')` 读到当前存储值；`update` 合并写 user 层
 *    并持久化到 settings.yaml（authority:loopback）。host 侧 handler 见本文件 registerPeriscopeRpc，
 *    卡片实现与 Seam 2 测试见 `client/client.js` 与 `src/client/client.test.ts`。
 * 【验收点 8：卡片 UI（#34）】Plugins 设置区出现「periscope 视觉端点」卡片：protocol 下拉（openai /
 *    anthropic / responses）可切换，baseUrl / model / apiKeyEnv 三字段；填表 → 保存 → 重启 dsh web
 *    → 打开卡片值仍在（读回走 describe）；apiKey 字段填字面 key（如 sk-…）被拒，只收环境变量名；
 *    discard 还原未保存的编辑。**若卡片未出现**：确认 dsh web 是「新增 dsh.client 声明后」启动的
 *    （负缓存），且 `dsh --profile web --dump-config` 的 client 图里含 periscope-dsh 行。
 * 【验收点 9：生效值回显 + 未配置引导（#35）】卡片顶部出现「当前生效配置」只读区：展示
 *    describeEffective 的归并生效值（settings > cordis.yml > env）与每字段来源标记；已有 cordis.yml /
 *    env 配置（如 PERISCOPE_VISION_BASE_URL）时不强制重复填写，来源标 cordis.yml/环境变量；
 *    全部未配置时显示可操作引导（指向本卡片表单或 env 位置）。Seam 3 端到端冒烟见
 *    `src/bridge/e2e-smoke.test.ts`（settings 写入 → 插件读配置 → describe 视觉端点 → mock 返回）。
 * 【验收点 10：卡片连通性校验（#36）】卡片「测试连接」按钮 → 经 `/periscope` `ping` 端点由 host 侧
 *    用当前生效配置探测端点可达性（网络归 host half）：可达回显「端点可达（HTTP 200）」，不可达回显
 *    原因 + 指向 baseUrl / apiKeyEnv / 网络的可操作提示。探测的是**已保存**的生效配置（settings >
 *    cordis.yml > env），编辑未保存的草稿不影响探测结果。
 *
 *
 * ── 已知限制与首要核实地（务必读）────────────────────────────────────────────────────────────
 * A. 【image/described 重启拒载 · dsh 缺口】本插件经 declaration merging 扩展 SessionEventMap 后
 *    append 的 image/described 事件不带 ignorable，且不在 dsh 仓内生成的 KNOWN_SESSION_EVENT_TYPES；
 *    据 issue #24 源码核实，含该事件的会话在「进程重启后重载」会被持久化层整体拒载（整会话不可恢复，
 *    非丢一条事件）。进程内的分叉/压缩读 live log 不受影响。重启恢复需 dsh 提供 out-of-repo 事件注册面
 *    或 append 支持 ignorable 后方可——这是 dsh 侧缺口，非本插件可修。在此之前，描述记录的重启可存查
 *    副本走诊断日志（`dsh` 日志里的 `[periscope] image/described ...`）。切勿声称「重启后可恢复」。
 * B. 【会话服务挂点 · 推断】appendToSession 假定会话服务经 `ctx.get('sessions')` 暴露、按
 *    `sessions.get(sessionId)` 取句柄、`session.append('image/described', data)` 落 log。该 API 形态是
 *    基于 #24 comment 的合理推断、未经源码核实——是本票手工 E2E 的第一核实地：若真实挂点/方法名不同，
 *    只需改 plugin.ts 的 appendToSession 一处（sink 的 try/catch 保证即使挂点错误也不中断会话）。
 * C. 【readImage 返回形态 · 已核实】`ctx.attachments.readImage(ref)` 返回 StoredImageAttachment
 *    { ref, data }（data 为字节），非裸 Uint8Array——plugin.ts 壳层取 .data 后注入 seam。
 * D. 【mimeType 未透传】桥接 seam 只把字节交给 describe，图片真实 mediaType 未随字节透传，describe
 *    默认按 image/png 构造 data URL；对非 PNG 源图，若下游端点挑剔需在后续切片把 mediaType 接入 seam。
 * E. 【settings/connection 服务可选】settings 与 connection 均为可选服务（ctx.inject 挂载，见 apply）：
 *    缺省时插件仍以 cordis.yml + env 工作，settings 命名空间与 /periscope RPC 通道随之不可用。
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */

/** 插件名（cordis 纤维诊断与 logger 命名）。 */
export const name = 'periscope-deepseek';

/** 依赖的 cordis 服务：llm（注册适配器 + 委托主文本模型都要它）；attachments（readImage 取图字节，经 inject 注入而非直接 ctx 访问）。sessions 经 ctx.get('sessions') 逃逸口取（推断挂点）。 */
export const inject = ['llm', 'attachments'];

/** settings 命名空间（#33）：user 层（settings.yaml / 卡片写入）> base 层（cordis.yml entry）> env fallback。 */
export const NS = settingsNamespace('periscope');

/**
 * 插件配置类型：视觉端点配置项（protocol / baseUrl / model / apiKeyEnv），全部可选。
 * 刻意不含 apiKey——key 仅从 env 读取（apiKeyEnv 命名的环境变量），字面 key 不是配置值。
 */
export interface Config extends VisionConfigInput {}

/**
 * cordis.yml 配置段的 schemastery 校验 schema（对齐 Config 类型，全可选）。
 * 默认值与 env fallback 不在 schema 链里处理，而由 resolveVisionConfig 纯函数统一裁决。
 */
export const Config = Schema.object({
  protocol: Schema.union(['openai', 'anthropic', 'responses']),
  baseUrl: Schema.string(),
  model: Schema.string(),
  apiKeyEnv: Schema.string(),
});

/**
 * 插件入口：解析视觉端点配置（settings 命名空间 > cordis.yml > env 三来源，实时解析）
 * → 构造桥接适配器（注入委托 / 读图 / image/described 落点）→ 注册 periscope-deepseek route。
 * → 注册 settings 命名空间（installSettingsSection）与 connection RPC channel（/periscope）。
 * stream() 内的 ImageBlock 翻译与降级逻辑见 adapter.ts / stream-core.ts。
 */
export function apply(ctx: Context, config: Config): void {
  // 当前生效的 settings 段：installSettingsSection 的 setSource 注入「解析后的 settings 值」
  // （user 层 > base 层=cordis.yml entry）；settings 服务缺省时回落 cordis.yml entry。
  // resolveVision 每次调用实时解析三来源，故 settings/cordis/env 变更对下一次看图立即生效。
  let currentSettings = (): Config => config;
  // apiKey 解析优先级：dsh 凭据库（ctx.credentials）> 进程环境变量（与 deepseek 适配器同策略）。
  // 凭据服务可选（ctx.get 逃逸口，缺省回落 process.env）。使「卡片保存一次 + 凭据库存一次 key」
  // 即可生效，无需在启动命令里 export key。
  const resolveVision = async (): Promise<ResolvedVisionConfig> => {
    const base = resolveVisionConfigWithSettings(config, currentSettings(), process.env);
    if (base.apiKey !== '') return base;
    const credentials = ctx.get('credentials') as CredentialsService | undefined;
    if (credentials !== undefined) {
      const hit = await credentials.resolve(base.apiKeyEnv);
      if (hit !== undefined && hit.value.length > 0) return { ...base, apiKey: hit.value };
    }
    return base;
  };

  const adapter = new PeriscopeBridgeAdapter({
    resolveVision,
    delegate: (options: GenerateOptions): AsyncIterable<StreamChunk> => ctx.llm.stream(options),
    readImage: async (attachment: unknown): Promise<Uint8Array> => {
      // dsh 源码核实：readImage 返回 StoredImageAttachment { ref, data }，seam 只需字节。
      const stored = await ctx.attachments.readImage(attachment);
      return stored.data;
    },
    sink: makeImageDescribedSink({
      // 推断挂点（见上「已知限制 B」）：会话服务按 id 取句柄后 append log-only 事件。
      appendToSession: (sessionId, record): void => {
        const sessions = ctx.get('sessions') as SessionService | undefined;
        sessions?.get(sessionId)?.append('image/described', record);
      },
      logInfo: (message): void => ctx.logger.info(message),
      logWarn: (message, error): void => ctx.logger.warn(message, error),
    }),
  });
  ctx.llm.registerAdapter([PERISCOPE_PROVIDER], adapter);

  // settings 命名空间注册（#33）：cordis.yml entry 作 base 层、settings 写入为 user 层。
  // installSettingsSection 处理好 settings 服务卸载 / 光纤卸载时的回退与变更通知，不手写样板。
  installSettingsSection<Config>(ctx, NS, Config, config, {
    setSource: (source) => {
      currentSettings = source;
    },
    onChange: () => {
      // 无需重注册 route：adapter 每次请求实时解析 vision；此处仅诊断日志。
      ctx.logger.info('[periscope] settings section changed; vision config re-resolves on next request');
    },
  });

  // connection RPC channel（#33）：host handler 服务直调 ctx.settings，绕开网关白名单。
  // #36 起注入连接探测（/periscope ping）：网络请求在 host half 发起，探测逻辑见
  // connection-probe.ts（用当前生效配置构造探测请求，可注入 transport，离线可测）。
  // connection 服务可选：缺省时该通道不注册，插件其余功能不受影响。
  registerPeriscopeRpc(ctx, resolveVision);
}

/** 注册 /periscope connection RPC channel：describe 读当前存储值 / describeEffective 读归并生效值 / update 合并写 user 层 / ping 连接探测。 */
function registerPeriscopeRpc(ctx: Context, resolveVision: () => Promise<ResolvedVisionConfig>): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const settings = (): SettingsProvider | undefined =>
      connectionCtx.get('settings') as SettingsProvider | undefined;
    const port: PeriscopeSettingsPort = {
      read: () => {
        const provider = settings();
        if (provider === undefined) return undefined;
        const descriptor = provider.describe({ redactSecrets: true }).find((d) => d.ns === NS);
        if (descriptor === undefined) return undefined;
        return {
          value: (descriptor.value ?? {}) as Record<string, unknown>,
          ...(descriptor.user === undefined ? {} : { user: descriptor.user as Record<string, unknown> }),
          ...(descriptor.base === undefined ? {} : { base: descriptor.base as Record<string, unknown> }),
          revision: descriptor.revision,
        };
      },
      update: async (patch, expectedRevision) => {
        const provider = settings();
        if (provider === undefined) throw new Error('settings 服务不可用：periscope 命名空间未注册');
        await provider.update(NS, patch, expectedRevision);
      },
    };
    // inject(['connection']) 声明了依赖，回调内 connection 必然就绪（可选类型下的显式断言）。
    const rpc = connectionCtx.connection?.rpc;
    if (rpc === undefined) {
      ctx.logger.warn('[periscope] connection 服务缺省：/periscope RPC channel 未注册，配置卡片读写不可用');
      return;
    }
    rpc.handle(
      '/periscope',
      makePeriscopeRpcHandler(port, NS, {
        probe: {
          // 连接探测（#36）：每次 ping 实时解析当前生效配置（settings > cordis.yml > env），
          // 网络请求走 host half（makeConnectionProbe 默认全局 fetch，不注入 transport）。
          ping: makeConnectionProbe({ resolve: resolveVision }),
        },
      }),
      { authority: 'loopback' },
    );
  });
}

/** default 导出同一插件对象（CommonJS 被 ESM 宿主 import 时的兜底，见上注释）。 */
export default { name, inject, Config, apply };
