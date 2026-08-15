/**
 * periscope settings 命名空间的 connection RPC channel（/periscope）纯逻辑（issue #33）。
 *
 * 职责：把「读当前存储值 / 合并写 user 层」收敛为可离线单测的纯函数。壳层（plugin.ts）
 * 注入 settings 服务的最小访问面（port），本模块不感知 dsh 运行时——与 route.ts /
 * vision-config.ts 同策略（零 dsh 耦合，纯逻辑单测）。
 *
 * #35 新增 describeEffective 端点：暴露「settings user 层 > cordis.yml base 层 > env fallback」
 * 归并后的生效配置值（区别于 describe 的「当前存储值」）供配置卡片回显——已有 cordis.yml /
 * env 配置的用户不重复填写、能看到优先级结果。归并逻辑复用 vision-config 纯函数，
 * env 以注入面传入（默认 process.env），不在此模块触碰 dsh 运行时。
 *
 * 为什么绕开 settings 网关：api-proxy 的 exposedNamespaces() 硬编码白名单拒绝第三方命名空间
 * （spike #32 实证）；官方 connection RPC channel（@deepseek-ai/dsh-client-connection）允许
 * 插件注册包内私有 channel，handler 服务直调 ctx.settings，无白名单层。
 *
 * 错误分支对齐 dsh wire schema（serverResponseSchema 的 rpcErrorSchema 判别联合）：
 * bad-request → details:{issues:[]}，settings-rejected → details:{ns}。details 形状不符会令
 * 浏览器侧 createWebConnectionRpc 以 ZodError 拒绝（review-34 实测），故按 code 产出兼容 details。
 *
 * #36 起新增 ping 端点（连接探测）：handler 分发到注入的 probe 端口，网络请求归 host half
 * （浏览器沙盒不能直接发网络请求）；探测逻辑见 connection-probe.ts（可注入/可测试）。
 *
 * 模块头注释刻意置于 import 之前：置于其后会被 tsc 当作被擦除的 type-only 声明
 * （PeriscopeRpcError）的 leading comment 而丢失（review-36 实测 dist 回归，plugin-load.test.ts 锁定）。
 */
import { visionEndpointReady } from './stream-core.js';
import { VISION_ENV, isPresent, normalizeSettingsSection, resolveVisionConfigWithSettings, } from './vision-config.js';
/** bad-request 错误分支（details 对齐 wire schema：issues 数组）。 */
function badRequest(message) {
    return { code: 'bad-request', message, details: { issues: [] } };
}
/** settings-rejected 错误分支（details 对齐 wire schema：ns 字符串）。 */
function settingsRejected(ns, message) {
    return { code: 'settings-rejected', message, details: { ns } };
}
/** 取字段来源：settings（非空白）> cordis（非空白）> env fallback（apiKeyEnv 无 env 位）> 默认。 */
function effectiveSourceOf(field, settingsNorm, cordis, env) {
    if (isPresent(settingsNorm[field]))
        return 'settings';
    if (isPresent(cordis[field]))
        return 'cordis';
    if (field !== 'apiKeyEnv' && isPresent(env[VISION_ENV[field]]))
        return 'env';
    return 'default';
}
/**
 * 由 describe 读面 + env 计算归并生效值（settings user 层 > cordis.yml base 层 > env fallback）。
 * 纯函数，零 dsh 耦合：settings 服务不可用（read undefined）时返回 registered:false。
 * 归并解析复用 resolveVisionConfigWithSettings（与 plugin.ts 的实时解析同一语义）。
 * apiKey 由解析产出但刻意不进返回值（敏感值不回显）；就绪判定（visionEndpointReady）仅依赖
 * baseUrl/model，与 apiKey 无关。
 */
