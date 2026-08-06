import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadConfig, PeriscopeConfig } from '../config/config';
import { getProtocol } from '../protocols';
import { defaultTransport, HttpTransport } from '../transport';

export interface DescribeInput {
  imagePath: string;
  intent?: string;
}

export interface DescribeOptions {
  /** 注入 HTTP 传输（默认使用全局 fetch）。 */
  transport?: HttpTransport;
  /** 显式传入配置（跳过 loadConfig），供测试注入。 */
  config?: PeriscopeConfig;
  /** 配置路径覆盖（等价于 PERISCOPE_CONFIG，优先级更高）。 */
  configPath?: string;
}

function imageToDataUrl(imagePath: string): string {
  const resolved = path.resolve(imagePath);
  let data: { toString(encoding?: string): string };
  try {
    data = fs.readFileSync(resolved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`无法读取图片文件: ${resolved}（${reason}）`);
  }
  const ext = path.extname(resolved).toLowerCase().replace('.', '') || 'png';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  const base64 = data.toString('base64');
  return `data:image/${mime};base64,${base64}`;
}

function endpointFor(config: PeriscopeConfig): { baseUrl: string; model: string } {
  const endpoint = (config as any)[config.protocol];
  if (!endpoint || typeof endpoint !== 'object') {
    throw new Error(`配置缺少协议 ${config.protocol} 的 baseUrl/model`);
  }
  return { baseUrl: String(endpoint.baseUrl), model: String(endpoint.model) };
}

function truncate(text: string, max = 200): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

/**
 * 协议无关核心：单图视觉描述。
 * 流程：加载配置（懒创建 + 环境变量优先）→ 按协议取适配器 → 本地图片转 data URL
 * → 适配器构造请求 → 传输发出 → 非 2xx 抛错、2xx 容错提取文本。
 */
export async function describe(
  input: DescribeInput,
  opts: DescribeOptions = {},
): Promise<string> {
  const config = opts.config ?? loadConfig({ configPath: opts.configPath });
  const adapter = getProtocol(config.protocol);
  const transport = opts.transport ?? defaultTransport;

  const imageDataUrl = imageToDataUrl(input.imagePath);
  const { baseUrl, model } = endpointFor(config);

  const request = adapter.buildRequest({
    baseUrl,
    model,
    imageDataUrl,
    intent: input.intent,
    apiKey: config.apiKey || undefined,
  });

  const response = await transport.post(request);
  if (!response.ok) {
    throw new Error(`视觉端点返回 HTTP ${response.status}: ${truncate(response.text)}`);
  }
  return adapter.extractText(response.text);
}
