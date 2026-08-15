import { endpointMissingError, loadConfig, PeriscopeConfig } from '../config/config.js';
import { getProtocol } from '../protocols/index.js';
import { defaultTransport, HttpTransport } from '../transport.js';
import { resolveIntent } from './templates.js';

/**
 * dsh 版 describe 引擎 —— 主仓（Claude Code 版）src/core/describe.ts 的刻意副本（ADR 0003 决策 6）。
 *
 * 签名一致性对照清单（接口稳定后抽共享 npm 包是纯移动而非重构）：
 *   - describe(input, opts?): Promise<string>                 —— 与 Claude Code 版一致
 *   - describeMany(inputs, opts?): Promise<DescribeOutcome[]> —— 与 Claude Code 版一致（逐图容错聚合）
 *   - DescribeOutcome { source, description, error? }         —— 与 Claude Code 版一致
 *   - DescribeOptions { transport?, config?, configPath? }    —— 与 Claude Code 版一致；
 *       移除 cacheDir：字节输入无本地文件可 stat；content-addressed 缓存归桥接核心票 #28（attachmentId 属桥接层）
 *   - DescribeInput 唯一刻意差异：
 *       Claude Code 版 imagePath: string（本地路径 / http(s) URL）
 *       → 本版 bytes: Uint8Array + mimeType? + source?（图片字节 + 可选调用方标识，逐图聚合时回显为 source）
 *   - 任务模板（TASK_TEMPLATES / resolveIntent）、三协议适配器（ProtocolAdapter / BuildRequestInput /
 *     BuiltRequest / getProtocol）、HttpTransport、PeriscopeConfig / loadConfig —— 逐字拷贝，签名一致。
 */
export interface DescribeInput {
  /** 图片字节内容（桥接层从 dsh durable attachment 取回后传入）。 */
  bytes: Uint8Array;
  /** 图片 MIME 类型（如 'image/png'），构造 data URL 用；缺省 'image/png'。 */
  mimeType?: string;
  /** 调用方标识（如消息内图片序号）：逐图聚合时回显到 DescribeOutcome.source，供宿主定位失败项。 */
  source?: string;
  intent?: string;
}

export interface DescribeOptions {
  /** 注入 HTTP 传输（默认使用全局 fetch）。 */
  transport?: HttpTransport;
  /** 显式传入配置（跳过 loadConfig），供测试注入与桥接层传入 dsh Config 映射结果。 */
  config?: PeriscopeConfig;
  /** 配置路径覆盖（等价于 PERISCOPE_CONFIG，优先级更高）。 */
  configPath?: string;
}

function endpointFor(config: PeriscopeConfig): { baseUrl: string; model: string } {
  const error = endpointMissingError(config.protocol, config[config.protocol]);
  if (error !== null) throw new Error(error);
  const endpoint = config[config.protocol];
  return { baseUrl: String(endpoint.baseUrl), model: String(endpoint.model) };
}

function truncate(text: string, max = 200): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

/** 图片字节 → 请求用 data URL（data:<mime>;base64,<...>）。 */
function bytesToImageDataUrl(bytes: Uint8Array, mimeType = 'image/png'): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

/**
 * 协议无关核心：单图视觉描述（图片字节输入）。
 * 流程：加载配置（懒创建 + 环境变量优先）→ 按协议取适配器 → 校验端点（空白模板尽早给出可操作报错）
 * → 任务模板解析 intent（命中 ocr/table/chart 替换为模板 prompt）→ 字节转 data URL → 适配器构造请求
 * → 传输发出 → 非 2xx 抛错、2xx 容错提取文本。
 * 本副本不含任何缓存：content-addressed 缓存归桥接核心票 #28。
 */
export async function describe(
  input: DescribeInput,
  opts: DescribeOptions = {},
): Promise<string> {
  const config = opts.config ?? loadConfig({ configPath: opts.configPath });
  const adapter = getProtocol(config.protocol);
  const transport = opts.transport ?? defaultTransport;
  // 先校验端点：空白模板（未配置 baseUrl/model）应尽早给出可操作报错，而不是等到构造请求之后。
  const { baseUrl, model } = endpointFor(config);
  // 任务模板解析：命中模板名（ocr/table/chart）替换为模板 prompt，自定义文本原样透传，缺省保持默认描述。
  const intent = resolveIntent(input.intent);
  const imageDataUrl = bytesToImageDataUrl(input.bytes, input.mimeType);

  const request = adapter.buildRequest({
    baseUrl,
    model,
    imageDataUrl,
    intent,
    apiKey: config.apiKey || undefined,
  });

  const response = await transport.post(request);
  if (!response.ok) {
    throw new Error(`视觉端点返回 HTTP ${response.status}: ${truncate(response.text)}`);
  }
  return adapter.extractText(response.text);
}

/** 多图容错聚合的单项结果：每项含图片标识；成功时 description 为描述文本，失败时为 null 并附 error 原因。 */
export interface DescribeOutcome {
  /** 回显 DescribeInput.source；未传时为「图片 N」（N 为 1 起始的输入序号）。 */
  source: string;
  /** 成功时的描述文本；失败时为 null。 */
  description: string | null;
  /** 失败原因（仅失败时存在），供宿主输出错误信息。 */
  error?: string;
}

/**
 * 多图并行视觉描述：逐图容错聚合，按输入顺序返回结果。
 * 单图失败不丢弃其余成功结果——失败项 description 为 null 并附 error，调用方自行决定如何呈现。
 */
export async function describeMany(
  inputs: DescribeInput[],
  opts: DescribeOptions = {},
): Promise<DescribeOutcome[]> {
  const settled = await Promise.allSettled(
    inputs.map((input) => describe(input, opts)),
  );
  return settled.map((result, i) => ({
    source: inputs[i].source ?? `图片 ${i + 1}`,
    description: result.status === 'fulfilled' ? result.value : null,
    error:
      result.status === 'rejected'
        ? result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
        : undefined,
  }));
}
