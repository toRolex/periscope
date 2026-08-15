import { Protocol } from '../protocols/types.js';

/**
 * periscope-dsh 的 cordis.yml 配置片段生成器（issue #30）。
 *
 * 本模块是 dsh 侧的「片段生成」便利脚本核心：不读 stdin、不发任何请求、纯函数离线可测。
 * 输出可粘贴进 cordis.yml 的 periscope-deepseek 行 config 段（protocol / baseUrl / model
 * 占位）+ env apiKey 指引（key 不写进配置，仅从环境变量读取，与 bridge/vision-config.ts
 * 的 dsh Config 决策一致）。Claude Code 侧的 init wizard 不动，双宿主并存。
 *
 * YAML 合法性：片段是一个单键 `config:` 映射文档（其余行均为注释），值经 yamlQuote 渲染，
 * 需要处双引号包裹，保证可被 cordis.yml 解析。
 */

/** 合法协议联合（与 schemastery Config schema / vision-config 一致）。 */
export const VALID_PROTOCOLS: readonly Protocol[] = ['openai', 'anthropic', 'responses'];

/** baseUrl 占位符：无默认端点，用户替换为自己的视觉端点。 */
export const DEFAULT_BASE_URL_PLACEHOLDER = 'https://your-vision-endpoint.example.com/v1';

/** model 占位符：无默认模型，用户替换为自己的视觉模型名。 */
export const DEFAULT_MODEL_PLACEHOLDER = 'your-vision-model';

/** apiKey 的默认环境变量名（与 bridge/vision-config.ts 一致）。 */
export const DEFAULT_API_KEY_ENV = 'PERISCOPE_API_KEY';

/** protocol 缺省：openai 兼容协议（仅请求形状，不绑定任何服务商）。 */
export const DEFAULT_PROTOCOL: Protocol = 'openai';

/** 生成器选项：全部可选，缺省用占位值。 */
export interface SnippetOptions {
  /** 视觉端点协议；缺省 openai。 */
  protocol?: Protocol;
  /** 视觉端点 baseUrl；缺省占位符。 */
  baseUrl?: string;
  /** 视觉端点模型名；缺省占位符。 */
  model?: string;
  /** 承载视觉 apiKey 的环境变量名；缺省 PERISCOPE_API_KEY。 */
  apiKeyEnv?: string;
}

const PROTOCOL_HINT = 'openai | anthropic | responses';

/** 纯标量起始字符歧义（列表/映射/锚点/标签/注释等）→ 需双引号。 */
const YAML_HEAD_NEEDS_QUOTE = /^[\s\-?:,\[\]{}#&*!|>'"%@`]/;
/** 纯标量内需引号的序列：冒号+空格、空格+#、控制空白。 */
const YAML_INNER_NEEDS_QUOTE = /: | #|\t|\n|\r/;
/** 会被 YAML 解析为布尔 / 空 / null 的裸词。 */
const YAML_AMBIGUOUS_WORDS = /^(?:true|false|null|~|yes|no|on|off)$/i;
/** 会被 YAML 解析为数字的裸词。 */
const YAML_NUMERIC = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/;

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * 把字符串安全渲染为 YAML 纯标量；必要处双引号包裹并转义。
 * 覆盖生成器的实际取值域（URL / 模型名 / 环境变量名 / 用户 CLI 注入值）。
 */
export function yamlQuote(value: string): string {
  if (value === '') return '""';
  if (YAML_HEAD_NEEDS_QUOTE.test(value)) return quote(value);
  if (YAML_INNER_NEEDS_QUOTE.test(value)) return quote(value);
  if (YAML_AMBIGUOUS_WORDS.test(value)) return quote(value);
  if (YAML_NUMERIC.test(value)) return quote(value);
  return value;
}

/**
 * 生成 cordis.yml 配置片段。
 * 输出结构：头部注释（粘贴位置 / 协议说明 / env fallback 说明）→ `config:` 映射块
 * （protocol / baseUrl / model / apiKeyEnv，全部可选，缺省由 env 兜底）→ 尾部注释
 * （apiKey 仅从环境变量读取的指引）。整段是合法 YAML：`config:` 为唯一顶层键。
 * 非法 protocol 直接抛错（fail-fast）。
 */
export function generateSnippet(options: SnippetOptions = {}): string {
  const protocol = options.protocol ?? DEFAULT_PROTOCOL;
  if (!VALID_PROTOCOLS.includes(protocol)) {
    throw new Error(`非法 protocol: ${protocol}（应为 ${PROTOCOL_HINT}）`);
  }
  const baseUrl = yamlQuote(options.baseUrl ?? DEFAULT_BASE_URL_PLACEHOLDER);
  const model = yamlQuote(options.model ?? DEFAULT_MODEL_PLACEHOLDER);
  const apiKeyEnv = yamlQuote(options.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
  const apiKeyEnvName = options.apiKeyEnv ?? DEFAULT_API_KEY_ENV;

  return [
    '# periscope-dsh 视觉端点配置片段（dsh 侧便利脚本生成，issue #30）',
    '# ------------------------------------------------------------',
    '# 粘贴位置：cordis.yml 的 periscope-deepseek 行 config 段，或 profile 的',
    `# cordis.patch.yml 同名段。protocol 可选 ${PROTOCOL_HINT}。`,
    '# config 段全部可选：缺省项由环境变量兜底（PERISCOPE_VISION_PROTOCOL /',
    '# PERISCOPE_VISION_BASE_URL / PERISCOPE_VISION_MODEL）。',
    'config:',
    `  protocol: ${protocol}`,
    `  baseUrl: ${baseUrl}`,
    `  model: ${model}`,
    `  apiKeyEnv: ${apiKeyEnv}`,
    '# ------------------------------------------------------------',
    '# apiKey 指引：key 不写进 cordis.yml，仅从环境变量读取。',
    `#   终端运行: export ${apiKeyEnvName}=sk-your-vision-key`,
    '# 若上方 config.apiKeyEnv 改为其它变量名，请 export 对应变量名。',
    '',
  ].join('\n');
}
