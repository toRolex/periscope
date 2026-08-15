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

/** RPC 错误面（最小契约：code + message + details）。 */
export type PeriscopeRpcError = { code: string; message: string; details: unknown };

/** RPC 结果（对齐 @deepseek-ai/dsh-host-apiproxy/api 的 RpcResult<T> 最小契约）。 */
export type PeriscopeRpcResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: PeriscopeRpcError };

/** 构造 RPC 错误分支。 */
function rpcError(code: string, message: string): PeriscopeRpcError {
  return { code, message, details: {} };
}

/** describe 端点返回：periscope 命名空间的当前存储面（读当前存储值，卡片渲染用）。 */
export interface PeriscopeSettingsRead {
  /** 当前解析值（user 层 > base 层 > schema 默认）。 */
  value: Record<string, unknown>;
  /** user 层（settings.yaml 实际存储段）；缺省表示无 user override。 */
  user?: Record<string, unknown>;
  /** base 层（cordis.yml entry）。 */
  base?: Record<string, unknown>;
  /** 乐观并发 revision：写回时作 expectedRevision 检测并发写。 */
  revision: number;
}

/** update 端点入参：合并写 user 层。 */
export interface PeriscopeSettingsUpdatePayload {
  /** 合并到 user 段的字段补丁（逐字段并入并持久化）。 */
  patch: Record<string, unknown>;
  /** 乐观并发：读到的 revision；缺省跳过冲突检查。 */
  expectedRevision?: number;
}

/** settings 服务的最小访问面（壳层注入；服务直调，绕开网关白名单）。 */
export interface PeriscopeSettingsPort {
  /** 读当前存储值；settings 服务/命名空间不可用时返回 undefined。 */
  read(): PeriscopeSettingsRead | undefined;
  /** 合并写 user 层（patch 并入 user 段并持久化；冲突/拒绝时抛错）。 */
  update(patch: Record<string, unknown>, expectedRevision?: number): Promise<void>;
}

/** 解析 update 入参：畸形入参返回错误文案，不抛错。 */
type ParsedUpdate =
  | { ok: true; value: PeriscopeSettingsUpdatePayload }
  | { ok: false; message: string };

/** update patch 允许的键（对齐 VisionConfigInput 四可选字段）。未知键拒绝，防 typo 经 settings mergeLayers 持久化进 settings.yaml。 */
const VISION_SETTINGS_KEYS: readonly string[] = ['protocol', 'baseUrl', 'model', 'apiKeyEnv'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUpdatePayload(payload: unknown): ParsedUpdate {
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
export function makePeriscopeRpcHandler(
  port: PeriscopeSettingsPort,
): (endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<PeriscopeRpcResult<unknown>> {
  return async (endpoint, payload, _signal) => {
    switch (endpoint) {
      case 'describe': {
        try {
          const read = port.read();
          return { ok: true, value: read ?? { registered: false } };
        } catch (caught) {
          return {
            ok: false,
            error: rpcError('settings-rejected', caught instanceof Error ? caught.message : String(caught)),
          };
        }
      }
      case 'update': {
        const parsed = parseUpdatePayload(payload);
        if (!parsed.ok) return { ok: false, error: rpcError('bad-request', parsed.message) };
        try {
          await port.update(parsed.value.patch, parsed.value.expectedRevision);
          return { ok: true, value: null };
        } catch (caught) {
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
