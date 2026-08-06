import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/** 缓存目录：PERISCOPE_CACHE_DIR 优先，默认 ~/.cache/periscope。 */
export function defaultCacheDir(): string {
  return (
    process.env.PERISCOPE_CACHE_DIR ??
    path.join(os.homedir(), '.cache', 'periscope')
  );
}

/**
 * 图片描述缓存 key：绝对路径 + 修改时间 + 大小 → sha256 哈希。
 * 图片变化（路径 / 修改时间 / 大小任一变化）key 即变，从而自动失效。
 */
export function imageCacheKey(imagePath: string): string {
  const resolved = path.resolve(imagePath);
  let stat: { mtimeMs: number; size: number };
  try {
    stat = fs.statSync(resolved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`无法读取图片文件: ${resolved}（${reason}）`);
  }
  const seed = `${resolved}\n${stat.mtimeMs}\n${stat.size}`;
  return crypto.createHash('sha256').update(seed).digest('hex');
}

function entryPath(cacheDir: string, key: string): string {
  return path.join(cacheDir, `${key}.txt`);
}

/** 读取缓存条目；未命中返回 undefined。 */
export function readCacheEntry(key: string, cacheDir: string): string | undefined {
  const filePath = entryPath(cacheDir, key);
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath).toString('utf8');
}

/** 写入缓存条目（目录不存在时递归创建）。 */
export function writeCacheEntry(key: string, value: string, cacheDir: string): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(entryPath(cacheDir, key), value);
}
