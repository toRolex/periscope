import { Protocol } from 'periscope-engine';

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

/** 字段是否非空白字符串（空白/缺省/非字符串均视为未配置）。settings-rpc 的来源标记复用此判定。 */
export function isPresent(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** 第一个「非空白字符串」候选；空白/缺省视为未配置。 */
function firstPresent(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    if (isPresent(candidate)) return (candidate as string).trim();
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

// ── #33 settings 命名空间作为第三来源（纯函数，零 dsh 耦合） ──────────────────

/**
 * settings 命名空间读出的 section 形状（与 VisionConfigInput 同形，全部可选）。
 * settings 命名空间与 cordis.yml 共享同一 schema 校验，故读出的值天然是 VisionConfigInput 形状。
 */
export type VisionSettingsSection = Partial<VisionConfigInput>;

/**
 * 归一化 settings 命名空间读出的值 → VisionConfigInput：只保留非空白字段，
 * 空白/缺省视为未配置，回落到更低优先级来源（cordis.yml / env）。
 * 零 dsh 耦合：不感知 dsh 运行时，仅做「非空筛选」，与 resolveVisionConfig 的
 * firstPresent 判定一致（空白串视为未配置）。
 */
export function normalizeSettingsSection(
  section: VisionSettingsSection | undefined | null,
): VisionConfigInput {
  if (section === undefined || section === null) return {};
  const out: VisionConfigInput = {};
  const protocol = firstPresent(section.protocol);
  if (protocol !== undefined) out.protocol = protocol as Protocol;
  const baseUrl = firstPresent(section.baseUrl);
  if (baseUrl !== undefined) out.baseUrl = baseUrl;
  const model = firstPresent(section.model);
  if (model !== undefined) out.model = model;
  const apiKeyEnv = firstPresent(section.apiKeyEnv);
  if (apiKeyEnv !== undefined) out.apiKeyEnv = apiKeyEnv;
  return out;
}

/**
 * 合并 settings 归一化输入与 cordis.yml 段为单个 VisionConfigInput：settings 逐字段
 * 优先，settings 缺省/空白时回落 cordis；两者皆缺省则该字段留空，交 resolveVisionConfig
 * 走 env fallback。不改写入参（纯函数）。
 */
export function mergeVisionInputs(
  cordis: VisionConfigInput,
  settings: VisionConfigInput,
): VisionConfigInput {
  const merged: VisionConfigInput = {};
  const protocol = firstPresent(settings.protocol, cordis.protocol);
  if (protocol !== undefined) merged.protocol = protocol as Protocol;
  const baseUrl = firstPresent(settings.baseUrl, cordis.baseUrl);
  if (baseUrl !== undefined) merged.baseUrl = baseUrl;
  const model = firstPresent(settings.model, cordis.model);
  if (model !== undefined) merged.model = model;
  const apiKeyEnv = firstPresent(settings.apiKeyEnv, cordis.apiKeyEnv);
  if (apiKeyEnv !== undefined) merged.apiKeyEnv = apiKeyEnv;
  return merged;
}

/**
 * 三来源汇入的视觉端点解析：settings 命名空间（user 层）> cordis.yml（base 层）> env fallback。
 * settingsSection 为 settings 命名空间读出的已解析段（installSettingsSection 的 setSource 注入，
 * user 层已叠在 base 层=cordis.yml entry 之上，故与 cordis 再合并是幂等覆盖；可能缺省/含空白），
 * 先归一化为 VisionConfigInput，再与 cordis.yml 逐字段合并，最后交 resolveVisionConfig 走 env
 * fallback 与 protocol 校验。apiKey 仅从 apiKeyEnv 命名的环境变量读取——settings/cordis 均无法
 * 注入字面 key。
 */
export function resolveVisionConfigWithSettings(
  cordis: VisionConfigInput = {},
  settingsSection: VisionSettingsSection | undefined | null = null,
  env: VisionConfigEnv = {},
): ResolvedVisionConfig {
  return resolveVisionConfig(
    mergeVisionInputs(cordis, normalizeSettingsSection(settingsSection)),
    env,
  );
}