export function effectiveFromRead(read, env = {}) {
    if (read === undefined)
        return { registered: false };
    const cordis = (read.base ?? {});
    const settingsSection = read.user;
    const resolved = resolveVisionConfigWithSettings(cordis, settingsSection, env);
    const settingsNorm = normalizeSettingsSection(settingsSection);
    return {
        value: {
            protocol: resolved.protocol,
            baseUrl: resolved.baseUrl,
            model: resolved.model,
            apiKeyEnv: resolved.apiKeyEnv,
        },
        sources: {
            protocol: effectiveSourceOf('protocol', settingsNorm, cordis, env),
            baseUrl: effectiveSourceOf('baseUrl', settingsNorm, cordis, env),
            model: effectiveSourceOf('model', settingsNorm, cordis, env),
            apiKeyEnv: effectiveSourceOf('apiKeyEnv', settingsNorm, cordis, env),
        },
        configured: visionEndpointReady(resolved),
    };
}
/** update patch 允许的键（对齐 VisionConfigInput 四可选字段）。未知键拒绝，防 typo 经 settings mergeLayers 持久化进 settings.yaml。 */
const VISION_SETTINGS_KEYS = ['protocol', 'baseUrl', 'model', 'apiKeyEnv'];
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseUpdatePayload(payload) {
    if (!isRecord(payload) || !isRecord(payload.patch)) {
        return { ok: false, message: '/periscope update 入参必须是 { patch: {...}, expectedRevision?: number }' };
    }
    for (const key of Object.keys(payload.patch)) {
        if (!VISION_SETTINGS_KEYS.includes(key)) {
            return {
                ok: false,
                message: `/periscope update patch 含未知键 "${key}"（允许 ${VISION_SETTINGS_KEYS.join('/')}）`,
            };
        }
    }
    const expectedRevision = payload.expectedRevision;
    if (expectedRevision !== undefined
        && (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision))) {
        return { ok: false, message: '/periscope update expectedRevision 必须是整数' };
    }
    return { ok: true, value: { patch: payload.patch, expectedRevision } };
}
/** 把调用方异常折叠为 settings-rejected 错误分支（wire schema 兼容：details.ns）。 */
function foldSettingsError(ns, caught) {
    return {
        ok: false,
        error: settingsRejected(ns, caught instanceof Error ? caught.message : String(caught)),
    };
}
/**
 * 构造 /periscope channel 的 RPC handler（endpoint 分发：describe 读 / describeEffective 归并生效 /
 * update 写 / ping 探测）。
 * @param port - settings 服务的最小访问面（壳层注入；服务直调，绕开网关白名单）。
 * @param ns - periscope settings 命名空间名，写进 settings-rejected 错误的 details.ns（wire schema 要求）。
 * @param options - 注入面：env（describeEffective 归并计算用的环境变量面，默认 process.env）与
 *   probe（/periscope ping 端点，缺省返回 bad-request）。统一为单个 options 对象，不做二义判别。
 * 与 dsh 的 ConnectionRpcHandler 形状结构兼容（endpoint + payload + signal → RpcResult）；
 * signal 对齐 dsh 传入的浏览器取消信号（本 handler 不消费，仅声明；可选类型保持与既有调用
 * 兼容，且结构上仍可赋给 dsh 三参必填的 ConnectionRpcHandler）。所有失败都折叠进错误分支，
 * handler 本身绝不抛错。
 */
export function makePeriscopeRpcHandler(port, ns, options = {}) {
    const env = options.env ?? process.env;
    return async (endpoint, payload, _signal) => {
        switch (endpoint) {
            case 'describe': {
                try {
                    const read = port.read();
                    return { ok: true, value: read ?? { registered: false } };
                }
                catch (caught) {
                    return foldSettingsError(ns, caught);
                }
            }
            case 'describeEffective': {
                try {
                    return { ok: true, value: effectiveFromRead(port.read(), env) };
                }
                catch (caught) {
                    return foldSettingsError(ns, caught);
                }
            }
            case 'update': {
                const parsed = parseUpdatePayload(payload);
                if (!parsed.ok)
                    return { ok: false, error: badRequest(parsed.message) };
                try {
                    await port.update(parsed.value.patch, parsed.value.expectedRevision);
                    return { ok: true, value: null };
                }
                catch (caught) {
                    return foldSettingsError(ns, caught);
                }
            }
            case 'ping': {
                // 探测的不可达是正常结果（value 内 ok:false），不折叠进 RPC 错误分支；
                // 仅 probe 能力缺失 / 意外抛错时进错误分支（探测实现本身绝不抛错）。
                if (options.probe === undefined) {
                    return { ok: false, error: badRequest('connection 探测能力不可用（probe 未注入）') };
                }
                try {
                    const value = await options.probe.ping();
                    return { ok: true, value };
                }
                catch (caught) {
                    return foldSettingsError(ns, caught);
                }
            }
            default:
                return { ok: false, error: badRequest(`unknown /periscope endpoint "${endpoint}"`) };
        }
    };
}
