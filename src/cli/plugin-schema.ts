import * as fs from 'node:fs';
import * as path from 'node:path';

/** Agent Plugins 1.0.0 根 plugin.json schema 的规范 URL。 */
export const PLUGIN_SCHEMA_URL = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

/** schema 缓存有效期：7 天（mtime 距今 < TTL 视为新鲜）。 */
export const SCHEMA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 缓存文件名（存于缓存目录下，与图片缓存同目录不同名）。 */
export const SCHEMA_CACHE_FILENAME = 'agent-plugins.schema.json';

/** fetch 的最小结构类型：兼容 Node 全局 fetch 返回的 Response。 */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** schema 缓存文件的绝对路径。 */
export function pluginSchemaCachePath(cacheDir: string): string {
  return path.join(cacheDir, SCHEMA_CACHE_FILENAME);
}

/** 缓存是否新鲜：文件存在且 mtime 距今 < TTL。 */
export function isSchemaCacheFresh(
  cachePath: string,
  now = Date.now(),
  ttlMs = SCHEMA_TTL_MS,
): boolean {
  try {
    return now - fs.statSync(cachePath).mtimeMs < ttlMs;
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isObject(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true; // 未知类型不做约束
  }
}

function constMatches(value: unknown, expected: unknown): boolean {
  return JSON.stringify(value) === JSON.stringify(expected);
}

/**
 * 递归校验一个节点：按 schema 的约束子集（type / const / required / properties /
 * additionalProperties / minLength / maxLength / pattern / items）检查，把错误推入 errors。
 * path 形如 `$`、`$.name`、`$.author.email`、`$.keywords[0]`，用于不合规时的来源提示。
 */
function validateNode(
  node: unknown,
  schema: Record<string, unknown>,
  nodePath: string,
  errors: string[],
): void {
  if (schema.const !== undefined && !constMatches(node, schema.const)) {
    errors.push(`${nodePath}: 必须等于 ${JSON.stringify(schema.const)}`);
    return;
  }
  if (typeof schema.type === 'string') {
    if (!typeMatches(node, schema.type)) {
      errors.push(
        `${nodePath}: 类型应为 ${schema.type}，实际为 ${
          Array.isArray(node) ? 'array' : typeof node
        }`,
      );
      return;
    }
  }
  if (typeof node === 'string') {
    if (typeof schema.minLength === 'number' && node.length < schema.minLength) {
      errors.push(`${nodePath}: 长度小于 minLength ${schema.minLength}`);
    }
    if (typeof schema.maxLength === 'number' && node.length > schema.maxLength) {
      errors.push(`${nodePath}: 长度大于 maxLength ${schema.maxLength}`);
    }
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(node)) {
          errors.push(`${nodePath}: 不符合 pattern ${schema.pattern}`);
        }
      } catch {
        // schema 携带非法正则时不硬失败，跳过该约束
      }
    }
  }
  if (Array.isArray(node) && isObject(schema.items)) {
    node.forEach((item, index) => {
      validateNode(item, schema.items as Record<string, unknown>, `${nodePath}[${index}]`, errors);
    });
    return;
  }
  if (isObject(node)) {
    const properties = isObject(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
    for (const key of Object.keys(node)) {
      if (key in properties) {
        validateNode(
          (node as Record<string, unknown>)[key],
          properties[key] as Record<string, unknown>,
          `${nodePath}.${key}`,
          errors,
        );
      } else if (schema.additionalProperties === false) {
        errors.push(`${nodePath}.${key}: 不允许的字段`);
      } else if (isObject(schema.additionalProperties)) {
        validateNode(
          (node as Record<string, unknown>)[key],
          schema.additionalProperties,
          `${nodePath}.${key}`,
          errors,
        );
      }
    }
    if (Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (typeof required === 'string' && !(required in node)) {
          errors.push(`${nodePath}: 缺少必填字段 ${required}`);
        }
      }
    }
  }
}

/**
 * 手写 JSON Schema 约束解释器（不引入 ajv，保持零运行时依赖）：
 * 按下载的 schema 的约束子集校验 Agent Plugins 1.0.0 根 plugin.json manifest。
 * 返回错误信息数组；空数组 = 合规。每条错误带 JSON path，供「来源提示」使用。
 */
export function validatePluginManifest(manifest: unknown, schema: unknown): string[] {
  if (!isObject(schema)) {
    return ['schema 格式错误（应为对象）'];
  }
  const errors: string[] = [];
  validateNode(manifest, schema, '$', errors);
  return errors;
}

export interface LoadedSchema {
  schema: Record<string, unknown>;
  /** 来源：命中本地缓存（'cache'）或本次远程获取（'remote'）。 */
  source: 'cache' | 'remote';
}

/**
 * 加载 Agent Plugins 1.0.0 schema：
 * - 缓存新鲜（mtime < TTL）→ 直接读缓存，不发起网络请求
 * - 缓存缺失或过期 → 经 fetchFn 拉取远程，成功后写回缓存
 * - 获取/解析失败 → 抛错（调用方降级为 ⚠️，不硬失败）
 */
export async function loadPluginSchema(
  cacheDir: string,
  fetchFn: FetchLike,
): Promise<LoadedSchema> {
  const cachePath = pluginSchemaCachePath(cacheDir);
  if (isSchemaCacheFresh(cachePath)) {
    const raw = fs.readFileSync(cachePath).toString('utf8');
    return { schema: JSON.parse(raw) as Record<string, unknown>, source: 'cache' };
  }
  const response = await fetchFn(PLUGIN_SCHEMA_URL);
  if (!response.ok) {
    throw new Error(`schema 获取失败（状态码 ${response.status}）`);
  }
  const schema = (await response.json()) as Record<string, unknown>;
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(schema, null, 2));
  return { schema, source: 'remote' };
}
