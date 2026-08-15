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
 */

import { Protocol } from '../protocols/types.js';
import { visionEndpointReady } from './stream-core.js';
import {
  VISION_ENV,
  VisionConfigEnv,
  VisionConfigInput,
  VisionSettingsSection,
  normalizeSettingsSection,
  resolveVisionConfigWithSettings,
} from './vision-config.js';

/**
 * RPC 错误面（对齐 dsh wire schema 的 rpcErrorSchema 判别联合）。
 * dsh 浏览器侧 `createWebConnectionRpc` 对每个响应做 `serverResponseSchema.parse`：
 * error 分支按 code 判别，每种 code 强制具体 details 形状——`bad-request` →
 * `details:{issues:[...]}`、`settings-rejected` → `details:{ns:string}`。details 缺失
 * 或形状不符会令浏览器侧以 ZodError 拒绝（真实 message 丢失），故这里按 code 产出
 * schema 兼容的 details。
 */
export type PeriscopeRpcError =
  | { code: 'bad-request'; message: string; details: { issues: unknown[] } }
  | { code: 'settings-rejected'; message: string; details: { ns: string } };

/** RPC 结果（对齐 @deepseek-ai/dsh-host-apiproxy/api 的 RpcResult<T> 最小契约）。 */
export type PeriscopeRpcResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: PeriscopeRpcError };

/** bad-request 错误分支（details 对齐 wire schema：issues 数组）。 */
function badRequest(message: string): PeriscopeRpcError {
  return { code: 'bad-request', message, details: { issues: [] } };
}

/** settings-rejected 错误分支（details 对齐 wire schema：ns 字符串）。 */
function settingsRejected(ns: string, message: string): PeriscopeRpcError {
  return { code: 'settings-rejected', message, details: { ns } };
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

// ── #35 describeEffective：归并生效值（settings user > cordis.yml base > env fallback） ──

/** 生效配置值（apiKey 刻意不含：key 仅存于 env，经 RPC 回显属敏感值外泄）。 */
export interface PeriscopeEffectiveValue {
  protocol: Protocol;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
}

/**
 * 每字段的来源标记（供卡片标注「优先级结果」：settings / cordis.yml / env / 默认）。
 * 语义：来源标记反映该字段**配置所在的层**（该层有非空白配置即归属该层），
 * 不随「生效值回落」变化——如 settings 层放了非法 protocol 时，生效值回落默认 openai，
 * 但来源仍标 settings（指向用户需要修正的位置），而不是标 default。
 */
export type PeriscopeEffectiveSource = 'settings' | 'cordis' | 'env' | 'default';

/** describeEffective 成功值：归并生效配置 + 每字段来源 + 端点就绪判定。 */
export interface PeriscopeEffectiveRead {
  /** 归并生效值（settings > cordis.yml > env 优先级；apiKey 不回显）。 */
  value: PeriscopeEffectiveValue;
  /** 每字段来源（settings 命名空间 user 层 / cordis.yml base 层 / env fallback / 默认值）。 */
  sources: Record<'protocol' | 'baseUrl' | 'model' | 'apiKeyEnv', PeriscopeEffectiveSource>;
  /** 端点是否就绪：baseUrl 与 model 均非空白（与 stream-core 的 visionEndpointReady 同语义）。 */
  configured: boolean;
}

/** 字段非空白判定（与 vision-config 的 firstPresent 一致：空白串视为未配置）。 */
function present(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** 取字段来源：settings（非空白）> cordis（非空白）> env fallback（apiKeyEnv 无 env 位）> 默认。 */
function effectiveSourceOf(
  field: 'protocol' | 'baseUrl' | 'model' | 'apiKeyEnv',
  settingsNorm: VisionConfigInput,
  cordis: Record<string, unknown>,
  env: VisionConfigEnv,
): PeriscopeEffectiveSource {
  if (present(settingsNorm[field])) return 'settings';
  if (present(cordis[field])) return 'cordis';
  if (field !== 'apiKeyEnv' && present(env[VISION_ENV[field]])) return 'env';
  return 'default';
}

/**
 * 由 describe 读面 + env 计算归并生效值（settings user 层 > cordis.yml base 层 > env fallback）。
 * 纯函数，零 dsh 耦合：settings 服务不可用（read undefined）时返回 registered:false。
 * 归并解析复用 resolveVisionConfigWithSettings（与 plugin.ts 的实时解析同一语义）。
 * apiKey 由解析产出但刻意不进返回值（敏感值不回显）；就绪判定（visionEndpointReady）仅依赖
 * baseUrl/model，与 apiKey 无关。
 */
export function effectiveFromRead(
  read: PeriscopeSettingsRead | undefined,
  env: VisionConfigEnv = {},
): PeriscopeEffectiveRead | { registered: false } {
  if (read === undefined) return { registered: false };
  const cordis = (read.base ?? {}) as Record<string, unknown>;
  const settingsSection = read.user as VisionSettingsSection | undefined;
  const resolved = resolveVisionConfigWithSettings(
    cordis as VisionConfigInput,
    settingsSection,
    env,
  );
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
 * 构造 /periscope channel 的 RPC handler（endpoint 分发：describe 读 / describeEffective 归并生效 /
 * update 写）。
 * @param port - settings 服务的最小访问面（壳层注入；服务直调，绕开网关白名单）。
 * @param ns - periscope settings 命名空间名，写进 settings-rejected 错误的 details.ns（wire schema 要求）。
 * @param env - 归并生效值计算用的环境变量面（默认 process.env；测试注入受控 env）。
 * 与 dsh 的 ConnectionRpcHandler 形状结构兼容（endpoint + payload + signal → RpcResult）；
 * signal 对齐 dsh 传入的浏览器取消信号（本 handler 不消费，仅声明；可选类型保持与既有调用
 * 兼容，且结构上仍可赋给 dsh 三参必填的 ConnectionRpcHandler）。所有失败都折叠进错误分支，
 * handler 本身绝不抛错。
 */
export function makePeriscopeRpcHandler(
  port: PeriscopeSettingsPort,
  ns: string,
  env: VisionConfigEnv = process.env,
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
            error: settingsRejected(ns, caught instanceof Error ? caught.message : String(caught)),
          };
        }
      }
      case 'describeEffective': {
        try {
          return { ok: true, value: effectiveFromRead(port.read(), env) };
        } catch (caught) {
          return {
            ok: false,
            error: settingsRejected(ns, caught instanceof Error ? caught.message : String(caught)),
          };
        }
      }
      case 'update': {
        const parsed = parseUpdatePayload(payload);
        if (!parsed.ok) return { ok: false, error: badRequest(parsed.message) };
        try {
          await port.update(parsed.value.patch, parsed.value.expectedRevision);
          return { ok: true, value: null };
        } catch (caught) {
          return {
            ok: false,
            error: settingsRejected(ns, caught instanceof Error ? caught.message : String(caught)),
          };
        }
      }
      default:
        return { ok: false, error: badRequest(`unknown /periscope endpoint "${endpoint}"`) };
    }
  };
}
