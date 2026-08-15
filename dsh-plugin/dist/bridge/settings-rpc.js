/**
 * periscope settings 命名空间的 connection RPC channel（/periscope）纯逻辑（issue #33）。
 *
 * 职责：把「读当前存储值 / 合并写 user 层」收敛为可离线单测的纯函数。壳层（plugin.ts）
 * 注入 settings 服务的最小访问面（port），本模块不感知 dsh 运行时——与 route.ts /
 * vision-config.ts 同策略（零 dsh 耦合，纯逻辑单测）。
 *
 * 为什么绕开 settings 网关：api-proxy 的 exposedNamespaces() 硬编码白名单拒绝第三方命名空间
 * （spike #32 实证）；官方 connection RPC channel（@deepseek-ai/dsh-client-connection）允许
 * 插件注册包内私有 channel，handler 服务直调 ctx.settings，无白名单层。
 */
/** 构造 RPC 错误分支。 */
function rpcError(code, message) {
    return { code, message, details: {} };
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
/**
 * 构造 /periscope channel 的 RPC handler（endpoint 分发：describe 读 / update 写）。
 * 与 dsh 的 ConnectionRpcHandler 形状结构兼容（endpoint + payload + signal → RpcResult）；
 * signal 对齐 dsh 传入的浏览器取消信号（本 handler 不消费，仅声明；可选类型保持与既有调用
 * 兼容，且结构上仍可赋给 dsh 三参必填的 ConnectionRpcHandler）。所有失败都折叠进错误分支，
 * handler 本身绝不抛错。
 */
export function makePeriscopeRpcHandler(port) {
    return async (endpoint, payload, _signal) => {
        switch (endpoint) {
            case 'describe': {
                try {
                    const read = port.read();
                    return { ok: true, value: read ?? { registered: false } };
                }
                catch (caught) {
                    return {
                        ok: false,
                        error: rpcError('settings-rejected', caught instanceof Error ? caught.message : String(caught)),
                    };
                }
            }
            case 'update': {
                const parsed = parseUpdatePayload(payload);
                if (!parsed.ok)
                    return { ok: false, error: rpcError('bad-request', parsed.message) };
                try {
                    await port.update(parsed.value.patch, parsed.value.expectedRevision);
                    return { ok: true, value: null };
                }
                catch (caught) {
                    return {
                        ok: false,
                        error: rpcError('settings-rejected', caught instanceof Error ? caught.message : String(caught)),
                    };
                }
            }
            default:
                return { ok: false, error: rpcError('bad-request', `unknown /periscope endpoint "${endpoint}"`) };
        }
    };
}
