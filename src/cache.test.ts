import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultCacheDir, imageCacheKey, readCacheEntry, writeCacheEntry } from './cache';
import { makeTempDir, writeFixtureImage } from './testing/fixtures';

/** 临时设置/删除若干环境变量，测试结束自动还原。 */
function withEnv(
  env: Record<string, string | undefined>,
  fn: () => void,
): void {
  const saved = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    saved.set(key, process.env[key]);
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('defaultCacheDir 默认 HOME/.cache/periscope，且可被 PERISCOPE_CACHE_DIR 覆盖', () => {
  const dir = makeTempDir();
  withEnv({ PERISCOPE_CACHE_DIR: undefined, HOME: dir }, () => {
    assert.equal(defaultCacheDir(), path.join(dir, '.cache', 'periscope'));
  });
  const overridePath = path.join(dir, 'custom-cache');
  withEnv({ PERISCOPE_CACHE_DIR: overridePath }, () => {
    assert.equal(defaultCacheDir(), overridePath);
  });
});

test('imageCacheKey 确定性：同一图片两次计算得到相同 key', () => {
  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  assert.equal(imageCacheKey(imagePath), imageCacheKey(imagePath));
});

test('imageCacheKey 路径变化 → key 变化', () => {
  const dir = makeTempDir();
  const a = writeFixtureImage(dir, 'a.png');
  const b = writeFixtureImage(dir, 'b.png');
  assert.notEqual(imageCacheKey(a), imageCacheKey(b));
});

test('imageCacheKey 修改时间变化（大小不变）→ key 变化', () => {
  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const before = imageCacheKey(imagePath);
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(imagePath, past, past);
  const after = imageCacheKey(imagePath);
  assert.notEqual(before, after);
});

test('imageCacheKey 大小变化（修改时间还原）→ key 变化', () => {
  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const originalMtimeMs = fs.statSync(imagePath).mtimeMs;
  const before = imageCacheKey(imagePath);
  fs.writeFileSync(imagePath, 'changed-size-content');
  fs.utimesSync(imagePath, new Date(originalMtimeMs), new Date(originalMtimeMs));
  const after = imageCacheKey(imagePath);
  assert.notEqual(before, after);
});

test('writeCacheEntry 持久化 + readCacheEntry 读回；未命中返回 undefined', () => {
  const cacheDir = path.join(makeTempDir(), 'nested', 'cache');
  const key = 'abc123';
  assert.equal(readCacheEntry(key, cacheDir), undefined);
  writeCacheEntry(key, '图片里有一座山', cacheDir);
  assert.equal(readCacheEntry(key, cacheDir), '图片里有一座山');
  assert.ok(fs.existsSync(path.join(cacheDir, `${key}.txt`)), '缓存条目应落盘');
});
