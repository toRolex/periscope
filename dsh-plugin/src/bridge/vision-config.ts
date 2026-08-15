import { Protocol } from '../protocols/types.js';

/**
 * dsh 侧视觉端点配置解析（cordis.yml + schemastery + env fallback）的纯逻辑部分。
 *
 * 职责边界：
 * - 本模块是纯函数，零 dsh 运行时耦合，可离线单测。cordis.yml 的 YAML 解析与
 *   schemastery 校验由 cordis 在加载期完成（见 plugin.ts 的 Config schema）；
 *   这里接收的是「cordis 校验后的配置段」+「环境变量」，产出解析结果。
 * - apiKey 仅从 env 读取：配置段里刻意没有 apiKey 字段（与 dsh 官方 deepseek 适配器
 *   的 apiKeyEnv 模式一致——配置承载的是环境变量名，字面 key 不是配置值）。
 * - 本票（#27）只要求「解析就绪」，不消费该配置（视觉调用归桥接核心票 #28 / 看图票 #29）。
 */

/** 环境变量名（VISION_ENV.* 为各配置项的 env fallback；apiKey 的默认环境变量名）。 */
export const VISION_ENV = {
  protocol: 'PERISCOPE_VISION_PROTOCOL',
  baseUrl: 'PERISCOPE_VISION_BASE_URL',
  model: 'PERISCOPE_VISION_MODEL',
} as const;

/** apiKey 的默认环境变量名（与 Claude Code 版 PERISCOPE_API_KEY 一致）。 */
export const DEFAULT_VISION_API_KEY_ENV = 'PERISCOPE_API_KEY';

/** protocol 的缺省值：仅指请求形状（openai 兼容协议），不绑定任何服务商。 */
export const DEFAULT_VISION_PROTOCOL: Protocol = 'openai';

const VALID_PROTOCOLS: readonly Protocol[] = ['openai', 'anthropic', 'responses'];

/**
 * cordis.yml 配置段形状（全部可选）。刻意不含 apiKey——key 只能从 env 读。
 * 与 plugin.ts 的 schemastery Config schema 一一对应。
 */
export interface VisionConfigInput {
  /** 视觉端点协议；缺省经 env fallback 后回落到 openai。 */
  protocol?: Protocol;
  /** 视觉端点 baseUrl；缺省经 env PERISCOPE_VISION_BASE_URL 补齐。 */
  baseUrl?: string;
  /** 视觉端点模型；缺省经 env PERISCOPE_VISION_MODEL 补齐。 */
  model?: string;
  /** 承载视觉 apiKey 的环境变量名（默认 PERISCOPE_API_KEY）；key 本身只从该 env 读。 */
  apiKeyEnv?: string;
}

/** 可注入的环境变量面（与 process.env 同形），供离线测试注入。 */
export type VisionConfigEnv = Record<string, string | undefined>;

/** 解析后的视觉端点配置。apiKey 已按 apiKeyEnv 从 env 取出（可能为空串，本地端点无需鉴权）。 */
export interface ResolvedVisionConfig {
  protocol: Protocol;
  baseUrl: string;
  model: string;
  /** 实际用于读取 apiKey 的环境变量名（回显，便于 doctor/日志定位）。 */
  apiKeyEnv: string;
  apiKey: string;
}

/** 第一个「非空白字符串」候选；空白/缺省视为未配置。 */
function firstPresent(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return undefined;
}

/**
 * 解析视觉端点配置：cordis.yml（input）优先，env 兜底；apiKey 仅从 env 读取。
 * protocol 若解析出非法联合值（如 env 注入垃圾），回落到 openai。
 */
export function resolveVisionConfig(
  input: VisionConfigInput = {},
  env: VisionConfigEnv = {},
): ResolvedVisionConfig {
  const protocolRaw = firstPresent(input.protocol, env[VISION_ENV.protocol]);
  const protocol: Protocol = VALID_PROTOCOLS.includes(protocolRaw as Protocol)
    ? (protocolRaw as Protocol)
    : DEFAULT_VISION_PROTOCOL;
  const baseUrl = firstPresent(input.baseUrl, env[VISION_ENV.baseUrl]) ?? '';
  const model = firstPresent(input.model, env[VISION_ENV.model]) ?? '';
  const apiKeyEnv = firstPresent(input.apiKeyEnv) ?? DEFAULT_VISION_API_KEY_ENV;
  // apiKey 仅从 env 读取：即便 input 被强行塞入 apiKey 字段也绝不采用。
  const apiKey = firstPresent(env[apiKeyEnv]) ?? '';
  return { protocol, baseUrl, model, apiKeyEnv, apiKey };
}
