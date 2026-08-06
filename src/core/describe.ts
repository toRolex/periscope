import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultCacheDir, imageCacheKey, readCacheEntry, writeCacheEntry } from '../cache';
import { loadConfig, PeriscopeConfig } from '../config/config';
import { getProtocol } from '../protocols';
import { defaultTransport, HttpTransport } from '../transport';

export interface DescribeInput {
  /** 图片源：本地路径或 http(s) URL。 */
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
  /** 缓存目录覆盖（默认 ~/.cache/periscope）；传 null 关闭缓存。 */
  cacheDir?: string | null;
}

/** 远程图片 URL（http/https）判定；此类图片不落本地缓存、请求体直接透传 URL。 */
const REMOTE_URL_RE = /^https?:\/\//i;

/**
 * 把图片源转为请求用的 image_url：本地路径读取文件转 data URL；
 * http(s) URL 直接透传（视觉模型自行获取，无需先下载到本地）。
 */
function sourceToImageUrl(source: string): string {
  if (REMOTE_URL_RE.test(source)) {
    return source;
  }
  const resolved = path.resolve(source);
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
 * 流程：加载配置（懒创建 + 环境变量优先）→ 按协议取适配器 → 本地图片查缓存（key =
 * 图片路径+修改时间+大小+意图 哈希；远程 URL 不缓存）→ 未命中才转 data URL → 适配器构造请求
 * → 传输发出 → 非 2xx 抛错、2xx 容错提取文本 → 结果写回缓存。
 */
export async function describe(
  input: DescribeInput,
  opts: DescribeOptions = {},
): Promise<string> {
  const config = opts.config ?? loadConfig({ configPath: opts.configPath });
  const adapter = getProtocol(config.protocol);
  const transport = opts.transport ?? defaultTransport;
  const cacheDir = opts.cacheDir === undefined ? defaultCacheDir() : opts.cacheDir;

  let cache: { dir: string; key: string } | null = null;
  // 远程 URL 不落本地缓存：缓存 key 依赖本地文件 stat，且远程内容可变。
  if (cacheDir !== null && !REMOTE_URL_RE.test(input.imagePath)) {
    const key = imageCacheKey(input.imagePath, input.intent);
    cache = { dir: cacheDir, key };
    const cached = readCacheEntry(key, cacheDir);
    if (cached !== undefined) return cached;
  }

  const imageUrl = sourceToImageUrl(input.imagePath);
  const { baseUrl, model } = endpointFor(config);

  const request = adapter.buildRequest({
    baseUrl,
    model,
    imageDataUrl: imageUrl,
    intent: input.intent,
    apiKey: config.apiKey || undefined,
  });

  const response = await transport.post(request);
  if (!response.ok) {
    throw new Error(`视觉端点返回 HTTP ${response.status}: ${truncate(response.text)}`);
  }
  const text = adapter.extractText(response.text);
  if (cache !== null) writeCacheEntry(cache.key, text, cache.dir);
  return text;
}

/** 多图容错聚合的单项结果：每项含图片源；成功时 description 为描述文本，失败时为 null 并附 error 原因。 */
export interface DescribeOutcome {
  /** 图片源：本地路径或 http(s) URL。 */
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
    source: inputs[i].imagePath,
    description: result.status === 'fulfilled' ? result.value : null,
    error:
      result.status === 'rejected'
        ? result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
        : undefined,
  }));
}
