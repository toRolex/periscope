import Schema from '@deepseek-ai/schemastery';
import { PeriscopeBridgeAdapter } from './adapter.js';
import { PERISCOPE_PROVIDER } from './route.js';
import { makeImageDescribedSink } from './stream-core.js';
import { resolveVisionConfig } from './vision-config.js';
/**
 * periscope 的 dsh 原生插件入口（cordis 插件形态，对齐官方 llm-deepseek 适配器的导出形状）。
 *
 * cordis 加载本模块时读取这四个命名导出：name / inject / Config（schemastery schema，
 * 校验 cordis.yml 里本插件的配置段）/ apply（入口，注册 periscope-deepseek route）。
 * 另附 default 导出同一插件对象，规避 ESM 宿主 import CommonJS 时命名导出探测的边界。
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
 *    复查组合后的树里出现了 periscope-deepseek 行）。
 * 3) 配置视觉端点（二选一；apiKey 仅从 env，不写进配置）：
 *    - 方式 A（cordis.yml）：profile 的 cordis.patch.yml 给 periscope-deepseek 行加 config：
 *      protocol / baseUrl / model（apiKeyEnv 可选）。
 *    - 方式 B（env fallback）：export PERISCOPE_VISION_PROTOCOL / PERISCOPE_VISION_BASE_URL /
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
 * C. 【readImage 返回形态 · 推断】假定 `ctx.attachments.readImage(ref)` resolve 图片字节
 *    （Uint8Array/Buffer）；若真实返回更丰富的对象（如 { bytes, mediaType }），需在 plugin.ts 取 .bytes。
 * D. 【mimeType 未透传】桥接 seam 只把字节交给 describe，图片真实 mediaType 未随字节透传，describe
 *    默认按 image/png 构造 data URL；对非 PNG 源图，若下游端点挑剔需在后续切片把 mediaType 接入 seam。
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */
/** 插件名（cordis 纤维诊断与 logger 命名）。 */
export const name = 'periscope-deepseek';
/** 依赖的 cordis 服务：llm（注册适配器 + 委托主文本模型都要它）。attachments/sessions 经 ctx 挂点取。 */
export const inject = ['llm'];
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
 * 插件入口：解析视觉端点配置 → 构造桥接适配器（注入委托 / 读图 / image/described 落点）
 * → 注册 periscope-deepseek route。stream() 内的 ImageBlock 翻译与降级逻辑见 adapter.ts / stream-core.ts。
 */
export function apply(ctx, config) {
    const vision = resolveVisionConfig(config, process.env);
    const adapter = new PeriscopeBridgeAdapter({
        vision,
        delegate: (options) => ctx.llm.stream(options),
        readImage: (attachment) => ctx.attachments.readImage(attachment),
        sink: makeImageDescribedSink({
            // 推断挂点（见上「已知限制 B」）：会话服务按 id 取句柄后 append log-only 事件。
            appendToSession: (sessionId, record) => {
                const sessions = ctx.get('sessions');
                sessions?.get(sessionId)?.append('image/described', record);
            },
            logInfo: (message) => ctx.logger.info(message),
            logWarn: (message, error) => ctx.logger.warn(message, error),
        }),
    });
    ctx.llm.registerAdapter([PERISCOPE_PROVIDER], adapter);
}
/** default 导出同一插件对象（CommonJS 被 ESM 宿主 import 时的兜底，见上注释）。 */
export default { name, inject, Config, apply };
